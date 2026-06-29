from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration, loaded from environment / .env."""

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # Bluesky / AT Protocol — OAuth runs in the Node sidecar (oauth-sidecar/).
    public_api_url: str = "http://localhost:8000"
    # Internal URL FastAPI uses to reach the sidecar within the Docker network.
    oauth_sidecar_url: str = "http://oauth-sidecar:3001"
    # Shared secret sent to the sidecar's internal /oauth/session endpoint.
    oauth_internal_secret: str = ""

    # Datastores
    database_url: str = "postgresql+asyncpg://skycave:skycave@localhost:5432/skycave"
    redis_url: str = "redis://localhost:6379/0"

    # Auth
    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days

    # Backoffice — admin login. Empty disables admin access entirely.
    admin_password: str = ""
    admin_token_expire_minutes: int = 60 * 12  # 12 hours

    # Frontend
    frontend_url: str = "http://localhost:3000"

    # App
    cors_origins: str = "http://localhost:3000"
    env: str = "development"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
