import os
import re
import sys

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_MIN_SECRET_KEY_LENGTH = 16


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Scheme is `postgresql+psycopg` (psycopg v3) rather than the bare `postgresql`
    # alias, which SQLAlchemy still resolves to the unmaintained psycopg2.
    database_url: str = "postgresql+psycopg://mathdefense:changeme@localhost:5432/math_defense"
    secret_key: str  # Required — must be set via SECRET_KEY env var or .env file
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30  # 30 minutes
    # Required — set CORS_ORIGINS env var (comma-separated) to the browser-visible origins.
    # No default: a hard-coded localhost list silently breaks prod deployments behind nginx.
    # Union is load-bearing: pydantic-settings only tolerates JSON-decode failure on
    # complex-type *unions*, so the `parse_cors_origins` validator below never runs for
    # a plain `list[str]` annotation (a comma-separated string trips JSON.loads first).
    cors_origins: str | list[str]
    # Active sessions older than this are treated as stale and auto-abandoned.
    session_stale_cutoff_hours: float = 2.0
    # Cookie settings — secure=True requires HTTPS (works on localhost in modern
    # browsers). Set COOKIE_SECURE=false in .env for plain-HTTP dev if needed.
    cookie_secure: bool = True

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: str | list[str]) -> list[str]:
        origins = [origin.strip() for origin in v.split(",") if origin.strip()] if isinstance(v, str) else list(v)
        for origin in origins:
            if not re.match(r'^https?://', origin):
                raise ValueError(
                    f"Invalid CORS origin '{origin}': must start with http:// or https://"
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
    def reject_default_password(cls, v: str) -> str:
        is_test = os.environ.get("CI") or "pytest" in sys.modules
        if not is_test and ":changeme@" in v:
            raise ValueError(
                "DATABASE_URL contains the default password 'changeme'. "
                "Set a strong password via the DATABASE_URL env var or .env file."
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


settings = Settings()
