import hashlib
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.config import settings
from app.db.database import get_db
from app.domain.user.aggregate import User
from app.factories import build_auth_service, build_session_service
from app.limiter import limiter, login_email_throttle_exceeded
from app.middleware.auth import get_current_user, bearer_scheme, AUTH_COOKIE_NAME
from app.middleware.csrf import mint_csrf_cookie
from app.schemas.auth import (
    AuthMeResponse,
    AvatarUpdateRequest,
    ChangePasswordRequest,
    DisableMFARequest,
    LoginRequest,
    MFAChallengeRequest,
    MFAConfirmRequest,
    MFASetupRequest,
    MFASetupResponse,
    RegisterRequest,
    TokenResponse,
    UpdatePlayerNameRequest,
)
from app.infrastructure.audit_logger import record_audit_event

REFRESH_COOKIE_NAME = "refresh_token"

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _anon(identifier: object) -> str:
    """Stable, short fingerprint so logs stay correlatable without leaking PII."""
    return hashlib.sha256(str(identifier).encode("utf-8")).hexdigest()[:10]


def _set_auth_cookie(response: Response, token: str) -> None:
    # token is a signed JWT — not a plaintext credential.
    # httponly+secure+samesite attributes prevent JS access and transmission over plain HTTP.
    response.set_cookie(  # codeql[py/clear-text-storage-sensitive-data]
        key=AUTH_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=settings.access_token_expire_minutes * 60,
        path="/api",
    )


def _set_refresh_cookie(response: Response, token: str) -> None:
    # token is a cryptographically random opaque token (secrets.token_hex); only its
    # SHA-256 hash is stored server-side. httponly+secure+samesite+path-scoped attributes
    # prevent JS access and restrict transmission scope.
    response.set_cookie(  # codeql[py/clear-text-storage-sensitive-data]
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
    # M-05: if tokens are empty, account already existed and we sent a recovery
    # email (silent success to prevent enumeration). Return 201 same as new
    # registration but without setting auth cookies.
    is_new_user = bool(access_token)
    if is_new_user:
        logger.info("User registered: anon=%s", _anon(str(user.id)))
        record_audit_event(request, "REGISTER", user.id, {"email_anon": _anon(req.email), "role": user.role.value})
        _set_auth_cookie(response, access_token)
        _set_refresh_cookie(response, refresh_token)
        mint_csrf_cookie(response)
    else:
        # Existing account: return success response without auth tokens to
        # prevent enumeration. Client sees 201 (success) either way.
        logger.info("Registration attempt for existing account: anon=%s", _anon(req.email))
        record_audit_event(request, "REGISTER_EXISTING", user.id, {"email_anon": _anon(req.email)})
        mint_csrf_cookie(response)
    return TokenResponse(
        id=user.id if is_new_user else "",
        email=user.email if is_new_user else "",
        player_name=user.player_name if is_new_user else "",
        role=user.role.value if is_new_user else "",
        avatar_url=user.avatar_url if is_new_user else None,
        is_email_verified=user.is_email_verified if is_new_user else False,
    )


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
def login(request: Request, response: Response, req: LoginRequest, db: Session = Depends(get_db)):
    # B-SEC-12: layer a per-email throttle on top of per-IP rate-limiting and
    # per-account lockout. Refuse before authentication so a distributed
    # credential-stuffing attack against one account is bounded to
    # LOGIN_EMAIL_LIMIT attempts per minute regardless of source IP.
    if login_email_throttle_exceeded(req.email):
        # Log to the application logger only — writing an audit DB row on every
        # throttled request is an unbounded write amplification vector under a
        # credential-stuffing attack. The rate-limiter state already captures
        # the throttle; the application log is sufficient for forensics here.
        logger.warning("login throttled: anon=%s", _anon(req.email))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts for this account. Try again in a minute.",
        )
    try:
        user, token, mfa_required, refresh_token = build_auth_service(db).login(req.email, req.password)
        if mfa_required:
            logger.info("MFA challenge issued: anon=%s", _anon(str(user.id)))
            record_audit_event(request, "LOGIN_MFA_REQUIRED", user.id, {"email_anon": _anon(req.email)})
            return TokenResponse(
                id="",
                email="",
                player_name="",
                role="",
                mfa_required=True,
                mfa_token=token,
            )
        logger.info("User logged in: anon=%s", _anon(str(user.id)))
        record_audit_event(request, "LOGIN_SUCCESS", user.id, {"email_anon": _anon(req.email)})
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
        record_audit_event(request, "LOGIN_FAILURE", None, {"email_anon": _anon(req.email), "error_type": type(e).__name__})
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
            record_audit_event(request, "LOGOUT", None, {"status": "success"})
        except Exception as exc:
            # M1: revocation failure means the access JWT remains valid for
            # the rest of its TTL. Return 500 so the caller knows and can
            # retry; still clear cookies so the browser loses its session
            # (best-effort client-side logout even if server-side fails).
            logger.warning(
                "Logout token revocation failed: %s",
                type(exc).__name__,
                exc_info=exc,
            )
            record_audit_event(
                request,
                "LOGOUT",
                None,
                {"status": "failed_token_revocation", "error_type": type(exc).__name__},
            )
            err = JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content={"detail": "token_revocation_failed"},
            )
            _clear_auth_cookie(err)
            _clear_refresh_cookie(err)
            mint_csrf_cookie(err)
            return err
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
    response: Response,
    req: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    build_auth_service(db).change_password(current_user.id, req.current_password, req.new_password)
    logger.info("Password changed: id=%s", current_user.id)
    record_audit_event(request, "PASSWORD_CHANGE", current_user.id)
    # M2: close the current browser window; pv-bump already invalidates
    # outstanding access tokens on next use, but clearing the cookies
    # means the client cannot silently reuse the old token before it expires.
    _clear_auth_cookie(response)
    _clear_refresh_cookie(response)


