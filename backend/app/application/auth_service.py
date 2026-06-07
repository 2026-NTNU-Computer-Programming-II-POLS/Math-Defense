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
from app.domain.auth.repository import RefreshTokenConsumeStatus
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
        LoginAttemptRepository,
        RefreshTokenRepository,
        TokenDenylistRepository,
    )
    from app.application.ports import UnitOfWork
    from app.domain.user.repository import UserRepository

logger = logging.getLogger(__name__)

_DUMMY_PASSWORD_HASH = hash_password("__timing_equaliser__")
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
        email_svc: EmailService,
        uow: UnitOfWork,
        refresh_token_repo: RefreshTokenRepository | None = None,
    ) -> None:
        self._user_repo = user_repo
        self._login_attempts = login_attempt_repo
        self._token_denylist = token_denylist_repo
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
    ) -> tuple[User, bool]:
        """Submit a registration request. Returns (user, is_new_user).

        Under M-05 the caller MUST NOT expose `is_new_user` in the HTTP
        response — it exists only so the router can write an accurate audit
        log row. The HTTP response is identical regardless of branch.
        """
        try:
            email_vo = Email(email)
        except ValueError as e:
            raise DomainValueError(str(e)) from e

        # M-04 (self-service registration is student-only) is enforced at the
        # HTTP boundary in RegisterRequest. The application service stays
        # role-agnostic so administrative flows and tests can seed teachers
        # and admins without going through the public /register route.
        try:
            role_enum = Role(role)
        except ValueError:
            raise DomainValueError(f"Invalid role: {role}. Must be one of: admin, teacher, student")

        # M-05: registration is enumeration-safe. Both branches do the same
        # observable work (zxcvbn strength check, one synchronous email send,
        # identical HTTP response). New accounts receive a welcome email and
        # existing ones an account-exists notice — exactly one email either
        # way, so response timing does not reveal which branch ran. Verification
        # is "soft": no token is minted here and no login path checks it.
        _assert_password_strength(password)

        with self._uow:
            existing_user = self._user_repo.find_by_email(email_vo.value)
            if existing_user:
                # Mask the dominant timing cost (bcrypt ~50–150ms) so the
                # existing-user branch isn't observably faster than the new-
                # user branch. Without this, response-time analysis defeats
                # M-05 even though the body/cookies are identical. The hash
                # is discarded — we just need the CPU work to happen.
                _ = hash_password(password)
                self._uow.commit()
                try:
                    self._email_svc.send_account_exists_notice(
                        existing_user.email,
                        existing_user.player_name,
                    )
                except Exception:
                    logger.warning("Failed to send account-exists notice for user %s", existing_user.id)
                return existing_user, False

            password_hash = hash_password(password)
            user = User.create(
                email=email_vo.value,
                player_name=player_name,
                role=role_enum,
                password_hash=password_hash,
            )
            raced_user: User | None = None
            try:
                self._user_repo.save(user)
                self._uow.commit()
            except ConstraintViolationError:
                # A concurrent request committed the same email between our
                # find_by_email and our INSERT. Fall through to the "existing
                # user" path so the response stays 202 and M-05's
                # indistinguishability holds across the race window. The
                # rollback issued by the failed flush leaves the session
                # usable for a fresh SELECT.
                self._uow.rollback()
                raced_user = self._user_repo.find_by_email(email_vo.value)
                if raced_user is None:
                    # The unique-violation wasn't on email after all — bubble
                    # up a generic error. This branch cannot leak enumeration
                    # because it does not depend on whether the email exists.
                    raise DomainValueError("Email registration failed")
        if raced_user is not None:
            try:
                self._email_svc.send_account_exists_notice(
                    raced_user.email,
                    raced_user.player_name,
                )
            except Exception:
                logger.warning("Failed to send account-exists notice for user %s", raced_user.id)
            return raced_user, False

        try:
            self._email_svc.send_welcome_email(user.email, user.player_name)
        except Exception:
            logger.warning("Failed to send welcome email for user %s", user.id)

        # No auto-login: the 202 response carries no cookies and no identity, so
        # it stays indistinguishable from the existing-account branch (M-05).
        return user, True

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
                result = self._refresh_token_repo.consume(token_hash)
                # A successful consume rotates this token; a reuse-detected one
                # is a stolen-cookie replay. Either way logout kills the user's
                # whole refresh-token family. consume() no longer revokes
                # internally (BA-S1 / BA-U1) — the revocation is explicit here
                # and made durable by the unconditional commit below.
                if result.status in (
                    RefreshTokenConsumeStatus.OK,
                    RefreshTokenConsumeStatus.REUSE_DETECTED,
                ):
                    if result.user_id is None:
                        raise ValueError("consume() returned OK/REUSE_DETECTED without a user_id")
                    self._refresh_token_repo.revoke_all_for_user(result.user_id)
            self._uow.commit()

    def refresh_access_token(self, refresh_token: str) -> tuple[User, str, str]:
        """Validate and rotate a refresh token; return (user, new_access_token, new_refresh_token)."""
        if self._refresh_token_repo is None:
            raise InvalidTokenError("Refresh tokens are not enabled")
        token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
        with self._uow:
            result = self._refresh_token_repo.consume(token_hash)
            if result.status is RefreshTokenConsumeStatus.REUSE_DETECTED:
                # Stolen-cookie replay (B-SEC-1): revoke every refresh token
                # for this user so neither the attacker's nor the victim's
                # lineage survives. The commit MUST run before the raise —
                # otherwise the UoW exits via the exception and rolls the
                # family-revocation back. consume() no longer does this
                # itself, so the responsibility is explicit here (BA-S1).
                assert result.user_id is not None
                self._refresh_token_repo.revoke_all_for_user(result.user_id)
                self._uow.commit()
                raise InvalidTokenError("Refresh token is invalid or expired")
            if result.status is RefreshTokenConsumeStatus.INVALID:
                # Nothing was mutated — let the UoW roll back cleanly.
                raise InvalidTokenError("Refresh token is invalid or expired")
            user_id = result.user_id
            assert user_id is not None  # OK status always carries a user_id
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

    def update_endpoint_marker(
        self,
        user_id: str,
        style: str | None,
        custom_dataurl: str | None,
        hit_fx: str | None,
    ) -> User:
        """Atomically update the endpoint-marker preferences (style + custom
        dataURL + hit FX). All three fields are updated together so a single
        DB write covers the transaction; the aggregate enforces invariants
        (e.g. custom_dataurl is only allowed when style == 'custom').
        """
        with self._uow:
            user = self._user_repo.find_by_id(user_id)
            if user is None:
                raise UserNotFoundError("User not found")
            try:
                user.update_endpoint_marker(style, custom_dataurl, hit_fx)
            except ValueError as e:
                raise DomainValueError(str(e)) from e
            self._user_repo.save(user)
            self._uow.commit()
        return user

    def update_profile_initials(
        self,
        user_id: str,
        letters: str | None,
        color: str | None,
    ) -> User:
        """Set or clear the profile-initials avatar atomically. Both fields
        move together — the aggregate rejects half-filled state."""
        with self._uow:
            user = self._user_repo.find_by_id(user_id)
            if user is None:
                raise UserNotFoundError("User not found")
            try:
                user.update_profile_initials(letters, color)
            except ValueError as e:
                raise DomainValueError(str(e)) from e
            self._user_repo.save(user)
            self._uow.commit()
        return user

    # ── MFA (TOTP) ──────────────────────────────────────────────────────────

    def setup_mfa(self, user_id: str, current_password: str) -> tuple[str, str]:
        """Generate and store a TOTP secret. Returns (secret, provisioning_uri).

        The user must call confirm_mfa() with a valid code before MFA is active.
        """
        with self._uow:
            user = self._user_repo.find_by_id(user_id)
            if user is None:
                raise UserNotFoundError("User not found")
            if not verify_password(current_password, user.password_hash):
                raise InvalidCredentialsError("Current password is incorrect")
            if user.mfa_enabled:
                raise MFAAlreadyEnabledError("MFA is already enabled for this account")
            secret = totp_utils.generate_secret()
            user.totp_secret = secret
            self._user_repo.save(user)
            self._uow.commit()

        uri = totp_utils.get_provisioning_uri(secret, user.email, issuer="MathDefense")
        return secret, uri

    def confirm_mfa(self, user_id: str, current_password: str, code: str) -> None:
        """Verify a TOTP code and activate MFA for the account."""
        with self._uow:
            user = self._user_repo.find_by_id(user_id)
            if user is None:
                raise UserNotFoundError("User not found")
            if not verify_password(current_password, user.password_hash):
                raise InvalidCredentialsError("Current password is incorrect")
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
