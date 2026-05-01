import logging
import os
import re
import sys
from pathlib import Path

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_MIN_SECRET_KEY_LENGTH = 16

_logger = logging.getLogger(__name__)


def _is_test_env() -> bool:
    return bool(os.environ.get("CI")) or "pytest" in sys.modules


def _csrf_enabled_default() -> bool:
    # Production must fail closed with CSRF on; tests default to off because
    # the TestClient can't easily round-trip the double-submit cookie into
    # the X-CSRF-Token header. Operators can still set CSRF_ENABLED=true in
    # test environments explicitly if they want to exercise the middleware.
    return not _is_test_env()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Required — must be set via DATABASE_URL env var or .env file. No default
    # because a hard-coded `mathdefense:changeme@localhost` silently ran against
    # developer-local credentials in any environment that forgot to set it; the
    # missing value should fail loud at startup, not fall back to a weak secret.
    #
    # Scheme is `postgresql+psycopg` (psycopg v3) rather than the bare `postgresql`
    # alias, which SQLAlchemy still resolves to the unmaintained psycopg2.
    database_url: str
    secret_key: str  # Required — must be set via SECRET_KEY env var or .env file
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30  # 30 minutes
    # JWT iss/aud — bound into every issued token and required at decode time.
    # Pinning them closes the cross-service reuse gap if the HMAC secret ever
    # leaks to a sibling service signing JWTs with the same key.
    jwt_issuer: str = "math-defense-api"
    jwt_audience: str = "math-defense-clients"
    # Required — set CORS_ORIGINS env var (comma-separated) to the browser-visible origins.
    # No default: a hard-coded localhost list silently breaks prod deployments behind nginx.
    # Union is load-bearing: pydantic-settings only tolerates JSON-decode failure on
    # complex-type *unions*, so the `parse_cors_origins` validator below never runs for
    # a plain `list[str]` annotation (a comma-separated string trips JSON.loads first).
    cors_origins: str | list[str]
    # Active sessions older than this are treated as stale and auto-abandoned.
    session_stale_cutoff_hours: float = 2.0
    # secure=True requires HTTPS (modern browsers treat localhost as secure).
    # Disabling this is only honoured under CI/pytest — see validator below.
    cookie_secure: bool = True
    # Double-submit CSRF protection. Defaults ON everywhere except under the
    # pytest/CI harness — SameSite=Lax alone doesn't cover older browsers or
    # GET-mutation edge cases, so production must fail closed. Disabling
    # outside the test harness is explicitly rejected by the validator below.
    csrf_enabled: bool = Field(default_factory=_csrf_enabled_default)

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: str | list[str]) -> list[str]:
        origins = [origin.strip() for origin in v.split(",") if origin.strip()] if isinstance(v, str) else list(v)
        from urllib.parse import urlparse
        for origin in origins:
            if not re.match(r'^https?://', origin):
                raise ValueError(
                    f"Invalid CORS origin '{origin}': must start with http:// or https://"
                )
            if not urlparse(origin).hostname:
                raise ValueError(
                    f"Invalid CORS origin '{origin}': host component must not be empty"
                )
        return origins

    @field_validator("secret_key")
    @classmethod
    def validate_secret_key(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError(
                "SECRET_KEY must not be empty. Set it via SECRET_KEY env var or .env file"
            )
        if len(v) < _MIN_SECRET_KEY_LENGTH:
            raise ValueError(
                f"SECRET_KEY must be at least {_MIN_SECRET_KEY_LENGTH} characters; "
                "a short key compromises JWT security"
            )
        return v

    @field_validator("database_url")
    @classmethod
    def reject_weak_database_url(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError(
                "DATABASE_URL must not be empty. "
                "Set it via the DATABASE_URL env var or .env file."
            )
        if not _is_test_env() and ":changeme@" in v:
            raise ValueError(
                "DATABASE_URL contains the default password 'changeme'. "
                "Set a strong password via the DATABASE_URL env var or .env file."
            )
        return v

    @field_validator("csrf_enabled")
    @classmethod
    def reject_csrf_disabled_outside_tests(cls, v: bool) -> bool:
        # CSRF defence is mandatory in deployed environments. Allow opt-out only
        # when the test harness is active so the existing TestClient (which
        # cannot round-trip the double-submit cookie into a header) keeps
        # working without weakening production defaults.
        if not v and not _is_test_env():
            raise ValueError(
                "CSRF_ENABLED=false is only allowed under CI/pytest. "
                "Leave CSRF on in any deployed environment."
            )
        return v

    @field_validator("cookie_secure")
    @classmethod
    def reject_insecure_cookie_outside_tests(cls, v: bool) -> bool:
        # Plain-HTTP auth cookies leak credentials on any shared network. Only
        # permit COOKIE_SECURE=false when the test harness is active; operators
        # must front the app with TLS in every other environment.
        if not v and not _is_test_env():
            raise ValueError(
                "COOKIE_SECURE=false is only allowed under CI/pytest. "
                "Deploy behind HTTPS (see nginx-tls.conf) instead of disabling Secure cookies."
            )
        return v

    @model_validator(mode="after")
    def require_non_empty_cors(self) -> "Settings":
        # An empty list silently disables all browser origins — requests then fail
        # with a vague CORS error instead of surfacing the misconfiguration.
        if not self.cors_origins:
            raise ValueError(
                "CORS_ORIGINS must be set (comma-separated). Empty list silently blocks browsers."
            )
        return self


def _detect_secret_key_source() -> str:
    # Reports which input supplied SECRET_KEY so operators see — in the
    # startup log — exactly where the signing key came from. Swapping source
    # (env → .env, or .env absent) silently invalidates every issued JWT;
    # this line is the one-shot chance to notice it before users start
    # getting 401s in production.
    if os.environ.get("SECRET_KEY"):
        return "env:SECRET_KEY"
    env_file = Path(Settings.model_config.get("env_file") or ".env")
    if env_file.is_file():
        return f"env_file:{env_file}"
    return "unset"


settings = Settings()

_SECRET_KEY_SOURCE = _detect_secret_key_source()
if _SECRET_KEY_SOURCE == "unset":
    # Pydantic would already have raised before reaching this line, but the
    # explicit ERROR guards against a future default that masks the miss.
    _logger.error("SECRET_KEY not found in environment or .env file")
else:
    _logger.info("SECRET_KEY loaded successfully")
