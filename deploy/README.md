# FormForge — Production (DNS/HTTPS) Deployment Guide

Deploy FormForge behind a public DNS like `https://formforge.mycompany.com`
using **nginx + Let's Encrypt + Docker Compose**. Total time: ~30 minutes on a fresh VM.

---

## Architecture (Production)

```
Internet
    │  :443 (HTTPS)
    ▼
nginx (gateway container)
    ├── /          → frontend (React static bundle)
    ├── /api/*     → backend (FastAPI :8001)
    └── /api/ws    → backend WebSocket
                         │
                         ▼ (internal Docker network only)
                   formforge-ai  (:9000)
                         │
                         ▼ (internal Docker network only)
                   ollama  (:11434)
```

No AI service or Ollama port is exposed to the public internet.

---

## Prerequisites

- Linux server (Ubuntu 22.04+ recommended) or Windows Server 2019+
- Docker Engine + Docker Compose plugin installed
- DNS A record pointing your domain at the server's public IP
- Ports 80 and 443 open on the firewall
- 16 GB RAM recommended; 8 GB minimum (without Ollama)
- 50 GB free disk space

---

## Step 1 — Get the Code

```bash
git clone <this-repo> /app/formforge
cd /app/formforge
```

---

## Step 2 — Backend .env for Production

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env`:
```
MONGO_URL=mongodb://mongo:27017
DB_NAME=formforge
APP_NAME=FormForge

# SECURITY — never commit these
JWT_SECRET=<paste 96 hex chars — see below>
JWT_EXPIRE_HOURS=168

CORS_ORIGINS=https://formforge.mycompany.com
SECURITY_STRICT=true
SECURITY_HTTPS=true

SEED_ADMIN_EMAIL=admin@mycompany.com
SEED_ADMIN_PASSWORD=<strong password>
SEED_ADMIN_NAME=System Admin

LOGIN_MAX_ATTEMPTS=8
LOGIN_WINDOW_SECONDS=900
MAX_UPLOAD_MB=25

AI_ENABLED=true
AI_SERVICE_URL=http://formforge-ai:9000
AI_REQUEST_TIMEOUT=30.0
AI_CONNECT_TIMEOUT=5.0

SMTP_HOST=smtp.mycompany.com
SMTP_PORT=587
SMTP_USER=formforge@mycompany.com
SMTP_PASSWORD=<app password>
SMTP_FROM=FormForge <formforge@mycompany.com>
```

Generate the JWT secret:
```bash
openssl rand -hex 48
```

---

## Step 3 — Frontend .env for Production

```bash
# Leave REACT_APP_BACKEND_URL empty so the browser uses same-origin /api
echo "REACT_APP_BACKEND_URL=" > frontend/.env
```

---

## Step 4 — TLS Certificates

### Option A — Let's Encrypt (public internet)

```bash
sudo apt install certbot -y
sudo certbot certonly --standalone -d formforge.mycompany.com

