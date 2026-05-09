"""AuthApplicationService — user registration, login, and token authentication"""
from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import datetime, timedelta, UTC
from typing import TYPE_CHECKING

import zxcvbn

from app.domain.errors import (
    ConstraintViolationError,
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
from app.config import settings
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
        RefreshTokenRepository,
        TokenDenylistRepository,
    )
    from app.application.ports import UnitOfWork
    from app.domain.user.repository import UserRepository

logger = logging.getLogger(__name__)

_DUMMY_PASSWORD_HASH = hash_password("__timing_equaliser__")
_EMAIL_VERIFICATION_TTL_HOURS = 24
_MFA_CHALLENGE_TTL_MINUTES = 5
# TOTP valid_window=1 means codes from t-1, t, t+1 periods are accepted
# (3 × 30 s = 90 s). Reject any code within this window of the last accepted
# one to prevent replay attacks on intercepted TOTP codes.
_TOTP_REPLAY_WINDOW_SECS = 90


def _assert_password_strength(password: str) -> None:
    """zxcvbn dictionary/entropy check.

    Lives in the application layer (B-ARCH-18) so it runs after slowapi's
    per-route rate limiter rather than inside Pydantic validation, where it
    would be a free DoS lever (zxcvbn is ~10–50ms per call). The cheap
    structural checks (length, character classes) remain in the schema so
    obviously bad inputs are rejected without paying for the dictionary
    lookup.
    """
    result = zxcvbn.zxcvbn(password)
    if result["score"] < 2:
        feedback = result["feedback"]["warning"] or "Password is too weak or common."
        raise DomainValueError(f"Password is too weak: {feedback}")


