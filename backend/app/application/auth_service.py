"""AuthApplicationService — user registration, login, and token authentication"""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, UTC
from typing import TYPE_CHECKING

from sqlalchemy.exc import IntegrityError

from app.domain.errors import (
    AccountDisabledError,
    AccountLockedError,
    DomainValueError,
    InvalidCredentialsError,
    InvalidMFACodeError,
    InvalidTokenError,
    MFAAlreadyEnabledError,
    MFANotSetupError,
    UserNotFoundError,
)
from app.domain.user.aggregate import User
from app.domain.user.value_objects import Email, Role
from app.utils import totp as totp_utils
from app.utils.security import (
    hash_password,
    verify_password,
    create_access_token,
    decode_token,
)

if TYPE_CHECKING:
    from app.domain.auth.repository import (
        EmailService,
        EmailVerificationRepository,
        LoginAttemptRepository,
        TokenDenylistRepository,
    )
    from app.domain.user.repository import UserRepository
    from app.infrastructure.unit_of_work import SqlAlchemyUnitOfWork

logger = logging.getLogger(__name__)

_DUMMY_PASSWORD_HASH = hash_password("__timing_equaliser__")
_EMAIL_VERIFICATION_TTL_HOURS = 24
_MFA_CHALLENGE_TTL_MINUTES = 5


