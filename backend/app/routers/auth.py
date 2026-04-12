import hashlib
import logging

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from app.application.auth_service import AuthApplicationService
from app.db.database import get_db
from app.domain.user.aggregate import User
from app.infrastructure.persistence.user_repository import SqlAlchemyUserRepository
from app.infrastructure.unit_of_work import SqlAlchemyUnitOfWork
from app.limiter import limiter
from app.middleware.auth import get_current_user
from app.schemas.auth import AuthMeResponse, LoginRequest, RegisterRequest, TokenResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _anon(username: str) -> str:
    """Stable, short fingerprint of a username so logs stay correlatable without leaking it."""
    return hashlib.sha256(username.encode("utf-8")).hexdigest()[:10]


def _get_service(db: Session) -> AuthApplicationService:
    return AuthApplicationService(
        user_repo=SqlAlchemyUserRepository(db),
        uow=SqlAlchemyUnitOfWork(db),
    )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def register(request: Request, req: RegisterRequest, db: Session = Depends(get_db)):
    # UsernameTakenError → 409 via the global DomainError handler.
    user, token = _get_service(db).register(req.username, req.password)
    logger.info("User registered: id=%s", user.id)
    return TokenResponse(access_token=token, username=user.username)


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
def login(request: Request, req: LoginRequest, db: Session = Depends(get_db)):
    # InvalidCredentialsError → 401 via the global DomainError handler.
    user, token = _get_service(db).login(req.username, req.password)
    logger.info("User logged in: id=%s", user.id)
    return TokenResponse(access_token=token, username=user.username)


@router.get("/me", response_model=AuthMeResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return AuthMeResponse(
        id=current_user.id,
        username=current_user.username,
        created_at=current_user.created_at,
    )
