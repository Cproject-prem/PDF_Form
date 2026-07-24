# FormForge — Docker Deployment Guide

Portable single-command boot for the whole stack. Runs on **Linux**
(Ubuntu / Debian tested) and on **Windows Docker Desktop**. Everything
below is copy-paste ready.

---

## 1. Prerequisites

| Tool | Minimum | Notes |
|------|---------|-------|
| Docker | 24.x  | `docker --version` |
| Docker Compose plugin | v2  | Included with Docker Desktop; on Linux install `docker-compose-plugin` |

---

## 2. Layout

```
/app
├── Dockerfile.backend         # FastAPI + mongodump + fonts
├── Dockerfile.frontend        # React build → nginx:alpine
├── docker-compose.yml         # 4 services: mongo + backend + frontend + gateway
├── nginx/
│   ├── default.conf           # gateway: /api → backend, /* → frontend, WS support
│   └── frontend.conf          # fallback config used inside frontend image
├── backend/
│   ├── .env                   # copy from .env.example, edit as needed
│   ├── requirements.txt
│   └── … (server.py, backup_routes.py, plant_docs_routes.py, etc.)
└── frontend/
    ├── package.json
    └── … (src/, public/, …)
```

---

## 3. First-time boot

```bash
cd /app

# 1. copy env
cp backend/.env.example backend/.env
#    edit JWT_SECRET at minimum — use `openssl rand -hex 32`

# 2. build + start (~5 min first time)
docker compose up -d --build

# 3. verify
docker compose ps
docker compose logs -f backend      # Ctrl-C to detach

# 4. open http://localhost/  →  sign in with admin@example.com / Admin@12345
```

Common follow-ups:

```bash
docker compose logs -f backend             # backend logs (tail)
docker compose exec backend bash           # shell into backend container
docker compose exec mongo mongosh          # mongo REPL
docker compose down                        # stop, keep volumes
docker compose down -v                     # stop AND WIPE data (careful!)
docker compose pull && docker compose up -d --build    # upgrade in place
```

---

## 4. Volumes (survives `docker compose down`)

| Volume | Contents |
|--------|----------|
| `formforge_mongo_data`    | MongoDB dataset |
| `formforge_uploads`       | User uploads + plant documents |
| `formforge_completed`     | Generated filled PDFs |
| `formforge_assets`        | Image assets |
| `formforge_pdf_templates` | Uploaded PDF template originals |
| `formforge_backups`       | `.tar.gz` snapshots created by the Backup & Restore feature |

Inspect from the host:

```bash
docker volume ls | grep formforge
docker run --rm -v formforge_uploads:/vol alpine ls -R /vol
```

---

## 5. Building images individually

```bash
# backend only
docker build -f Dockerfile.backend -t formforge-backend:latest .

# frontend only (embed a fixed backend URL — otherwise leave blank)
docker build -f Dockerfile.frontend \
  --build-arg REACT_APP_BACKEND_URL="" \
  -t formforge-frontend:latest .
```

Run standalone (for testing an image outside the compose network):

```bash
docker run --rm -p 8001:8001 --env-file backend/.env formforge-backend:latest
```

---

## 6. Moving the stack to another host

The stack is fully volume-backed, so migration is:

```bash
# on the SOURCE host
docker compose stop
docker run --rm -v formforge_uploads:/vol -v $PWD:/backup alpine \
       tar czf /backup/uploads.tar.gz -C /vol .
docker run --rm -v formforge_mongo_data:/vol -v $PWD:/backup alpine \
       tar czf /backup/mongo.tar.gz  -C /vol .
scp uploads.tar.gz mongo.tar.gz user@new-host:/tmp/

# on the DESTINATION host
docker compose up -d --no-start
docker run --rm -v formforge_uploads:/vol -v /tmp:/in alpine \
       tar xzf /in/uploads.tar.gz -C /vol
docker run --rm -v formforge_mongo_data:/vol -v /tmp:/in alpine \
       tar xzf /in/mongo.tar.gz  -C /vol
docker compose up -d
```

Or use the in-app **Backup & Restore** feature (Settings → Backup & Restore
→ "Backup now") to download a single `.tar.gz` you can upload on the new
box.

---

## 7. Ports & security notes

* **Port 80** is exposed on the gateway.  For HTTPS: put another nginx /
  Caddy / Traefik in front, or extend `nginx/default.conf` with a `listen 443 ssl` block and mount your certs.
* Mongo is exposed on **port 27017** for developer convenience — remove
  the `ports:` block on the `mongo` service in production.
* Set `SECURITY_STRICT="true"` and a strong `JWT_SECRET` in `backend/.env`
  before exposing the stack publicly.

---

## 8. Troubleshooting

| Symptom | Fix |
|---|-----|
| `docker compose up` hangs on frontend build | Increase Docker Desktop memory to ≥ 4 GB; `yarn install` needs it |
| `mongodump not installed` when running Backup | You’re NOT using the provided `Dockerfile.backend`. Rebuild: `docker compose build backend` |
| Login shows "Invalid credentials" after restore | The seeded super admin's `password_hash` was replaced by the restored dataset. Rotate: edit `SEED_ADMIN_PASSWORD` in `.env`, `docker compose restart backend`, then log in with the new password (the idempotent seed re-hashes on boot) |
| CORS errors from browser | Set `CORS_ORIGINS="https://your-domain"` in `.env` |
| 502 from gateway | Backend probably crashed — `docker compose logs backend --tail 100` |
