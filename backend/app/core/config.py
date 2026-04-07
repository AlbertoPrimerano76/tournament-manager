from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://user:password@localhost:5432/rugby_tournament"
    TEST_DATABASE_URL: str = "sqlite+aiosqlite:///./test.db"

    JWT_SECRET: str = "changeme-in-production-use-long-random-string"
    JWT_ACCESS_EXPIRE_MINUTES: int = 30
    JWT_REFRESH_EXPIRE_DAYS: int = 7

    ALLOWED_ORIGINS: str = "http://localhost:5180,http://localhost:5173,http://localhost:3000"
    ENVIRONMENT: str = "development"

    SUPABASE_URL: Optional[str] = None
    SUPABASE_KEY: Optional[str] = None
    SUPABASE_BUCKET: str = "rugby-images"
    DEFAULT_ADMIN_EMAIL: Optional[str] = None
    FRONTEND_URL: Optional[str] = None
    RESET_TOKEN_EXPIRE_MINUTES: int = 60
    ENABLE_DB_RESET_API: bool = False
    DB_RESET_API_KEY: Optional[str] = None

    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USERNAME: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    SMTP_FROM_EMAIL: Optional[str] = None
    SMTP_FROM_NAME: str = "Rugby Event Manager"
    SMTP_USE_TLS: bool = True

    MAX_IMAGE_SIZE_MB: int = 5

    class Config:
        env_file = ".env"

    @staticmethod
    def _clean_optional(value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip().strip('"').strip("'").strip()
        return cleaned or None

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    @property
    def allowed_origin_regex(self) -> Optional[str]:
        if self.is_production:
            return r"^https://.*\.vercel\.app$"
        return None

    @property
    def async_database_url(self) -> str:
        url = self.DATABASE_URL.strip()
        if url.startswith("postgresql+asyncpg://") or url.startswith("sqlite+aiosqlite://"):
            return url
        if url.startswith("postgres://"):
            return url.replace("postgres://", "postgresql+asyncpg://", 1)
        if url.startswith("postgresql://") and "+asyncpg" not in url:
            return url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return url

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() == "production"

    @property
    def supabase_url(self) -> Optional[str]:
        return self._clean_optional(self.SUPABASE_URL)

    @property
    def supabase_key(self) -> Optional[str]:
        return self._clean_optional(self.SUPABASE_KEY)

    @property
    def supabase_key_kind(self) -> Optional[str]:
        key = self.supabase_key
        if not key:
            return None
        if key.startswith("sb_secret_"):
            return "secret"
        if key.startswith("sb_publishable_"):
            return "publishable"
        parts = key.split(".")
        if len(parts) == 3 and all(parts):
            return "jwt"
        return "unknown"

    @property
    def has_valid_supabase_key_format(self) -> bool:
        return self.supabase_key_kind in {"secret", "publishable", "jwt"}

    def validate_production_settings(self) -> None:
        if not self.is_production:
            return
        if self.JWT_SECRET == "changeme-in-production-use-long-random-string" or len(self.JWT_SECRET) < 32:
            raise RuntimeError("Invalid production JWT_SECRET configuration")
        if not self.allowed_origins_list:
            raise RuntimeError("ALLOWED_ORIGINS must be configured in production")


settings = Settings()