@router.get("/me", response_model=AuthMeResponse)
@limiter.limit("30/minute")
def get_me(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ia_unlock_earned = build_session_service(db).has_correct_ia_session(current_user.id)
    return AuthMeResponse(
        id=current_user.id,
        email=current_user.email,
        player_name=current_user.player_name,
        role=current_user.role.value,
        created_at=current_user.created_at,
        avatar_url=current_user.avatar_url,
        is_email_verified=current_user.is_email_verified,
        mfa_enabled=current_user.mfa_enabled,
        ia_unlock_earned=ia_unlock_earned,
        ia_recent_accuracy=current_user.ia_recent_accuracy,
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
    req: MFASetupRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _secret, provisioning_uri = build_auth_service(db).setup_mfa(current_user.id, req.current_password)
    record_audit_event(request, "MFA_SETUP_INITIATED", current_user.id)
    return MFASetupResponse(provisioning_uri=provisioning_uri)


@router.post("/mfa/confirm", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("5/minute")
def mfa_confirm(
    request: Request,
    req: MFAConfirmRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    build_auth_service(db).confirm_mfa(current_user.id, req.current_password, req.code)
    logger.info("MFA enabled: id=%s", current_user.id)
    record_audit_event(request, "MFA_ENABLED", current_user.id)


@router.post("/mfa/disable", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("5/minute")
def mfa_disable(
    request: Request,
    req: DisableMFARequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    build_auth_service(db).disable_mfa(current_user.id, req.current_password, req.code)
    logger.info("MFA disabled: id=%s", current_user.id)
    record_audit_event(request, "MFA_DISABLED", current_user.id)


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
        record_audit_event(request, "LOGIN_SUCCESS_MFA", user.id)
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
        record_audit_event(request, "MFA_CHALLENGE_FAILURE", None, {"error_type": type(e).__name__})
        raise
