from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_MIN_SECRET_KEY_LENGTH = 16


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Default lands inside the docker volume mount so dev / docker / tests share a path
    database_url: str = "sqlite:///./data/math_defense.db"
    secret_key: str  # Required — must be set via SECRET_KEY env var or .env file
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30  # 30 minutes
    # Required — set CORS_ORIGINS env var (comma-separated) to the browser-visible origins.
    # No default: a hard-coded localhost list silently breaks prod deployments behind nginx.
    cors_origins: list[str]
    auto_create_tables: bool = True  # Set to False in production when using Alembic migrations
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
    def require_cors_in_prod(self) -> "Settings":
        # In prod mode (auto_create_tables=False gates Alembic-managed deployments)
        # an empty CORS_ORIGINS disables all browser origins — requests then fail
        # with a vague CORS error instead of surfacing the misconfiguration.
        if not self.auto_create_tables and not self.cors_origins:
            raise ValueError(
                "CORS_ORIGINS must be set (comma-separated) in production mode "
                "(auto_create_tables=False). Empty list silently blocks browsers."
            )
        return self


settings = Settings()
