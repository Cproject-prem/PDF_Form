# 24. FormForge — Deployment Runbook

Step-by-step deployment procedures for all environments.

---

## Environment Overview

| Environment | Purpose | Docker | AI Service | Ollama |
|---|---|---|---|---|
| Development | Local dev with hot-reload | Optional | Optional | Optional |
| UAT / Staging | Integration & security testing | Yes | Yes | Yes |
| Production | On-premise solar plant server | Yes | Yes | Yes |

---

## Environment Configuration Matrix

| Variable | Development | UAT | Production |
|---|---|---|---|
| `SECURITY_STRICT` | `false` | `true` | `true` |
| `SECURITY_HTTPS` | `false` | `true` | `true` |
| `CORS_ORIGINS` | `*` | `https://uat.company.com` | `https://app.company.com` |
| `JWT_SECRET` | Short dev string | 48-byte hex | 64-byte hex |
| `AI_ENABLED` | `true` | `true` | `true` |
| `AI_SERVICE_URL` | `http://localhost:9005` | `http://formforge-ai:9000` | `http://formforge-ai:9000` |
| `OLLAMA_URL` | `http://localhost:11434` | `http://ollama:11434` | `http://ollama:11434` |
| `OLLAMA_MODEL` | `gemma` or `gemma:2b` | `gemma` | `gemma` |

---

## Production Deployment — Step by Step

### Prerequisites
- Windows Server 2019+ or Linux server with Docker Engine installed
- 16 GB RAM recommended (8 GB minimum without Ollama)
- 50 GB free disk space (for MongoDB, uploads, and Ollama model)
- Ports 80 and 443 open if serving over HTTPS

---

### Step 1 — Get the Code

```powershell
git clone <this-repo> "D:\FormForge"
cd "D:\FormForge"
```

---

### Step 2 — Configure Secrets

```powershell
# Generate strong JWT secret
python -c "import secrets; print(secrets.token_hex(48))"

# Copy environment template
Copy-Item backend\.env.example backend\.env
```

Edit `backend\.env`:
```
MONGO_URL=mongodb://mongo:27017
DB_NAME=formforge
JWT_SECRET=<paste 96-char hex here>
SEED_ADMIN_EMAIL=admin@yourcompany.com
SEED_ADMIN_PASSWORD=<strong password>
CORS_ORIGINS=https://your-domain.com
SECURITY_STRICT=true
SECURITY_HTTPS=true
AI_ENABLED=true
AI_SERVICE_URL=http://formforge-ai:9000
AI_REQUEST_TIMEOUT=30.0
SMTP_HOST=smtp.yourcompany.com
SMTP_PORT=587
SMTP_USER=formforge@yourcompany.com
SMTP_PASSWORD=<smtp app password>
```

---

### Step 3 — TLS Certificates (HTTPS)

Place your certificate files in `./deploy/certs/`:
```
deploy/certs/fullchain.pem
deploy/certs/privkey.pem
```

For Let's Encrypt (Linux):
```bash
sudo apt install certbot
sudo certbot certonly --standalone -d your-domain.com
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ./deploy/certs/
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem ./deploy/certs/
```

For self-signed (internal network / testing):
```powershell
openssl req -x509 -newkey rsa:4096 -keyout deploy\certs\privkey.pem `
  -out deploy\certs\fullchain.pem -days 365 -nodes `
  -subj "/CN=formforge.local"
```

---

### Step 4 — Configure nginx Domain

Edit `nginx/default.conf`, change `server_name` to your domain:
```nginx
server_name your-domain.com;
```

---

### Step 5 — Build & Launch All Services

```bash
# Production overlay (includes TLS + hardened settings)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Check all services are running:
```bash
docker compose ps
```

Expected output — all services should show "Up":
```
NAME                STATUS
formforge-backend   Up (healthy)
formforge-frontend  Up
formforge-ai        Up (healthy)
formforge-mongo     Up (healthy)
formforge-ollama    Up (healthy)
formforge-gateway   Up
```

---

### Step 6 — Pull Ollama Model (first-time only)

```bash
docker exec -it formforge-ollama ollama pull gemma
# OR for servers with < 8 GB RAM:
docker exec -it formforge-ollama ollama pull gemma:2b
```

This downloads ~5 GB (gemma) or ~1.5 GB (gemma:2b). Only needed once — stored in the `formforge_ollama_models` Docker volume.

---

### Step 7 — Verify All Services

```bash
# Core backend health
curl https://your-domain.com/api/health

# AI microservice health (component-level)
docker compose exec formforge-ai curl http://localhost:9000/health

# AI status via backend proxy
curl https://your-domain.com/api/ai/status

