# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Rugby Event Manager** — A full-stack platform for managing youth rugby tournaments and gatherings, with a public-facing schedule/standings view and an admin back-office for scoring, team management, and event configuration.

## Tech Stack

- **Backend**: FastAPI + SQLAlchemy 2.0 (async) + PostgreSQL + Alembic migrations + Python 3.12
- **Frontend**: React 18 + TypeScript + Vite + TailwindCSS + Zustand + TanStack Query + React Router v6

## Running the App

### Docker (recommended)
```bash
./scripts/docker-local.sh up      # Start (frontend :5180, backend :8002, DB :5433)
./scripts/docker-local.sh reset   # Full reset with fresh DB
./scripts/docker-local.sh down
```
Default credentials: `admin@rugby.it` / `Admin123!`

### Manual Development
```bash
# Backend
cd backend && source venv/bin/activate
alembic upgrade head
uvicorn app.main:app --reload --port 8001
# Docs at http://localhost:8001/api/docs

# Frontend
cd frontend && npm run dev
# VITE_API_URL=http://localhost:8001 in .env
```

## Tests

```bash
cd backend && source venv/bin/activate
pytest tests -q                          # All 40 tests
pytest tests/unit/ -q                    # Unit only
pytest tests/integration/ -q             # Integration only
pytest tests/unit/test_standings.py -q   # Single test file
```

Tests use SQLite (`TEST_DATABASE_URL=sqlite+aiosqlite:///./test.db`). Integration tests spin up a full async test client with fixtures in `tests/conftest.py`.

## Linting

```bash
cd frontend && npm run lint   # ESLint strict (max-warnings 0)
```

## Database Migrations

```bash
cd backend && source venv/bin/activate
alembic upgrade head                             # Apply all
alembic revision --autogenerate -m "description" # New migration
alembic downgrade -1                             # Revert last
```

Migration files live in `backend/alembic/versions/` (numbered 001–007).

## Architecture

### Backend (`backend/app/`)

Layered structure: `api/v1/` → `services/` → `crud/` → `models/`

- **`api/v1/public/`** — Unauthenticated endpoints (tournaments, matches, age groups)
- **`api/v1/admin/`** — JWT-protected endpoints (auth, tournaments, phases, teams, matches, fields, users, upload, dashboard, maintenance)
- **`models/`** — SQLAlchemy ORM models (Tournament, Phase, Team, Match, Field, Organization, User, etc.)
- **`schemas/`** — Pydantic v2 request/response schemas
- **`crud/`** — Thin DB access layer (select/insert/update/delete)
- **`services/`** — Business logic: `program_builder.py` (automatic schedule generation, ~92KB), `standings.py` (ranking), `phase_engine.py`, `bracket.py`
- **`core/`** — `config.py` (Pydantic Settings), `database.py` (async engine), `deps.py` (DI), `security.py` (JWT), `local_bootstrap.py` (auto-create admin on startup)

### Frontend (`frontend/src/`)

- **`pages/public/`** — HomePage, OrgPage, TournamentPage, AgeGroupPage, MatchPage
- **`pages/admin/`** — Login, Dashboard, tournament/team/user/organization admin, ScorerPage
- **`api/`** — Axios client with auth interceptors + per-domain modules
- **`components/`** — Layouts, shared UI (Radix UI + CVA), public-area components, program components
- **`stores/`** — Zustand stores (auth state, tokens)
- **`context/`** — AuthContext

### Domain Model

Events have two types: `TOURNAMENT` and `GATHERING`. Each event belongs to an `Organization` and contains one or more age-group categories. Each category has `Phase` records (group stage, knockout) which contain `Match` records. Matches are played on `Field` records tied to the organization.

### User Roles

`SUPER_ADMIN` > `ORG_ADMIN` > `SCORE_KEEPER` — enforced via JWT claims and FastAPI dependency injection in `core/deps.py`.

### Image Storage

Local uploads go to `backend/uploads/`. Supabase Storage integration is optional (configure `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_BUCKET` in `.env`).

## Key Environment Variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection URL |
| `JWT_SECRET` | JWT signing secret (required in production) |
| `ALLOWED_ORIGINS` | CORS origins (comma-separated) |
| `DEFAULT_ADMIN_EMAIL` / `DEFAULT_ADMIN_PASSWORD` | Auto-create admin on startup |
| `ENABLE_DB_RESET_API` | Expose DB reset endpoint (dev only) |
| `SUPABASE_URL` / `SUPABASE_KEY` | Optional cloud image storage |

See `backend/.env.example` for all variables.
