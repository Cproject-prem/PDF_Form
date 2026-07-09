# FormForge — Local Development Guide

A self-hosted form / PDF-form builder with 4-tier RBAC, dynamic data sources,
lookup / formula engine, workflow email automation, PDF templates and live
WebSocket notifications.

Stack: **React 18** (CRA + craco) · **FastAPI** · **MongoDB** · **Motor** ·
**PyMuPDF / reportlab** · **openpyxl**.

---

## TL;DR — run it locally

The fastest path uses Docker (nothing else to install):

```bash
git clone <this repo> formforge
cd formforge
docker compose up
```

Open **http://localhost:3000** in your browser and sign in with:

| Email                | Password       |
|----------------------|----------------|
| `admin@example.com`  | `Admin@12345`  |

That's it — the stack (MongoDB + FastAPI backend + React frontend) is up.

Stop it with `docker compose down`. Your database + uploads survive restarts
(persisted in the `mongo_data` Docker volume and `./backend/uploads/` folder).

---

## Option A — Docker (recommended)

**Prerequisites**
- Docker Desktop (Mac/Windows) or Docker Engine + `docker compose` plugin (Linux)

**Steps**
```bash
docker compose up          # foreground; Ctrl-C to stop
docker compose up -d       # background
docker compose logs -f     # tail logs
docker compose down        # stop everything
docker compose down -v     # stop + wipe data (fresh start)
```

Services after boot:
- **Frontend** → http://localhost:3000
- **Backend API** → http://localhost:8001/api/health
- **Mongo** → `mongodb://localhost:27017/formforge`

Uploaded files are stored under `./backend/uploads/local/` on your host machine
so you can see them directly in Finder / Explorer.

---

## Option B — Bare-metal (Python + Node)

Use this if you don't want Docker.

