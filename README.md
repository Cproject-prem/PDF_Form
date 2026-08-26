# FormForge — Complete Setup & Operations Guide

> **Solar Plant O&M Platform** — Self-hosted form builder, PDF automation, RAG knowledge base,
> workflow engine, and WhatsApp alerts. Designed for on-premise deployment at solar plant sites.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FORMFORGE PLATFORM                           │
│                                                                     │
│  ┌───────────┐     ┌──────────────┐     ┌──────────────────────┐  │
│  │  Frontend  │────▶│    NGINX     │────▶│  Core Backend API    │  │
│  │  React 18  │     │  (Gateway)   │     │  FastAPI   :8001     │  │
│  │   :3000    │     │    :80       │     │  MongoDB   :27017    │  │
│  └───────────┘     └──────────────┘     └──────────┬───────────┘  │
│                                                      │              │
│                          ┌───────────────────────────┘              │
│                          ▼                                           │
│            ┌─────────────────────────┐                              │
│            │  AI Microservice        │  ◀── Isolated / Optional     │
│            │  FastAPI  :9005         │                              │
│            │  Vector Store (RAG)     │                              │
│            └────────────┬────────────┘                              │
│                         ▼                                           │
│            ┌─────────────────────────┐                              │
│            │  Ollama LLM Engine      │  ◀── Local Gemma model      │
│            │  :11434                 │       (Optional for chat)    │
│            └─────────────────────────┘                              │
│                                                                     │
│  ┌───────────────────────┐                                          │
│  │  WhatsApp Server      │  ◀── Node.js / whatsapp-web.js          │
│  │  :3001                │       (Optional for alerts)              │
│  └───────────────────────┘                                          │
└─────────────────────────────────────────────────────────────────────┘
```

**Key Design Principle:** The AI microservice is completely isolated. If Ollama or the AI service
goes offline, **100% of core FormForge functionality continues working** — forms, PDF templates,
submissions, workflows, approvals, and reports are entirely unaffected.

---

## Services & Ports

| Service | Port | Technology | Required |
|---|---|---|---|
| Frontend | 3000 (dev) / 80 (prod) | React 18 + CRA/craco | Yes |
| Core Backend API | 8001 | FastAPI + Motor + MongoDB | Yes |
| MongoDB | 27017 | MongoDB 7 | Yes |
| AI Microservice | 9005 (bare-metal) / 9000 (Docker) | FastAPI + httpx | Optional |
| Ollama LLM | 11434 | Ollama (Gemma model) | Optional (AI chat only) |
| WhatsApp Server | 3001 | Node.js + whatsapp-web.js | Optional |

---

## TL;DR — Fastest Start (Docker)

```bash
git clone <this-repo> formforge
cd formforge
docker compose up
```

Open **http://localhost** in your browser and sign in:

| Email | Password |
|---|---|
| admin@example.com | Admin@12345 |

Stop: `docker compose down`
Wipe all data: `docker compose down -v`

---

## Option A — Docker (Recommended for Production)

### Prerequisites
- Docker Desktop (Windows/macOS) or Docker Engine + Compose plugin (Linux)
- 8 GB RAM minimum; 16 GB recommended if running Ollama

### Step 1 — Clone & configure

```bash
git clone <this-repo> formforge
cd formforge
cp backend/.env.example backend/.env
```

Edit `backend/.env` — minimum required:
```
MONGO_URL=mongodb://mongo:27017
DB_NAME=formforge
JWT_SECRET=<generate: openssl rand -hex 32>
SEED_ADMIN_EMAIL=admin@example.com
SEED_ADMIN_PASSWORD=Admin@12345
AI_SERVICE_URL=http://formforge-ai:9000
```

### Step 2 — Start the stack

```bash
# All services including AI + Ollama
docker compose up -d

# Core only (no AI, no Ollama)
docker compose up -d mongo backend frontend gateway
```

### Step 3 — Pull the Gemma model (first-time only, ~5 GB)

```bash
# After Ollama container starts:
docker exec -it <ollama-container-id> ollama pull gemma

# Or if tight on RAM, use the 2B variant (~1.5 GB):
docker exec -it <ollama-container-id> ollama pull gemma:2b
```

### Step 4 — Verify all services

```bash
docker compose ps
curl http://localhost/api/health           # Core backend
```

### Step 5 — Open the app

- App: http://localhost
- API Docs: http://localhost/api/docs
- AI Health: http://localhost/api/ai/status

### Docker Commands Reference

```bash
docker compose up -d              # Start all services
docker compose down               # Stop all (data preserved)
docker compose down -v            # Stop + wipe all volumes (fresh start)
docker compose logs -f backend    # Tail backend logs
docker compose logs -f formforge-ai  # Tail AI service logs
docker compose restart backend    # Restart single service
```

---

## Option B — Bare-Metal / Local Development

### Prerequisites

| Tool | Version | Install |
|---|---|---|
| Python | 3.11+ | python.org |
| Node.js | 20+ | nodejs.org |
| Yarn | Latest | npm install -g yarn |
| MongoDB | 7 Community | mongodb.com |
| Ollama | Latest | ollama.com/download (optional) |

---

### Step 1 — MongoDB

**Windows:** Download and install from mongodb.com. MongoDB starts automatically as a Windows service.

Verify:
```powershell
mongosh --eval "db.runCommand({ ping: 1 })"
# Should output: { ok: 1 }
```

---

### Step 2 — Core Backend (FastAPI)

Open Terminal 1:

```powershell
cd "D:\Website\PDF Form\backend"

