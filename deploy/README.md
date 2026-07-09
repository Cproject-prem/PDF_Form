# FormForge — Online (DNS) Deployment Guide

Deploy FormForge behind a public DNS like `https://formforge.mycompany.com`
using **nginx + Let's Encrypt + Docker Compose**. Total time: ~20 minutes on
a fresh VM.

---

## 1. Prerequisites

- A server (any Linux) with a public IP
- A DNS `A` record pointing your domain (e.g. `formforge.mycompany.com`)
  at that IP
- Docker + docker-compose plugin installed
- Ports **80** and **443** open on the firewall

---

## 2. Files you'll edit

```
/app
├── backend/.env             ← production secrets (see step 3)
├── frontend/.env            ← leave REACT_APP_BACKEND_URL empty (same-origin)
├── deploy/
│   ├── nginx.conf           ← change `server_name` to your DNS
│   └── certs/               ← put fullchain.pem + privkey.pem here
├── docker-compose.yml       ← unchanged
└── docker-compose.prod.yml  ← production overlay (already committed)
```

---

## 3. Backend `.env` for production

```dotenv
MONGO_URL="mongodb://mongo:27017"
DB_NAME="formforge"

APP_NAME="FormForge"
CORS_ORIGINS="https://formforge.mycompany.com"    # your DNS ONLY

# 32+ character random hex — never commit this
JWT_SECRET="<paste 64 hex characters here>"
JWT_EXPIRE_HOURS="168"

SEED_ADMIN_EMAIL="admin@mycompany.com"
SEED_ADMIN_PASSWORD="<a strong password>"
SEED_ADMIN_NAME="System Admin"

SECURITY_STRICT="true"     # refuses to boot with a weak JWT_SECRET
SECURITY_HTTPS="true"      # emits HSTS header

LOGIN_MAX_ATTEMPTS="8"
LOGIN_WINDOW_SECONDS="900"

MAX_UPLOAD_MB="25"
```

Generate a strong JWT secret:

```bash
openssl rand -hex 32
```

---

## 4. Frontend `.env` for production

```dotenv
# EMPTY — the browser will use the current origin (https://formforge.mycompany.com)
# and hit /api which nginx proxies to the backend container.
REACT_APP_BACKEND_URL=
```

Then rebuild the static bundle **with this env baked in**:

```bash
docker compose build frontend
```

---

## 5. TLS certificates (Let's Encrypt)

Easiest one-shot with certbot on the host:

```bash
sudo apt install certbot -y
sudo certbot certonly --standalone -d formforge.mycompany.com

# Copy the resulting certs into ./deploy/certs
sudo cp /etc/letsencrypt/live/formforge.mycompany.com/fullchain.pem ./deploy/certs/
sudo cp /etc/letsencrypt/live/formforge.mycompany.com/privkey.pem   ./deploy/certs/
sudo chmod 644 ./deploy/certs/*.pem
```

_Alternative_: point Cloudflare in front and use their **Origin Certificates**.

---

## 6. Point nginx at your DNS

Edit `deploy/nginx.conf` and change **two lines**:

```nginx
server_name formforge.mycompany.com;   # ← both blocks
```

---

## 7. Launch

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  up -d --build
```

Open `https://formforge.mycompany.com` in a browser and log in.

---

## 8. Verify

| Check | Command / URL |
|-------|---------------|
| App loads over HTTPS  | https://formforge.mycompany.com |
| API healthy           | `curl https://formforge.mycompany.com/api/health` |
| WebSocket upgrades    | Watch nginx log for `101` on `/api/notifications/ws` |
| HSTS header present   | `curl -I https://... \| grep -i strict-transport` |
| Login stops on wrong password (rate-limit) | 9th wrong password → HTTP 429 |

---

## 9. Renew TLS every ~60 days

```bash
sudo certbot renew --quiet
sudo cp /etc/letsencrypt/live/formforge.mycompany.com/*.pem ./deploy/certs/
docker compose restart nginx
```

Or, easier: use Cloudflare's edge TLS + long-lived Origin Cert.

---

## 10. Alternative — separate API subdomain

If you prefer `app.mycompany.com` + `api.mycompany.com`:

1. Point a second `A` record at the same IP for `api.mycompany.com`
2. Add a second `server` block in `deploy/nginx.conf` that only serves `/`
   and proxies to `backend:8001`
3. In `frontend/.env` set
   `REACT_APP_BACKEND_URL=https://api.mycompany.com`
4. In `backend/.env` set
   `CORS_ORIGINS=https://app.mycompany.com`

Rebuild the frontend and redeploy.

---

## Common issues

| Symptom | Fix |
|---------|-----|
| Browser shows "Mixed content" or CORS error | `frontend/.env` still has `http://localhost:8001`. Set it to `""` (empty) and rebuild the frontend container. |
| 502 Bad Gateway from nginx | Backend container isn't up yet. `docker compose logs backend` — usually a missing `MONGO_URL` or `JWT_SECRET`. |
| `SECURITY_STRICT` refuses to boot | JWT secret is too short OR `CORS_ORIGINS="*"`. Regenerate the secret and pin CORS to your exact DNS. |
| WebSocket disconnects every ~60s | nginx `proxy_read_timeout` — already set to 3600s in the sample conf; increase further if needed. |
| File uploads fail at 25 MB | Raise `MAX_UPLOAD_MB` in backend `.env` **and** `client_max_body_size` in nginx.conf. |

---

## Backup & Restore (production)

```bash
# Nightly cron
docker compose exec backend python backup.py --out /backups/formforge-$(date +%F).tar.gz

# Restore
docker compose exec backend python restore.py --archive /backups/formforge-2026-02-14.tar.gz
```
