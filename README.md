# Rugby Event Manager

Platform for managing youth rugby events with a public website and an admin back office.

It supports:

- tournaments and gatherings
- multiple organizations
- configurable categories and formulas
- group stages and knockout phases
- public schedules, standings and results
- scorekeeper workflows for live results and delays
- event branding, sponsors and themed public pages

## What The App Does

The app is built around two kinds of events:

- `TOURNAMENT`
- `GATHERING`

Each event belongs to an organization and can include one or more age groups such as `U6`, `U8`, `U10`, `U12`.

For each category you can:

- define the formula
- assign participating teams
- generate the program automatically
- manage groups, matches, results and delays
- publish the public-facing pages

## Main Features

### Public area

- homepage with active events grouped by organization
- organization page with yearly archive
- event page with branding, sponsors, facilities and category links
- category page with:
  - matches
  - standings
  - final ranking when applicable
  - “My Team” view for parents

### Admin area

- organization management
- facilities management at organization level
- event creation and editing on dedicated pages
- category configuration:
  - structure
  - schedule settings
  - fields assignment
  - referee rules
- operations area for:
  - score entry
  - match end time
  - delay handling
  - team moves between groups
- event and category templates
- role-based dashboards

### Roles

| Role | Permissions |
|------|-------------|
| `SUPER_ADMIN` | Full access: organizations, users, events, scoring |
| `ORG_ADMIN` | Creator role: organizations, events, public setup |
| `SCORE_KEEPER` | Only assigned events, results and delays |

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18, Vite, TypeScript, TailwindCSS |
| Backend | FastAPI, SQLAlchemy 2.0 async, Alembic |
| Database | PostgreSQL |
| Auth | JWT access + refresh tokens |
| Local runtime | Docker Compose |
| Typical deployment | Vercel + Render + PostgreSQL/Supabase |

## Repository Structure

```text
.
├── backend/
│   ├── alembic/
│   ├── app/
│   │   ├── api/
│   │   ├── core/
│   │   ├── crud/
│   │   ├── models/
│   │   ├── schemas/
│   │   └── services/
│   ├── scripts/
│   └── tests/
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   ├── components/
│   │   ├── context/
│   │   ├── pages/
│   │   ├── stores/
│   │   └── utils/
├── scripts/
└── docker-compose.yml
```

## Quick Start With Docker

This is the recommended local setup.

```bash
./scripts/docker-local.sh up
```

Services:

- frontend: `http://localhost:5180`
- backend API: `http://localhost:8002`
- backend docs: `http://localhost:8002/api/docs`
- postgres: `localhost:5433`

Default local admin:

- email: `admin@rugby.it`
- password: `Admin123!`

Useful commands:

```bash
./scripts/docker-local.sh up
./scripts/docker-local.sh down
./scripts/docker-local.sh reset
./scripts/docker-local.sh rebuild
./scripts/docker-local.sh ps
./scripts/docker-local.sh logs
```

## Manual Local Development

### Backend

```bash
cd backend
python3.12 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
./venv/bin/alembic upgrade head
./venv/bin/uvicorn app.main:app --reload --port 8001
```

Docs:

- `http://localhost:8001/api/docs`

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Frontend dev server:

- `http://localhost:5173`

## First Operational Flow

After login, the usual workflow is:

1. create an organization
2. add one or more facilities to the organization
3. create an event
4. add categories
5. define the formula
6. add participating teams
7. generate the program
8. publish the event
9. use the operations area for results and delays

## Event Model

### Organizations

Organizations own:

- facilities
- public identity
- website
- colors and logo

### Events

Events contain:

- base info
- branding
- sponsors
- categories
- public slug

Event slugs are generated from:

- organization slug
- event name
- year or date

Old slugs remain supported through slug history.

### Categories

Each category can define:

- one or more phases
- group stages
- knockout rounds
- group-to-field assignments
- schedule rules
- referee assignment rules

## Tests

Backend test suite:

```bash
cd backend
source venv/bin/activate
pytest tests -q
```

Current expected result:

- `40 passed`

Frontend production build:

```bash
cd frontend
npm run build
```

## Deployment

### Frontend

Recommended: Vercel

Set:

- root directory: `frontend`
- env var: `VITE_API_URL`

### Backend

Recommended: Render

Use:

- `backend/render.yaml`

Set these environment variables:

- `DATABASE_URL`
- `JWT_SECRET`
- `ALLOWED_ORIGINS`
- `ENVIRONMENT=production`
- `DEFAULT_ADMIN_EMAIL`
- `FRONTEND_URL`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USERNAME`
- `SMTP_PASSWORD`
- `SMTP_FROM_EMAIL`
- `SMTP_FROM_NAME`
- `SMTP_USE_TLS`
- `RESET_TOKEN_EXPIRE_MINUTES`

If you want image uploads to persist in production, also set:

- `SUPABASE_URL`
- `SUPABASE_KEY`
- `SUPABASE_BUCKET`

Dangerous maintenance option:

- `ENABLE_DB_RESET_API=false`
- `DB_RESET_API_KEY`

Suggested backend setup:

1. create a Render PostgreSQL database
2. create a Render web service from the repo
3. set root directory to `backend`
4. apply `backend/render.yaml` or use the same build/start commands manually
5. set `DATABASE_URL` to the internal database URL from Render
6. set `ALLOWED_ORIGINS` to your frontend URL, for example `https://your-app.vercel.app`
7. set `FRONTEND_URL` to the public frontend URL, for example `https://your-app.vercel.app`
8. set `DEFAULT_ADMIN_EMAIL` so the first admin user is created automatically, then complete the first access password setup from the frontend
9. configure SMTP variables if you want password reset emails to work in production

For a brand-new empty database, the build step initializes the current schema before running Alembic, so first deploys on Render do not fail on legacy additive migrations.

### Database

Use either:

- Render PostgreSQL
- Supabase PostgreSQL
- another PostgreSQL provider

### Recommended Shared Setup

For a simple public deployment, use:

- frontend on Vercel
- backend API on Render
- PostgreSQL on Render
- image storage on Supabase Storage

Why this combination:

- Vercel is a good fit for the Vite frontend
- Render is a good fit for a FastAPI web service
- the backend already includes a Render config
- local filesystem uploads are not persistent on typical cloud hosts, so Supabase Storage avoids broken images after redeploys or restarts
- password reset emails require a real SMTP configuration in production

## Notes

- Facilities are managed at organization level
- Teams are defined in the event/category workflow
- Gatherings and tournaments share the same engine, but gatherings are guided toward simpler formulas
- Public pages are theme-aware and can include sponsor logos
