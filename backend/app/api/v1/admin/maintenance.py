from pydantic import BaseModel

import app.models  # noqa: F401
from fastapi import APIRouter, Depends, Header, HTTPException, status

from app.core.config import settings
from app.core.database import Base, engine
from app.core.deps import require_admin
from app.core.local_bootstrap import bootstrap_local_environment
from app.models.user import User

router = APIRouter()


class DatabaseResetRequest(BaseModel):
    confirmation: str


@router.post("/maintenance/reset-database")
async def reset_database(
    body: DatabaseResetRequest,
    _: User = Depends(require_admin),
    x_reset_api_key: str | None = Header(default=None, alias="X-Reset-Api-Key"),
):
    if not settings.ENABLE_DB_RESET_API:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if not settings.DB_RESET_API_KEY or x_reset_api_key != settings.DB_RESET_API_KEY:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid reset API key")
    if body.confirmation != "DELETE ALL DATA":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid confirmation phrase")

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    await bootstrap_local_environment()
    return {"status": "ok", "message": "Database reset completed"}
