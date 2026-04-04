# Rugby Event Manager

Full-stack web app for managing youth rugby events: tournaments and gatherings, multi-year, multi-organization, with configurable phases, public pages, scoring, delays and role-based operations.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18 + Vite + TypeScript + TailwindCSS + Shadcn/ui |
| Backend | FastAPI + SQLAlchemy 2.0 (async) + PostgreSQL |
| Auth | JWT access (30min) + refresh (7 days), bcrypt passwords |
| Deploy | Vercel (frontend) + Render (backend) + PostgreSQL / Supabase |

## Quick Start

### Docker

```bash
./scripts/docker-local.sh up
```

Servizi disponibili:

- frontend: `http://localhost:5180`
- backend API: `http://localhost:8002`
- docs API: `http://localhost:8002/api/docs`
- postgres: `localhost:5433`

Primo accesso:

1. apri `http://localhost:5180`
2. accedi con:
   - email: `admin@rugby.it`
   - password: `Admin123!`
3. crea società, impianti, evento, categorie, programma e risultati

Per fermare tutto:

```bash
./scripts/docker-local.sh down
```

Per azzerare anche il database Docker:

```bash
./scripts/docker-local.sh reset
```

### Backend

```bash
cd backend
python3.12 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env

alembic upgrade head
uvicorn app.main:app --reload --port 8001
```

Docs API: `http://localhost:8001/api/docs`

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Frontend dev: `http://localhost:5173`

## First-time Setup

1. Login at `http://localhost:5180/admin/login`
2. Use:
   - email: `admin@rugby.it`
   - password: `Admin123!`
3. Create organization → facilities → event → categories → formula → program → results

## Running Tests

```bash
cd backend
source venv/bin/activate
pytest tests -q
```

## Roles

| Role | Permissions |
|------|-------------|
| `SUPER_ADMIN` | Full access: organizations, users, events, scoring |
| `ORG_ADMIN` | Creator role: organizations, events, public setup |
| `SCORE_KEEPER` | Only assigned events, results and delays |

## Deploy

- Frontend: connect the GitHub repo to Vercel and set `VITE_API_URL`
- Backend: use Render with `backend/render.yaml` or the provided GitHub Action
- Database: PostgreSQL or Supabase using `DATABASE_URL`

## Notes

- Public events support both `TOURNAMENT` and `GATHERING`
- URLs are generated from organization + event name + year/date
- Old slugs remain supported through slug history