python -m venv .venv
.venv\Scripts\activate

pip install -r requirements.txt

copy .env.example .env
# Edit .env — set JWT_SECRET and SMTP if needed

uvicorn server:app --reload --host 0.0.0.0 --port 8001
```

Backend running at: http://localhost:8001
API docs at: http://localhost:8001/docs
First boot auto-seeds demo users.

---

### Step 3 — Frontend (React)

Open Terminal 2:

```powershell
cd "D:\Website\PDF Form\frontend"

yarn install

# .env should contain:
# REACT_APP_BACKEND_URL=http://localhost:8001

yarn start
```

Frontend running at: http://localhost:3000

---

### Step 4 — AI Microservice (Optional)

Open Terminal 3:

```powershell
cd "D:\Website\PDF Form\ai-service"

python -m venv .venv
.venv\Scripts\activate

pip install -r requirements.txt

uvicorn main:app --host 0.0.0.0 --port 9005 --reload
```

AI service running at: http://localhost:9005
Health check: http://localhost:9005/health

Then in backend/.env:
```
AI_SERVICE_URL=http://localhost:9005
AI_ENABLED=true
```

---

### Step 5 — Ollama + Gemma (Optional, for AI Chat)

**Windows — Install Ollama:**
1. Download: https://ollama.com/download/OllamaSetup.exe
2. Run the installer (auto-starts as a background service)
3. Open a new terminal:

```powershell
ollama --version

# Pull Gemma model (~5 GB download, one-time):
ollama pull gemma

# OR low-RAM machines (~1.5 GB):
ollama pull gemma:2b

