# 13 — Deployment

## Deployment options

### 13.1 · Local (Docker Compose) — fastest
```bash
git clone <repo> formforge
cd formforge
docker compose up -d
```
Services: `mongo`, `backend`, `frontend`.
See `docker-compose.yml` at the repo root.

### 13.2 · Local (Bare metal Windows/Mac/Linux)

**Backend**
```bash
cd backend
python -m venv .venv
source .venv/bin/activate           # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn server:app --port 8001
```

**Frontend**
```bash
cd frontend
yarn install
cp .env.example .env
yarn start
```

**Prerequisite**: MongoDB running on `mongodb://localhost:27017`.

### 13.3 · Production (single VM)

```
┌─ nginx (443 → 8001 backend, 3000 frontend, ws upgrade for /ws) ─┐
│                                                                 │
│      ┌────────────────┐    ┌────────────────┐    ┌────────┐    │
│      │ formforge-fe   │    │ formforge-be   │    │ mongo  │    │
│      │ built + served │    │ uvicorn + supd │    │        │    │
│      └────────────────┘    └────────────────┘    └────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

- **nginx** terminates TLS, reverse-proxies `/api/*` → `backend:8001`, `/ws/*` → `backend:8001` with `Upgrade: websocket`, rest → frontend static build.
- **frontend** built with `yarn build` and served via nginx (`/frontend/build`).
- **backend** runs under `supervisord` with 2–4 uvicorn workers behind a shared Motor client.
- **mongo** local install + daily backup.py via cron.

### 13.4 · Kubernetes (roadmap)

Manifests + Helm chart would provide:
- StatefulSet for MongoDB with PVC
- Deployment for backend (rollingUpdate)
- Deployment for frontend
- Ingress with cert-manager (Let's Encrypt)
- PVC mounted at `/app/uploads`

## Environment variables

### Backend (`backend/.env`)

| Variable | Required | Default | Notes |
|----------|:--:|---------|-------|
| `MONGO_URL` | ✅ | `mongodb://localhost:27017` | full connection string |
| `DB_NAME` | ✅ | `formforge` | |
| `JWT_SECRET` | ✅ | `dev-secret` | **change** in prod |
| `JWT_EXPIRE_HOURS` |  | `168` (7 days) | auth token TTL |
| `DOWNLOAD_TOKEN_HOURS` |  | `24` | anonymous filled-PDF TTL |
| `SEED_ADMIN_EMAIL` |  | `admin@example.com` | first-boot super admin |
| `SEED_ADMIN_PASSWORD` |  | `Admin@12345` | ⚠ change in prod |
| `SEED_ADMIN_NAME` |  | `Super Admin` | |
| `MAX_UPLOAD_MB` |  | `25` | per-file size limit |
| `LOCAL_UPLOAD_ROOT` |  | `backend/uploads/local` | absolute path OK |
| `CORS_ORIGINS` |  | `*` | comma-list for prod |
| `SMTP_HOST` |  | — | needed for workflow email |
| `SMTP_PORT` |  | `587` | |
| `SMTP_USER` / `SMTP_PASSWORD` |  | — | |
| `SMTP_FROM` |  | `no-reply@formforge.local` | |
| `EMERGENT_LLM_KEY` |  | — | optional; enables built-in AI helpers |

### Frontend (`frontend/.env`)

| Variable | Required | Notes |
|----------|:--:|-------|
| `REACT_APP_BACKEND_URL` | ✅ | e.g. `http://localhost:8001` |
| `WDS_SOCKET_PORT` |  | `3000` — for CRA hot reload |
| `ENABLE_HEALTH_CHECK` |  | `false` for local |

## First-boot behaviour

`server.py::_seed_demo_users` runs on startup and idempotently ensures:

- `admin@example.com` (super_admin)
- `rahul.verma@example.com` (cluster admin, region=North)
- `south.admin@example.com` (regional admin, region=South)
- `vendor.admin@sunops.example.com` (vendor admin)
- `vendor.user@sunops.example.com` (vendor user)

Passwords: `Admin@12345` for admins, `Vendor@12345` for vendors.

Also seeds:
- 3 sample `sites` with regions
- 1 sample `vendor` (SunOps)
- Default 4-row `regions` collection

## Zero-downtime deploys (backend)

1. `git pull`
2. `pip install -r requirements.txt` (fast if no changes)
3. `supervisorctl restart backend` — Motor connections drop and re-establish; open WebSockets drop and reconnect from client.

Frontend rebuild is a `yarn build` + `nginx -s reload`.

## Monitoring (roadmap)
- Prometheus metrics endpoint (`/metrics`) — not yet.
- Sentry SDK for backend exceptions — not yet.
- Structured JSON logs — partially in place.

## Backup schedule (production)

- Local: cron nightly `python backup.py --keep 30`
- Remote: `rsync` last 30 zips to S3-compatible bucket
- Restore drill: monthly test on staging

See `backup.py` / `restore.py` at `backend/`.