**Prerequisites**
- Python 3.11+
- Node.js 20+ and Yarn (`npm install -g yarn`)
- MongoDB Community Edition running locally on `27017`
  - macOS: `brew install mongodb-community && brew services start mongodb-community`
  - Linux: `sudo apt install mongodb` or follow the [official docs](https://www.mongodb.com/docs/manual/administration/install-community/)
  - Windows: download the MSI installer from mongodb.com

### 1. Backend

```bash
cd backend

# Create a virtualenv
python3 -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy env template and edit if needed
cp .env.example .env

# Run the API server
uvicorn server:app --reload --host 0.0.0.0 --port 8001
```

Backend is now on **http://localhost:8001**. First boot seeds the demo users.

### 2. Frontend

Open a **second terminal**:

```bash
cd frontend

# Install packages
yarn install                    # or: npm install

# Copy env template
cp .env.example .env

# Run dev server
yarn start                      # or: npm start
```

Open **http://localhost:3000**.

---

## Directory layout

```
formforge/
├── backend/                 FastAPI service
│   ├── server.py            main entrypoint (auth, forms, submissions, ws)
│   ├── pdf_routes.py        PDF template builder + filled-PDF generator
│   ├── vendor_routes.py     master data, sites, vendors, regions, plants
│   ├── workflow_routes.py   workflow engine, approvals, email attachments
│   ├── permissions.py       RBAC + row-level security
│   ├── notifications.py     WebSocket notification helpers
│   ├── formula_engine.py    Excel-like formula evaluator
│   ├── datasource_routes.py dropdown / lookup data sources
│   ├── uploads/local/       user-uploaded files (auto-created)
│   │   ├── tmp/             just-uploaded files (before submission)
│   │   └── submissions/{sid}/  files organised per submission
│   ├── requirements.txt
│   └── .env.example
├── frontend/                React app (CRA + craco)
│   ├── src/
│   │   ├── pages/           top-level routes
│   │   ├── components/      builder + shared UI + shadcn
│   │   └── lib/             api client, field types, workflow nodes
│   ├── package.json
│   └── .env.example
├── docker-compose.yml       one-command local stack
└── memory/                  PRD, test credentials, roadmap
```

---

## Demo accounts

Seeded on first backend boot (see `_seed_demo_users` in `server.py`).

| Role                | Email                                | Password       |
|---------------------|--------------------------------------|----------------|
| Super Admin         | `admin@example.com`                  | `Admin@12345`  |
| Cluster Admin       | `rahul.verma@example.com`            | `Admin@12345`  |
| Regional Admin (South) | `south.admin@example.com`         | `Admin@12345`  |
| Vendor Admin        | `vendor.admin@sunops.example.com`    | `Vendor@12345` |
| Vendor User         | `vendor.user@sunops.example.com`     | `Vendor@12345` |

---

## Common tasks

### Reset the database
```bash
# Docker
docker compose down -v && docker compose up

# Bare-metal (from mongosh)
use formforge
db.dropDatabase()
```

### Re-seed the demo users
Just restart the backend — the seed step is idempotent and re-creates any
missing demo user.

### Where are my files stored?
`backend/uploads/local/` on your host machine.
- Files land in `tmp/` when uploaded.
- After a form submission they move into `submissions/{submission_id}/{original_filename}`.

### Change the super-admin password
Edit `backend/.env`:
```
SEED_ADMIN_EMAIL="me@example.com"
SEED_ADMIN_PASSWORD="MyStrong#Password"
```
Then either restart with a fresh DB, or run this one-liner to update in place:
```bash
cd backend && source .venv/bin/activate
python -c "
import asyncio, os, bcrypt
from motor.motor_asyncio import AsyncIOMotorClient
async def main():
    c = AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
    pw = bcrypt.hashpw(b'MyStrong#Password', bcrypt.gensalt()).decode()
    await c.users.update_one({'email':'me@example.com'}, {'\$set': {'password_hash': pw}})
asyncio.run(main())
"
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Connection refused` from frontend → backend | Make sure `REACT_APP_BACKEND_URL` in `frontend/.env` is `http://localhost:8001` (no trailing slash). |
| `pymongo.errors.ServerSelectionTimeoutError` | MongoDB isn't running. Start it (`brew services start mongodb-community`) or use Docker. |
| `Storage unavailable` when uploading | Should not happen with local storage. Ensure `backend/uploads/local/` is writable. |
| `Login fails` | Passwords in `.env` are only applied on **first** seed. Reset the DB (`use formforge; db.dropDatabase()`) then restart, or use the "change super-admin password" recipe above. |
| Port 3000/8001/27017 already in use | Change the exposed port in `docker-compose.yml` or stop the conflicting service. |
| `Login failed` when opening the app from another device on the same Wi-Fi (e.g. phone at `http://192.168.x.x:3000`) | The frontend now auto-rewrites `localhost` in `REACT_APP_BACKEND_URL` to whatever host the browser is on, so **you don't need to change anything** — just make sure your Windows / macOS firewall allows inbound TCP on port **8001**. If it still fails, hard-code your LAN IP: `REACT_APP_BACKEND_URL=http://192.168.x.x:8001` in `frontend/.env`, then restart `yarn start`. |

---

## Production notes

This repo is optimised for **local self-hosting**. For a full DNS / HTTPS
deployment (e.g. `https://formforge.mycompany.com`) follow the step-by-step
guide at **[`deploy/README.md`](deploy/README.md)** — includes:

- One-command Let's Encrypt TLS certificate
- Sample nginx reverse-proxy config with WebSocket support
- Production docker-compose overlay (`docker-compose.prod.yml`)
- Backup / restore cron examples

Manual production checklist (if you're not using the docker overlay):

- Set a real `JWT_SECRET` (32+ char random hex — `openssl rand -hex 32`)
- Change all seeded passwords (`SEED_ADMIN_PASSWORD` and the demo vendor accounts)
- Front the backend with HTTPS (nginx / caddy / traefik)
- Configure `CORS_ORIGINS` to your real frontend domain, **not** `*`
- Set `SECURITY_STRICT="true"` and `SECURITY_HTTPS="true"`
- In `frontend/.env` set `REACT_APP_BACKEND_URL=""` (empty) so the browser
  uses the same origin as the page — cleanest for DNS setups
- Configure SMTP (`SMTP_HOST`, etc.) if you want workflow emails to be delivered
- Back up `backend/uploads/local/` and MongoDB regularly (see `backup.py`)

---

## License

MIT — do what you want, no warranty.