class AuthApplicationService:

    def __init__(
        self,
        user_repo: UserRepository,
        login_attempt_repo: LoginAttemptRepository,
        token_denylist_repo: TokenDenylistRepository,
        email_verification_repo: EmailVerificationRepository,
        email_svc: EmailService,
        uow: SqlAlchemyUnitOfWork,
    ) -> None:
        self._user_repo = user_repo
        self._login_attempts = login_attempt_repo
        self._token_denylist = token_denylist_repo
        self._email_verification_repo = email_verification_repo
        self._email_svc = email_svc
        self._uow = uow

    # ── Registration ────────────────────────────────────────────────────────

    def register(
        self,
        email: str,
        password: str,
        player_name: str,
        role: str = "student",
    ) -> tuple[User, str]:
        """Create a new user and issue an access token. Returns (user, token)."""
        try:
            email_vo = Email(email)
        except ValueError as e:
            raise DomainValueError(str(e)) from e

        try:
            role_enum = Role(role)
        except ValueError:
            raise DomainValueError(f"Invalid role: {role}. Must be one of: admin, teacher, student")

        password_hash = hash_password(password)
        with self._uow:
            if self._user_repo.find_by_email(email_vo.value):
                raise DomainValueError("Email already registered")
            user = User.create(
                email=email_vo.value,
                player_name=player_name,
                role=role_enum,
                password_hash=password_hash,
            )
            self._user_repo.save(user)
            verification_token = self._create_verification_token(user.id)
            try:
                self._uow.commit()
            except IntegrityError as e:
                raise DomainValueError("Email already registered") from e

        try:
            self._email_svc.send_verification_email(user.email, user.player_name, verification_token)
        except Exception:
            logger.warning("Failed to send verification email for user %s", user.id)

        token = create_access_token({"sub": user.id, "role": user.role.value, "pv": user.password_version})
        return user, token

    def _create_verification_token(self, user_id: str) -> str:
        """Generate a fresh token; invalidates any pending tokens for this user first."""
        self._email_verification_repo.invalidate_for_user(user_id)
        raw = secrets.token_hex(32)
        expires_at = datetime.now(UTC) + timedelta(hours=_EMAIL_VERIFICATION_TTL_HOURS)
        self._email_verification_repo.create(user_id, raw, expires_at)
        return raw

    # ── Login ───────────────────────────────────────────────────────────────

    def login(self, email: str, password: str) -> tuple[User, str, bool]:
        """Authenticate credentials and issue an access token.

        Returns (user, token, mfa_required).
        When mfa_required is True, token is a short-lived MFA challenge JWT;
        the caller must verify a TOTP code via verify_mfa_challenge() to get
        a full access token.
        """
        email_lower = email.strip().lower()
        with self._uow:
            if self._login_attempts.is_locked(email_lower):
                raise AccountLockedError(
                    "Account temporarily locked due to too many failed attempts. "
                    "Try again in a few minutes."
                )

            user = self._user_repo.find_by_email(email_lower)
            if user is None:
                verify_password(password, _DUMMY_PASSWORD_HASH)
                self._login_attempts.record_failure(email_lower)
                self._uow.commit()
                raise InvalidCredentialsError("Invalid email or password")
            if not verify_password(password, user.password_hash):
                self._login_attempts.record_failure(email_lower)
                self._uow.commit()
                raise InvalidCredentialsError("Invalid email or password")
            if not user.is_active:
                raise AccountDisabledError("This account has been disabled")
            self._login_attempts.clear(email_lower)
            self._uow.commit()

        if user.mfa_enabled:
            mfa_token = create_access_token(
                {"sub": user.id, "role": user.role.value, "pv": user.password_version, "type": "mfa_challenge"},
                expires_delta=timedelta(minutes=_MFA_CHALLENGE_TTL_MINUTES),
            )
            return user, mfa_token, True

        token = create_access_token({"sub": user.id, "role": user.role.value, "pv": user.password_version})
        return user, token, False

    # ── Token auth ──────────────────────────────────────────────────────────

    def authenticate_token(self, token: str) -> User:
        """Decode a bearer token and return the owning user."""
        payload = decode_token(token)
        if payload is None:
            raise InvalidTokenError("Token is invalid or expired")
        # MFA challenge tokens must never grant resource access.
        if payload.get("type") == "mfa_challenge":
            raise InvalidTokenError("Token is not a full access token")
        jti = payload.get("jti")
        if jti and self._token_denylist.is_denied(jti):
            raise InvalidTokenError("Token has been revoked")
        user_id = payload.get("sub")
        if not user_id:
            raise InvalidTokenError("Token format error")
        user = self._user_repo.find_by_id(user_id)
        if user is None:
            raise UserNotFoundError("User not found")
        if not user.is_active:
            raise AccountDisabledError("This account has been disabled")
        token_pv = payload.get("pv", 0)
        if token_pv != user.password_version:
            raise InvalidTokenError("Token has been invalidated by a password change")
        return user

    def logout_token(self, token: str) -> None:
        """Revoke a token by adding its JTI to the deny-list."""
        payload = decode_token(token)
        if payload is None:
            return
        jti = payload.get("jti")
        exp = payload.get("exp", 0)
        if not jti:
            return
        with self._uow:
            self._token_denylist.deny(jti, float(exp))
            self._uow.commit()

    # ── Profile mutations ───────────────────────────────────────────────────

    def change_password(self, user_id: str, current_password: str, new_password: str) -> None:
        with self._uow:
            user = self._user_repo.find_by_id(user_id)
            if user is None:
                raise UserNotFoundError("User not found")
            if not verify_password(current_password, user.password_hash):
                raise InvalidCredentialsError("Current password is incorrect")
            user.password_hash = hash_password(new_password)
            user.password_version += 1
            self._user_repo.save(user)
            self._uow.commit()

    def update_player_name(self, user_id: str, player_name: str) -> User:
        with self._uow:
            user = self._user_repo.find_by_id(user_id)
            if user is None:
                raise UserNotFoundError("User not found")
            user.player_name = player_name
            self._user_repo.save(user)
            self._uow.commit()
        return user

    def update_avatar(self, user_id: str, avatar_url: str | None) -> User:
        with self._uow:
            user = self._user_repo.find_by_id(user_id)
            if user is None:
                raise UserNotFoundError("User not found")
            user.avatar_url = avatar_url
            self._user_repo.save(user)
            self._uow.commit()
        return user

    # ── Email verification ──────────────────────────────────────────────────

    def verify_email(self, token: str) -> None:
        """Mark a user's email as verified given a valid, unused token."""
        with self._uow:
            user_id = self._email_verification_repo.consume_verification_token(token)
            if user_id is None:
                raise InvalidTokenError("Invalid or expired verification link")
            user = self._user_repo.find_by_id(user_id)
            if user is None:
                raise UserNotFoundError("User not found")
            user.is_email_verified = True
            self._user_repo.save(user)
            self._uow.commit()

    def resend_verification_email(self, user_id: str) -> None:
        """Generate a fresh verification token and re-send the email."""
        with self._uow:
            user = self._user_repo.find_by_id(user_id)
            if user is None:
                raise UserNotFoundError("User not found")
            if user.is_email_verified:
                return
            verification_token = self._create_verification_token(user_id)
            self._uow.commit()
        try:
            self._email_svc.send_verification_email(user.email, user.player_name, verification_token)
        except Exception:
            logger.warning("Failed to resend verification email for user %s", user_id)

    # ── MFA (TOTP) ──────────────────────────────────────────────────────────

    def setup_mfa(self, user_id: str) -> tuple[str, str]:
        """Generate and store a TOTP secret. Returns (secret, provisioning_uri).

        The user must call confirm_mfa() with a valid code before MFA is active.
        """
        with self._uow:
            user = self._user_repo.find_by_id(user_id)
            if user is None:
                raise UserNotFoundError("User not found")
            if user.mfa_enabled:
                raise MFAAlreadyEnabledError("MFA is already enabled for this account")
            secret = totp_utils.generate_secret()
            user.totp_secret = secret
            self._user_repo.save(user)
            self._uow.commit()

        uri = totp_utils.get_provisioning_uri(secret, user.email, issuer="MathDefense")
        return secret, uri

    def confirm_mfa(self, user_id: str, code: str) -> None:
        """Verify a TOTP code and activate MFA for the account."""
        with self._uow:
            user = self._user_repo.find_by_id(user_id)
            if user is None:
                raise UserNotFoundError("User not found")
            if not user.totp_secret:
                raise MFANotSetupError("MFA setup has not been started — call /mfa/setup first")
            if user.mfa_enabled:
                raise MFAAlreadyEnabledError("MFA is already enabled for this account")
            if not totp_utils.verify_code(user.totp_secret, code):
                raise InvalidMFACodeError("Invalid TOTP code")
            user.mfa_enabled = True
            self._user_repo.save(user)
            self._uow.commit()

    def disable_mfa(self, user_id: str, current_password: str) -> None:
        """Disable MFA after verifying the current password."""
        with self._uow:
            user = self._user_repo.find_by_id(user_id)
            if user is None:
                raise UserNotFoundError("User not found")
            if not user.mfa_enabled:
                raise MFANotSetupError("MFA is not enabled for this account")
            if not verify_password(current_password, user.password_hash):
                raise InvalidCredentialsError("Current password is incorrect")
            user.mfa_enabled = False
            user.totp_secret = None
            self._user_repo.save(user)
            self._uow.commit()

    def verify_mfa_challenge(self, mfa_token: str, code: str) -> tuple[User, str]:
        """Complete MFA login: verify the challenge token + TOTP code, return full access token."""
        payload = decode_token(mfa_token)
        if payload is None or payload.get("type") != "mfa_challenge":
            raise InvalidTokenError("Invalid MFA challenge token")
        jti = payload.get("jti")
        if jti and self._token_denylist.is_denied(jti):
            raise InvalidTokenError("MFA challenge token has been revoked")
        user_id = payload.get("sub")
        if not user_id:
            raise InvalidTokenError("Token format error")
        user = self._user_repo.find_by_id(user_id)
        if user is None:
            raise UserNotFoundError("User not found")
        if not user.is_active:
            raise AccountDisabledError("This account has been disabled")
        if not user.mfa_enabled or not user.totp_secret:
            raise MFANotSetupError("MFA is not enabled for this account")
        if not totp_utils.verify_code(user.totp_secret, code):
            raise InvalidMFACodeError("Invalid TOTP code")
        token = create_access_token({"sub": user.id, "role": user.role.value, "pv": user.password_version})
        return user, token
