from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.core.config import settings
from app.core.local_bootstrap import bootstrap_local_environment
from app.api.v1.public import tournaments as public_tournaments
from app.api.v1.public import matches as public_matches
from app.api.v1.admin import auth as admin_auth
from app.api.v1.admin import tournaments as admin_tournaments
from app.api.v1.admin import phases as admin_phases
from app.api.v1.admin import teams as admin_teams
from app.api.v1.admin import matches as admin_matches
from app.api.v1.admin import users as admin_users
from app.api.v1.admin import organizations as admin_organizations
from app.api.v1.admin import fields as admin_fields
from app.api.v1.admin import upload as admin_upload
from app.api.v1.admin import dashboard as admin_dashboard
from app.api.v1.admin import maintenance as admin_maintenance

settings.validate_production_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await bootstrap_local_environment()
    yield


app = FastAPI(
    title="Rugby Tournament Manager",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_origin_regex=settings.allowed_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Public routes (no auth)
app.include_router(public_tournaments.router, prefix="/api/v1", tags=["public-tournaments"])
app.include_router(public_matches.router, prefix="/api/v1", tags=["public-matches"])

# Admin routes (auth required)
app.include_router(admin_auth.router, prefix="/api/v1/admin", tags=["auth"])
app.include_router(admin_tournaments.router, prefix="/api/v1/admin", tags=["admin-tournaments"])
app.include_router(admin_phases.router, prefix="/api/v1/admin", tags=["admin-phases"])
app.include_router(admin_teams.router, prefix="/api/v1/admin", tags=["admin-teams"])
app.include_router(admin_matches.router, prefix="/api/v1/admin", tags=["admin-matches"])
app.include_router(admin_users.router, prefix="/api/v1/admin", tags=["admin-users"])
app.include_router(admin_organizations.router, prefix="/api/v1/admin", tags=["admin-organizations"])
app.include_router(admin_fields.router, prefix="/api/v1/admin", tags=["admin-fields"])
app.include_router(admin_upload.router, prefix="/api/v1/admin", tags=["admin-upload"])
app.include_router(admin_dashboard.router, prefix="/api/v1/admin", tags=["admin-dashboard"])
app.include_router(admin_maintenance.router, prefix="/api/v1/admin", tags=["admin-maintenance"])


@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}


# Serve locally uploaded files (used when Supabase is not configured)
_uploads_dir = Path("uploads")
_uploads_dir.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(_uploads_dir)), name="uploads")