# Verify:
Invoke-RestMethod http://localhost:11434/api/tags | ConvertTo-Json
```

If you used gemma:2b, set env before starting ai-service:
```powershell
$env:OLLAMA_MODEL = "gemma:2b"
```

---

### Step 6 — WhatsApp Server (Optional)

Open Terminal 4:

```powershell
cd "D:\Website\PDF Form\whatsapp-server"
npm install
npm start
```

On first run, scan the QR code shown in the terminal with WhatsApp on your phone
(Settings -> Linked Devices -> Link a Device).

WhatsApp server running at: http://localhost:3001

---

### Step 7 — Verify All Services

```powershell
Invoke-RestMethod http://localhost:8001/api/health
Invoke-RestMethod http://localhost:9005/health | ConvertTo-Json -Depth 5
Invoke-RestMethod http://localhost:8001/api/ai/status | ConvertTo-Json
```

**AI Status States:**

| Badge | Meaning |
|---|---|
| AI Fully Active (green) | Microservice + RAG + Ollama all healthy |
| RAG Active · LLM Offline (blue) | Knowledge Base & RAG work; Ollama/chat offline |
| AI Service Offline (grey) | AI microservice unreachable; core app 100% unaffected |

---

## Directory Layout

```
formforge/
├── backend/                    Core FastAPI service
│   ├── server.py               Entry point — auth, forms, submissions, WebSocket
│   ├── ai_routes.py            AI & RAG proxy routes (talks to ai-service)
│   ├── pdf_routes.py           PDF template builder + filled-PDF generator
│   ├── vendor_routes.py        Master data — sites, vendors, regions, plants
│   ├── workflow_routes.py      Approval workflow engine, email notifications
│   ├── permissions.py          4-tier RBAC + row-level security
│   ├── formula_engine.py       Excel-like formula evaluator
│   ├── datasource_routes.py    Dropdown / lookup data sources
│   ├── requirements.txt
│   └── uploads/local/          User-uploaded files (auto-created)
│
├── ai-service/                 Isolated AI microservice (port 9005)
│   ├── main.py                 FastAPI app — /health, /ai/chat, /ai/rag/*
│   ├── config.py               Settings (OLLAMA_URL, OLLAMA_MODEL, etc.)
│   ├── health.py               Component-level health reporter
│   ├── services/ai_engine.py   LLM chat & summarization via Ollama
│   ├── rag/vector_store.py     Cosine-similarity vector search
│   ├── embeddings/             Text chunking + embedding generation
│   ├── data/vector_db/         Persistent vector index (JSON)
│   └── requirements.txt
│
├── frontend/                   React 18 app (CRA + craco)
│   ├── src/pages/              Top-level route pages
│   │   ├── AiTraining.jsx      AI dashboard, RAG, test-RAG, chat playground
│   │   ├── FormBuilder.jsx     Dynamic form designer
│   │   └── ...
│   ├── src/components/         Shared UI + shadcn/ui components
│   └── src/lib/                API client, field types, workflow nodes
│
├── whatsapp-server/            WhatsApp alert bridge (Node.js)
├── nginx/                      Reverse proxy config
├── deploy/                     Production deployment guides
├── docs/                       Full technical documentation (24 sections)
├── docker-compose.yml          Single-command stack (all services)
└── docker-compose.prod.yml     Production overlay
```

---

## Demo Accounts

Seeded automatically on first backend boot.

| Role | Email | Password |
|---|---|---|
| Super Admin | admin@example.com | Admin@12345 |
| Cluster Admin | rahul.verma@example.com | Admin@12345 |
| Regional Admin (South) | south.admin@example.com | Admin@12345 |
| Vendor Admin | vendor.admin@sunops.example.com | Vendor@12345 |
| Vendor User | vendor.user@sunops.example.com | Vendor@12345 |

---

## Environment Variables Reference

### backend/.env

```
# Database
MONGO_URL=mongodb://localhost:27017
DB_NAME=formforge

# Security
JWT_SECRET=<32+ char random hex>
CORS_ORIGINS=http://localhost:3000

# Demo Seed (first boot only)
SEED_ADMIN_EMAIL=admin@example.com
SEED_ADMIN_PASSWORD=Admin@12345

# AI Service (optional)
AI_ENABLED=true
AI_SERVICE_URL=http://localhost:9005
AI_REQUEST_TIMEOUT=30.0
AI_CONNECT_TIMEOUT=5.0

# Email / SMTP (for workflow notifications)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=FormForge <your@email.com>
```

### ai-service environment variables

```
AI_ENABLED=true
AI_PROVIDER=local
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=gemma
OLLAMA_TIMEOUT_SECONDS=25.0
VECTOR_DB_PATH=./data/vector_db
CHUNK_SIZE=512
CHUNK_OVERLAP=64
```

---

## Common Tasks

### Reset the database

```powershell
# Docker
docker compose down -v && docker compose up -d

# Bare-metal
mongosh formforge --eval "db.dropDatabase()"
# Then restart backend
```

### Change the super-admin password

```powershell
cd backend; .venv\Scripts\activate
python -c "
import asyncio, bcrypt
from motor.motor_asyncio import AsyncIOMotorClient
async def main():
    c = AsyncIOMotorClient('mongodb://localhost:27017')['formforge']
    pw = bcrypt.hashpw(b'MyStrong#Password', bcrypt.gensalt()).decode()
    await c.users.update_one({'email':'admin@example.com'}, {chr(36)+'set': {'password_hash': pw}})
asyncio.run(main())
"
```

### Re-index AI Knowledge Base

1. Go to AI Training page in the app
2. Knowledge Base tab → Upload documents (PDF, DOCX, TXT)
3. Click Index Document
4. Test RAG tab → verify semantic search returns question-specific answers

### Backup

```powershell
mongodump --uri="mongodb://localhost:27017/formforge" --out="./backups/$(Get-Date -Format 'yyyyMMdd')"
Compress-Archive -Path backend\uploads\local -DestinationPath "backups\uploads-$(Get-Date -Format 'yyyyMMdd').zip"
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Connection refused frontend to backend | Backend not running | Start backend on port 8001 |
| ServerSelectionTimeoutError | MongoDB not running | Start MongoDB service |
| AI Service Offline badge | ai-service not started | Start ai-service on port 9005; check AI_SERVICE_URL in backend/.env |
| RAG Active LLM Offline badge | Ollama not installed/running | Install Ollama; run `ollama pull gemma` |
| Test RAG same answer for all questions | Old hardcoded endpoint (now fixed) | Ensure ai_routes.py is up-to-date |
| Login fails | Seed password only applies on first boot | Reset DB or use change-password script above |
| Port already in use | Conflicting service | Change port in docker-compose.yml or stop the conflicting process |
| App works on PC but not on phone | Firewall blocking port 8001 | Allow inbound TCP 8001 in Windows Firewall |
| WhatsApp QR not appearing | Node.js or Chromium issue | Run npm install again; check Node.js is 20+ |
| Ollama model not found | Model not pulled | Run ollama pull gemma |

---

## Production Deployment

See **deploy/README.md** for the full production runbook including:
- Let's Encrypt TLS with nginx
- Docker Compose production overlay
- Hardening checklist
- Backup / restore cron examples
- Firewall rules for solar plant networks

**Quick production checklist:**
- Generate a real JWT_SECRET: openssl rand -hex 32
- Change all demo passwords
- Set CORS_ORIGINS to your actual domain
- Enable SMTP for workflow email notifications
- Ensure uploads/ is on a persistent, backed-up volume
- Configure MongoDB authentication
- Set up daily mongodump backup cron

---

## License

MIT — do what you want, no warranty.