mkdir -p ./deploy/certs
sudo cp /etc/letsencrypt/live/formforge.mycompany.com/fullchain.pem ./deploy/certs/
sudo cp /etc/letsencrypt/live/formforge.mycompany.com/privkey.pem ./deploy/certs/
sudo chmod 644 ./deploy/certs/*.pem
```

### Option B — Corporate/Internal Certificate

```bash
mkdir -p ./deploy/certs
# Place your certificate files:
cp /path/to/your/fullchain.pem ./deploy/certs/
cp /path/to/your/privkey.pem ./deploy/certs/
```

### Option C — Self-Signed (testing only)

```bash
openssl req -x509 -newkey rsa:4096 \
  -keyout ./deploy/certs/privkey.pem \
  -out ./deploy/certs/fullchain.pem \
  -days 365 -nodes \
  -subj "/CN=formforge.mycompany.com"
```

---

## Step 5 — Configure nginx Domain

Edit `nginx/default.conf` and update the `server_name` directive:
```nginx
server_name formforge.mycompany.com;
```

---

## Step 6 — Build & Launch

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  up -d --build
```

Check all services:
```bash
docker compose ps
```

All services should show status: Up (healthy).

---

## Step 7 — Pull Ollama Model (first-time)

```bash
# Wait for Ollama container to be up first
docker compose exec ollama ollama pull gemma

# OR for servers with < 8 GB RAM:
docker compose exec ollama ollama pull gemma:2b
```

One-time download (~5 GB for gemma, ~1.5 GB for gemma:2b).
The model persists in the `formforge_ollama_models` Docker volume.

---

## Step 8 — Verify

| Check | Command |
|---|---|
| App loads over HTTPS | Open https://formforge.mycompany.com |
| API healthy | `curl https://formforge.mycompany.com/api/health` |
| AI status | `curl https://formforge.mycompany.com/api/ai/status` |
| WebSocket | Check nginx logs for `101` on `/api/notifications/ws` |
| HSTS header | `curl -I https://formforge.mycompany.com | grep -i strict-transport` |

---

## Step 9 — Renew TLS (Let's Encrypt, every ~60 days)

```bash
sudo certbot renew --quiet
sudo cp /etc/letsencrypt/live/formforge.mycompany.com/*.pem ./deploy/certs/
docker compose restart gateway
```

**Automate with cron:**
```bash
# /etc/cron.d/formforge-cert-renew
0 3 * * 1 root certbot renew --quiet && \
  cp /etc/letsencrypt/live/formforge.mycompany.com/*.pem /app/formforge/deploy/certs/ && \
  docker compose -f /app/formforge/docker-compose.yml restart gateway
```

---

## Backup & Restore

### Daily Backup

```bash
#!/bin/bash
# /etc/cron.d/formforge-backup — runs at 2:00 AM daily
DATE=$(date +%F)
BACKUP_DIR=/backups/formforge/$DATE
mkdir -p $BACKUP_DIR

# Database
docker compose exec -T mongo mongodump \
  --uri="mongodb://localhost:27017/formforge" \
  --archive=$BACKUP_DIR/db.gz --gzip

# Uploads (user files, PDFs)
docker run --rm \
  -v formforge_uploads:/data \
  -v $BACKUP_DIR:/backup \
  alpine tar czf /backup/uploads.tar.gz /data

# Vector store (AI knowledge index)
docker run --rm \
  -v formforge_vector_data:/data \
  -v $BACKUP_DIR:/backup \
  alpine cp /data/index.json /backup/vector_db.json

echo "Backup complete: $BACKUP_DIR"
```

### Restore Database

```bash
docker compose exec -T mongo mongorestore \
  --uri="mongodb://localhost:27017/formforge" \
  --archive=/backups/formforge/2026-08-12/db.gz --gzip --drop
```

---

## Common Issues

| Symptom | Fix |
|---|---|
| `502 Bad Gateway` | Backend not up yet — `docker compose logs backend` |
| Mixed content / CORS error | Set `REACT_APP_BACKEND_URL=` (empty) and rebuild frontend |
| SECURITY_STRICT boot refusal | JWT_SECRET too short or CORS_ORIGINS is `*` |
| AI status "unavailable" | `docker compose restart formforge-ai` |
| Ollama model not found | `docker compose exec ollama ollama pull gemma` |
| WebSocket disconnects at 60s | Add `proxy_read_timeout 3600s;` to nginx.conf |
| File upload fails at 25 MB | Increase `client_max_body_size` in nginx.conf + `MAX_UPLOAD_MB` in backend/.env |

---

## Security Hardening Checklist

- [ ] JWT_SECRET is 48+ hex characters, never committed to git
- [ ] CORS_ORIGINS is set to exact domain (not *)
- [ ] SECURITY_STRICT=true and SECURITY_HTTPS=true
- [ ] All demo passwords changed from defaults
- [ ] MongoDB port 27017 not exposed to public internet
- [ ] AI service port 9000/9005 not exposed to public internet
- [ ] Ollama port 11434 not exposed to public internet
- [ ] TLS certificate is valid and not expired
- [ ] Daily backup job configured and tested with a restore drill
- [ ] SMTP uses app-specific password, not account password
- [ ] Server firewall allows only 80 and 443 inbound (drop all other inbound)