# Ollama model list
docker exec formforge-ollama ollama list
```

**Expected `/api/ai/status` response when fully healthy:**
```json
{
  "status": "healthy",
  "ai_service": "healthy",
  "rag": "healthy",
  "ollama": "healthy"
}
```

---

### Step 8 — Seed Verification

Open your browser at `https://your-domain.com`.
Log in with the `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` you set.
Verify:
- Dashboard loads
- Can create a form
- AI Training page shows "AI Fully Active" (green badge)

---

## Development Setup (Bare-Metal)

### Step 1 — MongoDB
Install MongoDB 7 Community from mongodb.com.
Verify: `mongosh --eval "db.runCommand({ ping: 1 })"`

### Step 2 — Core Backend
```powershell
cd backend
python -m venv .venv; .venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env   # edit: set MONGO_URL, JWT_SECRET
uvicorn server:app --reload --port 8001
```

### Step 3 — Frontend
```powershell
cd frontend
yarn install
# .env: REACT_APP_BACKEND_URL=http://localhost:8001
yarn start
```

### Step 4 — AI Microservice (optional)
```powershell
cd ai-service
python -m venv .venv; .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 9005
```
Then set in backend/.env: `AI_SERVICE_URL=http://localhost:9005`

### Step 5 — Ollama (optional, for AI chat)
```powershell
# Download: https://ollama.com/download/OllamaSetup.exe
# After installing:
ollama pull gemma          # ~5 GB
# OR:
ollama pull gemma:2b       # ~1.5 GB
```

### Step 6 — WhatsApp Server (optional)
```powershell
cd whatsapp-server
npm install
npm start                  # scan QR code with phone
```

---

## Rollback Procedure

```bash
# Stop the stack
docker compose -f docker-compose.yml -f docker-compose.prod.yml down

# Checkout the previous release tag
git checkout v1.x.x-previous

# Restart with previous build
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

---

## Backup & Restore

### Backup (run daily via Task Scheduler / cron)

```powershell
# Database
$date = Get-Date -Format 'yyyyMMdd'
docker exec formforge-mongo mongodump `
  --uri="mongodb://localhost:27017/formforge" `
  --archive="/backups/formforge-db-$date.gz" --gzip

# Uploads
docker run --rm `
  -v formforge_uploads:/data `
  -v D:\Backups:/backup `
  alpine tar czf /backup/uploads-$date.tar.gz /data

# Vector store
docker run --rm `
  -v formforge_vector_data:/data `
  -v D:\Backups:/backup `
  alpine cp /data/index.json /backup/vector_db-$date.json
```

### Restore Database

```powershell
docker exec formforge-mongo mongorestore `
  --uri="mongodb://localhost:27017/formforge" `
  --archive="/backups/formforge-db-20260812.gz" --gzip --drop
```

---

## Common Issues

| Symptom | Cause | Fix |
|---|---|---|
| 502 Bad Gateway | Backend container not healthy yet | `docker compose logs backend` — check MongoDB connection |
| AI status shows "unavailable" | formforge-ai container crashed | `docker compose restart formforge-ai` |
| Ollama model not found error | Model not pulled | `docker exec formforge-ollama ollama pull gemma` |
| CORS errors in browser | Wrong CORS_ORIGINS in .env | Set `CORS_ORIGINS=https://your-domain.com` (no trailing slash) |
| SECURITY_STRICT refuses boot | JWT_SECRET too short | Generate new: `python -c "import secrets; print(secrets.token_hex(48))"` |
| File uploads fail > 25 MB | nginx body size limit | Increase `client_max_body_size` in nginx/default.conf and `MAX_UPLOAD_MB` in backend/.env |
| WebSocket disconnects | nginx timeout | Increase `proxy_read_timeout 3600s;` in nginx.conf |
| WhatsApp QR not showing | Node.js / Chromium version | Ensure Node.js 20+; run `npm install` in whatsapp-server/ |

---

## Security Checklist

- [ ] `JWT_SECRET` is 48+ hex characters and stored only in `.env` (not in git)
- [ ] `CORS_ORIGINS` is set to your exact domain (not `*`)
- [ ] `SECURITY_STRICT=true` and `SECURITY_HTTPS=true` in production
- [ ] All demo account passwords changed from defaults
- [ ] MongoDB not exposed on public interface (only `127.0.0.1:27017` or Docker internal)
- [ ] Ollama port 11434 not exposed outside Docker network
- [ ] AI service port 9005/9000 not exposed outside Docker network
- [ ] TLS certificate valid and not self-signed for public deployments
- [ ] Daily backup job configured and tested
- [ ] SMTP credentials are app-specific passwords, not account passwords
