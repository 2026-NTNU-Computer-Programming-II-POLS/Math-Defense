import hashlib
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.config import settings
from app.db.database import get_db
from app.domain.user.aggregate import User
from app.factories import build_auth_service
from app.limiter import limiter
from app.middleware.auth import get_current_user, bearer_scheme, AUTH_COOKIE_NAME
from app.middleware.csrf import mint_csrf_cookie

REFRESH_COOKIE_NAME = "refresh_token"
from app.schemas.auth import (
    AuthMeResponse,
    AvatarUpdateRequest,
    ChangePasswordRequest,
    DisableMFARequest,
    LoginRequest,
    MFAChallengeRequest,
    MFAConfirmRequest,
    MFASetupResponse,
    RegisterRequest,
    TokenResponse,
    UpdatePlayerNameRequest,
)
from app.infrastructure.audit_logger import record_audit_event

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _anon(identifier: str) -> str:
    """Stable, short fingerprint so logs stay correlatable without leaking PII."""
    return hashlib.sha256(identifier.encode("utf-8")).hexdigest()[:10]


def _set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=settings.access_token_expire_minutes * 60,
        path="/api",
    )


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=settings.refresh_token_expire_days * 86400,
        path="/api/auth/refresh",
    )


def _clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(
        key=AUTH_COOKIE_NAME,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/api",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=REFRESH_COOKIE_NAME,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/api/auth/refresh",
    )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def register(request: Request, response: Response, req: RegisterRequest, db: Session = Depends(get_db)):
    user, access_token, refresh_token = build_auth_service(db).register(
        email=req.email,
        password=req.password,
        player_name=req.player_name,
        role=req.role,
    )
    logger.info("User registered: anon=%s", _anon(str(user.id)))
    record_audit_event(db, request, "REGISTER", user.id, {"email": req.email, "role": user.role.value})
    _set_auth_cookie(response, access_token)
    _set_refresh_cookie(response, refresh_token)
    mint_csrf_cookie(response)
    return TokenResponse(
        id=user.id,
        email=user.email,
        player_name=user.player_name,
        role=user.role.value,
        avatar_url=user.avatar_url,
        is_email_verified=user.is_email_verified,
    )


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
def login(request: Request, response: Response, req: LoginRequest, db: Session = Depends(get_db)):
    try:
        user, token, mfa_required, refresh_token = build_auth_service(db).login(req.email, req.password)
        if mfa_required:
            logger.info("MFA challenge issued: anon=%s", _anon(str(user.id)))
            record_audit_event(db, request, "LOGIN_MFA_REQUIRED", user.id, {"email": req.email})
            return TokenResponse(
                id="",
                email="",
                player_name="",
                role="",
                mfa_required=True,
                mfa_token=token,
            )
        logger.info("User logged in: anon=%s", _anon(str(user.id)))
        record_audit_event(db, request, "LOGIN_SUCCESS", user.id, {"email": req.email})
        _set_auth_cookie(response, token)
        _set_refresh_cookie(response, refresh_token)
        mint_csrf_cookie(response)
        return TokenResponse(
            id=user.id,
            email=user.email,
            player_name=user.player_name,
            role=user.role.value,
            avatar_url=user.avatar_url,
            is_email_verified=user.is_email_verified,
        )
    except Exception as e:
        record_audit_event(db, request, "LOGIN_FAILURE", None, {"email": req.email, "error_type": type(e).__name__})
        db.commit()
        raise


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
def logout(
    request: Request,
    response: Response,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    token = request.cookies.get(AUTH_COOKIE_NAME)
    if not token and credentials:
        token = credentials.credentials
    refresh_token = request.cookies.get(REFRESH_COOKIE_NAME)
    if token:
        try:
            build_auth_service(db).logout_token(token, refresh_token)
            record_audit_event(db, request, "LOGOUT", None, {"status": "success"})
        except Exception as exc:
            logger.debug("Logout token revocation failed; proceeding with client-side logout", exc_info=exc)
            record_audit_event(db, request, "LOGOUT", None, {"status": "failed_token_revocation"})
    _clear_auth_cookie(response)
    _clear_refresh_cookie(response)
    mint_csrf_cookie(response)


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("30/minute")
def refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    raw_refresh = request.cookies.get(REFRESH_COOKIE_NAME)
    if not raw_refresh:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No refresh token")
    user, access_token, new_refresh_token = build_auth_service(db).refresh_access_token(raw_refresh)
    _set_auth_cookie(response, access_token)
    _set_refresh_cookie(response, new_refresh_token)
    mint_csrf_cookie(response)
    return TokenResponse(
        id=user.id,
        email=user.email,
        player_name=user.player_name,
        role=user.role.value,
        avatar_url=user.avatar_url,
        is_email_verified=user.is_email_verified,
    )


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("5/minute")
def change_password(
    request: Request,
    req: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    build_auth_service(db).change_password(current_user.id, req.current_password, req.new_password)
    logger.info("Password changed: id=%s", current_user.id)
    record_audit_event(db, request, "PASSWORD_CHANGE", current_user.id)


@router.get("/me", response_model=AuthMeResponse)
@limiter.limit("30/minute")
def get_me(request: Request, current_user: User = Depends(get_current_user)):
    return AuthMeResponse(
        id=current_user.id,
        email=current_user.email,
        player_name=current_user.player_name,
        role=current_user.role.value,
        created_at=current_user.created_at,
        avatar_url=current_user.avatar_url,
        is_email_verified=current_user.is_email_verified,
        mfa_enabled=current_user.mfa_enabled,
    )


@router.put("/profile/name", response_model=AuthMeResponse)
@limiter.limit("10/minute")
def update_player_name(
    request: Request,
    req: UpdatePlayerNameRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user = build_auth_service(db).update_player_name(current_user.id, req.player_name)
    return AuthMeResponse(
        id=user.id,
        email=user.email,
        player_name=user.player_name,
        role=user.role.value,
        created_at=user.created_at,
        avatar_url=user.avatar_url,
        is_email_verified=user.is_email_verified,
        mfa_enabled=user.mfa_enabled,
    )


@router.put("/profile/avatar", response_model=AuthMeResponse)
@limiter.limit("10/minute")
def update_avatar(
    request: Request,
    req: AvatarUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user = build_auth_service(db).update_avatar(current_user.id, req.avatar_url)
    return AuthMeResponse(
        id=user.id,
        email=user.email,
        player_name=user.player_name,
        role=user.role.value,
        created_at=user.created_at,
        avatar_url=user.avatar_url,
        is_email_verified=user.is_email_verified,
        mfa_enabled=user.mfa_enabled,
    )


# ── Email verification ──────────────────────────────────────────────────────

@router.get("/verify-email", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("10/minute")
def verify_email(
    request: Request,
    token: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
):
    build_auth_service(db).verify_email(token)
    logger.info("Email verified via token")


@router.post("/resend-verification", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("3/minute")
def resend_verification(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    build_auth_service(db).resend_verification_email(current_user.id)


# ── MFA (TOTP) ──────────────────────────────────────────────────────────────

@router.post("/mfa/setup", response_model=MFASetupResponse)
@limiter.limit("5/minute")
def mfa_setup(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _secret, provisioning_uri = build_auth_service(db).setup_mfa(current_user.id)
    record_audit_event(db, request, "MFA_SETUP_INITIATED", current_user.id)
    return MFASetupResponse(provisioning_uri=provisioning_uri)


@router.post("/mfa/confirm", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("5/minute")
def mfa_confirm(
    request: Request,
    req: MFAConfirmRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    build_auth_service(db).confirm_mfa(current_user.id, req.code)
    logger.info("MFA enabled: id=%s", current_user.id)
    record_audit_event(db, request, "MFA_ENABLED", current_user.id)


@router.post("/mfa/disable", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("5/minute")
def mfa_disable(
    request: Request,
    req: DisableMFARequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    build_auth_service(db).disable_mfa(current_user.id, req.current_password)
    logger.info("MFA disabled: id=%s", current_user.id)
    record_audit_event(db, request, "MFA_DISABLED", current_user.id)


@router.post("/mfa/challenge", response_model=TokenResponse)
@limiter.limit("10/minute")
def mfa_challenge(
    request: Request,
    response: Response,
    req: MFAChallengeRequest,
    db: Session = Depends(get_db),
):
    try:
        user, access_token, refresh_token = build_auth_service(db).verify_mfa_challenge(req.mfa_token, req.code)
        logger.info("MFA challenge passed: anon=%s", _anon(str(user.id)))
        record_audit_event(db, request, "LOGIN_SUCCESS_MFA", user.id)
        _set_auth_cookie(response, access_token)
        _set_refresh_cookie(response, refresh_token)
        mint_csrf_cookie(response)
        return TokenResponse(
            id=user.id,
            email=user.email,
            player_name=user.player_name,
            role=user.role.value,
            avatar_url=user.avatar_url,
            is_email_verified=user.is_email_verified,
        )
    except Exception as e:
        record_audit_event(db, request, "MFA_CHALLENGE_FAILURE", None, {"error_type": type(e).__name__})
        db.commit()
        raise