class AuthApplicationService:

    def __init__(
        self,
        user_repo: UserRepository,
        login_attempt_repo: LoginAttemptRepository,
        token_denylist_repo: TokenDenylistRepository,
        email_verification_repo: EmailVerificationRepository,
        email_svc: EmailService,
        uow: UnitOfWork,
        refresh_token_repo: RefreshTokenRepository | None = None,
    ) -> None:
        self._user_repo = user_repo
        self._login_attempts = login_attempt_repo
        self._token_denylist = token_denylist_repo
        self._email_verification_repo = email_verification_repo
        self._email_svc = email_svc
        self._uow = uow
        self._refresh_token_repo = refresh_token_repo

    # ── Helpers ──────────────────────────────────────────────────────────────

    def _issue_refresh_token(self, user_id: str) -> str:
        """Create a refresh token, persist its hash, and return the raw token."""
        raw = secrets.token_hex(32)
        token_hash = hashlib.sha256(raw.encode()).hexdigest()
        expires_at = datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days)
        if self._refresh_token_repo is not None:
            self._refresh_token_repo.create(user_id, token_hash, expires_at)
        return raw

    # ── Registration ────────────────────────────────────────────────────────

    def register(
        self,
        email: str,
        password: str,
        player_name: str,
        role: str = "student",
    ) -> tuple[User, str, str]:
        """Create a new user and issue tokens. Returns (user, access_token, refresh_token)."""
        try:
            email_vo = Email(email)
        except ValueError as e:
            raise DomainValueError(str(e)) from e

        try:
            role_enum = Role(role)
        except ValueError:
            raise DomainValueError(f"Invalid role: {role}. Must be one of: admin, teacher, student")

        _assert_password_strength(password)
        password_hash = hash_password(password)
        with self._uow:
            # B-SEC-17 trade-off: this surfaces account existence to a
            # registrant who guesses an email. For a school math game the
            # risk is Low (no financial value, emails are typically
            # institutional and known). Fully fixing it would require a
            # silent-success-with-email flow (send "you already have an
            # account" to the existing address, return generic success to
            # the form) which is a UX-level redesign. Keep the explicit
            # message for clearer failure diagnosis until that lands.
            if self._user_repo.find_by_email(email_vo.value):
                raise DomainValueError("Email already registered")
            user = User.create(
                email=email_vo.value,
                player_name=player_name,
                role=role_enum,
                password_hash=password_hash,
            )
            try:
                self._user_repo.save(user)
            except ConstraintViolationError:
                raise DomainValueError("Email already registered")
            verification_token = self._create_verification_token(user.id)
            refresh_token = self._issue_refresh_token(user.id)
            try:
                self._uow.commit()
            except ConstraintViolationError as e:
                raise DomainValueError("Email already registered") from e

        try:
            self._email_svc.send_verification_email(user.email, user.player_name, verification_token)
        except Exception:
            logger.warning("Failed to send verification email for user %s", user.id)

        access_token = create_access_token({"sub": user.id, "role": user.role.value, "pv": user.password_version})
        return user, access_token, refresh_token

    def _create_verification_token(self, user_id: str) -> str:
        """Generate a fresh token; invalidates any pending tokens for this user first."""
        self._email_verification_repo.invalidate_for_user(user_id)
        raw = secrets.token_hex(32)
        expires_at = datetime.now(UTC) + timedelta(hours=_EMAIL_VERIFICATION_TTL_HOURS)
        self._email_verification_repo.create(user_id, raw, expires_at)
        return raw

    # ── Login ───────────────────────────────────────────────────────────────

    def login(self, email: str, password: str) -> tuple[User, str, bool, str | None]:
        """Authenticate credentials and issue tokens.

        Returns (user, token, mfa_required, refresh_token).
        When mfa_required is True, token is a short-lived MFA challenge JWT and
        refresh_token is None; the caller must verify a TOTP code via
        verify_mfa_challenge() to obtain a full access + refresh token pair.
        """
        email_lower = email.strip().lower()
        refresh_token: str | None = None
        with self._uow:
            locked_until = self._login_attempts.is_locked(email_lower)
            if locked_until is not None:
                retry_after = max(0, int((locked_until - datetime.now(UTC)).total_seconds()))
                raise AccountLockedError(
                    f"Account temporarily locked. Try again in {retry_after} seconds.",
                    retry_after_seconds=retry_after,
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
            if not user.mfa_enabled:
                refresh_token = self._issue_refresh_token(user.id)
            self._uow.commit()

        if user.mfa_enabled:
            mfa_token = create_access_token(
                {"sub": user.id, "role": user.role.value, "pv": user.password_version, "type": "mfa_challenge"},
                expires_delta=timedelta(minutes=_MFA_CHALLENGE_TTL_MINUTES),
            )
            return user, mfa_token, True, None

        assert refresh_token is not None
        access_token = create_access_token({"sub": user.id, "role": user.role.value, "pv": user.password_version})
        return user, access_token, False, refresh_token

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

    def logout_token(self, token: str, refresh_token: str | None = None) -> None:
        """Revoke an access token and optionally its paired refresh token."""
        payload = decode_token(token)
        with self._uow:
            if payload is not None:
                jti = payload.get("jti")
                exp = payload.get("exp", 0)
                if jti:
                    self._token_denylist.deny(jti, float(exp))
            if refresh_token is not None and self._refresh_token_repo is not None:
                token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
                user_id = self._refresh_token_repo.consume(token_hash)
                if user_id is not None:
                    self._refresh_token_repo.revoke_all_for_user(user_id)
            self._uow.commit()

    def refresh_access_token(self, refresh_token: str) -> tuple[User, str, str]:
        """Validate and rotate a refresh token; return (user, new_access_token, new_refresh_token)."""
        if self._refresh_token_repo is None:
            raise InvalidTokenError("Refresh tokens are not enabled")
        token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
        with self._uow:
            user_id = self._refresh_token_repo.consume(token_hash)
            if user_id is None:
                # consume() may have detected reuse and called
                # revoke_all_for_user(). That mutation must persist even on
                # the error path — without this commit the UoW exits via
                # the exception and rolls back the family-revocation,
                # defeating B-SEC-1. Empty commits are no-ops, so it's
                # safe to commit when no reuse was detected either.
                self._uow.commit()
                raise InvalidTokenError("Refresh token is invalid or expired")
            user = self._user_repo.find_by_id(user_id)
            if user is None:
                raise UserNotFoundError("User not found")
            if not user.is_active:
                raise AccountDisabledError("This account has been disabled")
            new_refresh_token = self._issue_refresh_token(user.id)
            self._uow.commit()
        access_token = create_access_token({"sub": user.id, "role": user.role.value, "pv": user.password_version})
        return user, access_token, new_refresh_token

    # ── Profile mutations ───────────────────────────────────────────────────

    def change_password(self, user_id: str, current_password: str, new_password: str) -> None:
        _assert_password_strength(new_password)
        with self._uow:
            user = self._user_repo.find_by_id(user_id)
            if user is None:
                raise UserNotFoundError("User not found")
            if not verify_password(current_password, user.password_hash):
                raise InvalidCredentialsError("Current password is incorrect")
            user.password_hash = hash_password(new_password)
            user.password_version += 1
            self._user_repo.save(user)
            # Bumping password_version invalidates outstanding access tokens
            # via the `pv` claim; refresh tokens carry no claim so they must
            # be revoked explicitly. Without this an attacker who already
            # holds a refresh cookie can mint a new access token after the
            # legitimate user has changed their password.
            if self._refresh_token_repo is not None:
                self._refresh_token_repo.revoke_all_for_user(user.id)
            self._uow.commit()

    def update_player_name(self, user_id: str, player_name: str) -> User:
        # B-BUG-19: route through the aggregate so length / non-empty
        # validation lives next to the invariant rather than at the schema
        # edge. Direct attribute mutation would bypass these rules.
        with self._uow:
            user = self._user_repo.find_by_id(user_id)
            if user is None:
                raise UserNotFoundError("User not found")
            try:
                user.rename(player_name)
            except ValueError as e:
                raise DomainValueError(str(e)) from e
            self._user_repo.save(user)
            self._uow.commit()
        return user

    def update_avatar(self, user_id: str, avatar_url: str | None) -> User:
        # B-BUG-19: route through the aggregate (see update_player_name).
        with self._uow:
            user = self._user_repo.find_by_id(user_id)
            if user is None:
                raise UserNotFoundError("User not found")
            try:
                user.update_avatar(avatar_url)
            except ValueError as e:
                raise DomainValueError(str(e)) from e
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
            now = datetime.now(UTC)
            if user.totp_last_used_at is not None:
                if (now - user.totp_last_used_at).total_seconds() < _TOTP_REPLAY_WINDOW_SECS:
                    raise InvalidMFACodeError("TOTP code already used — wait for the next window")
            user.totp_last_used_at = now
            user.mfa_enabled = True
            self._user_repo.save(user)
            self._uow.commit()

    def disable_mfa(self, user_id: str, current_password: str, code: str) -> None:
        """Disable MFA after verifying password + a fresh TOTP code.

        Requiring step-up TOTP raises the bar for an attacker who has
        already cleared MFA on a single login: they must still produce a
        live code from the authenticator they don't control. Without this,
        password alone disables MFA, which collapses the protection we
        rely on after a credential leak.
        """
        with self._uow:
            user = self._user_repo.find_by_id(user_id)
            if user is None:
                raise UserNotFoundError("User not found")
            if not user.mfa_enabled:
                raise MFANotSetupError("MFA is not enabled for this account")
            if not verify_password(current_password, user.password_hash):
                raise InvalidCredentialsError("Current password is incorrect")
            if not user.totp_secret or not totp_utils.verify_code(user.totp_secret, code):
                raise InvalidMFACodeError("Invalid TOTP code")
            now = datetime.now(UTC)
            if user.totp_last_used_at is not None:
                if (now - user.totp_last_used_at).total_seconds() < _TOTP_REPLAY_WINDOW_SECS:
                    raise InvalidMFACodeError("TOTP code already used — wait for the next window")
            user.totp_last_used_at = now
            user.mfa_enabled = False
            user.totp_secret = None
            self._user_repo.save(user)
            # Same rationale as change_password: outstanding refresh
            # tokens survive an MFA disable and would let an attacker who
            # captured cookies retain access. Kill them all.
            if self._refresh_token_repo is not None:
                self._refresh_token_repo.revoke_all_for_user(user.id)
            self._uow.commit()

    def verify_mfa_challenge(self, mfa_token: str, code: str) -> tuple[User, str, str]:
        """Complete MFA login: verify the challenge token + TOTP code, return (user, access_token, refresh_token)."""
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
        now = datetime.now(UTC)
        if user.totp_last_used_at is not None:
            if (now - user.totp_last_used_at).total_seconds() < _TOTP_REPLAY_WINDOW_SECS:
                raise InvalidMFACodeError("TOTP code already used — wait for the next window")
        with self._uow:
            user.totp_last_used_at = now
            self._user_repo.save(user)
            # B-BUG-1: deny the MFA challenge JTI atomically with success.
            # Without this, the same challenge token plus a fresh TOTP code
            # within the 5-minute TTL produces another full token pair —
            # a complete MFA bypass. The denylist row is committed in the
            # same UoW as the totp_last_used_at update so a partial commit
            # cannot leave the JTI usable.
            if jti:
                exp = payload.get("exp", 0)
                self._token_denylist.deny(jti, float(exp))
            refresh_token = self._issue_refresh_token(user.id)
            self._uow.commit()
        access_token = create_access_token({"sub": user.id, "role": user.role.value, "pv": user.password_version})
        return user, access_token, refresh_token
