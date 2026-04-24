import hashlib
import logging

from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.config import settings
from app.db.database import get_db
from app.domain.user.aggregate import User
from app.factories import build_auth_service
from app.limiter import limiter
from app.middleware.auth import get_current_user, bearer_scheme, AUTH_COOKIE_NAME
from app.schemas.auth import AuthMeResponse, ChangePasswordRequest, LoginRequest, RegisterRequest, TokenResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _anon(username: str) -> str:
    """Stable, short fingerprint of a username so logs stay correlatable without leaking it."""
    return hashlib.sha256(username.encode("utf-8")).hexdigest()[:10]


def _set_auth_cookie(response: Response, token: str) -> None:
    """Set the JWT as an HTTP-only, Secure, SameSite=Lax cookie."""
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=settings.access_token_expire_minutes * 60,
        path="/api",
    )


def _clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(
        key=AUTH_COOKIE_NAME,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/api",
    )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def register(request: Request, response: Response, req: RegisterRequest, db: Session = Depends(get_db)):
    # UsernameTakenError → 409 via the global DomainError handler.
    user, token = build_auth_service(db).register(req.username, req.password)
    logger.info("User registered: id=%s", user.id)
    _set_auth_cookie(response, token)
    return TokenResponse(id=user.id, username=user.username)


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
def login(request: Request, response: Response, req: LoginRequest, db: Session = Depends(get_db)):
    # InvalidCredentialsError → 401 via the global DomainError handler.
    user, token = build_auth_service(db).login(req.username, req.password)
    logger.info("User logged in: id=%s", user.id)
    _set_auth_cookie(response, token)
    return TokenResponse(id=user.id, username=user.username)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
def logout(
    request: Request,
    response: Response,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    # Prefer cookie; fall back to Bearer header.
    token = request.cookies.get(AUTH_COOKIE_NAME)
    if not token and credentials:
        token = credentials.credentials
    if token:
        try:
            build_auth_service(db).logout_token(token)
        except Exception:
            # Token revocation is best-effort. An expired or invalid token is
            # harmless — the important part is clearing the cookie below. If we
            # let DomainError (401) propagate, the frontend 401-interceptor
            # would call logout again, creating an infinite loop.
            pass
    _clear_auth_cookie(response)


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("5/minute")
def change_password(
    request: Request,
    req: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # InvalidCredentialsError → 401 via the global DomainError handler.
    build_auth_service(db).change_password(current_user.id, req.current_password, req.new_password)
    logger.info("Password changed: id=%s", current_user.id)


@router.get("/me", response_model=AuthMeResponse)
@limiter.limit("30/minute")
def get_me(request: Request, current_user: User = Depends(get_current_user)):
    return AuthMeResponse(
        id=current_user.id,
        username=current_user.username,
        created_at=current_user.created_at,
    )
