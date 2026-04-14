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

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: str | list[str]) -> list[str]:
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

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
