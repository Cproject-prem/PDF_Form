# FormForge Frontend

React 18 single-page application built with Create React App + craco.
Part of the FormForge Solar Plant O&M Platform.

---

## Quick Start

```powershell
cd "D:\Website\PDF Form\frontend"
yarn install
yarn start
```

Opens at: http://localhost:3000

Requires the core backend to be running on http://localhost:8001.

---

## Environment Setup

Create a `.env` file in this directory:

```
REACT_APP_BACKEND_URL=http://localhost:8001
```

For production, leave it empty (`REACT_APP_BACKEND_URL=`) so the browser uses the same origin as the page (served via nginx).

---

## Available Scripts

| Command | Description |
|---|---|
| `yarn start` | Dev server with hot-reload at localhost:3000 |
| `yarn build` | Production bundle into `build/` |
| `yarn test` | Run test suite |
| `yarn lint` | ESLint check |

---

## Key Pages

| Route | Page | Description |
|---|---|---|
| `/` | Dashboard | Overview and quick stats |
| `/forms` | Form Builder | Drag-and-drop dynamic form designer |
| `/submissions` | Submissions Hub | View, filter, and manage all form submissions |
| `/workflow` | Workflow Designer | Approval chain and email notification designer |
| `/pdf-templates` | PDF Templates | PDF template builder with field mapping |
| `/ai-training` | AI Training | RAG knowledge base, folder management, test-RAG, chat playground |
| `/master-data` | Master Data | Sites, vendors, plants, regions |
| `/reports` | Reports | Submission analytics and exports |
| `/admin` | Admin | User management, RBAC configuration |

---

## AI Status Indicator (Header)

The AI Training page shows a real-time status badge in the header:

| Badge | Colour | Meaning |
|---|---|---|
| AI Fully Active | Green | All AI components healthy |
| RAG Active · LLM Offline | Blue | Knowledge Base & RAG indexing work; Ollama LLM not running |
| AI Service Offline | Grey | AI microservice unreachable; all other features unaffected |

---

## Architecture

```
frontend/src/
├── pages/              Top-level route components
│   ├── AiTraining.jsx  AI knowledge management (folders, RAG, test-RAG, chat)
│   ├── FormBuilder.jsx Dynamic drag-and-drop form designer
│   ├── Submissions.jsx Submission viewer with workflow actions
│   └── ...
├── components/         Shared UI components (shadcn/ui based)
│   ├── ui/             Base shadcn components (Button, Dialog, Input, ...)
│   ├── FormRenderer.jsx Dynamic form field renderer
│   └── ...
└── lib/
    ├── api.js          Axios client (auto-prefixes /api, handles JWT)
    ├── fieldTypes.js   Form field type registry
    └── workflowNodes.js Workflow node type definitions
```

---

## Tech Stack

| Library | Version | Purpose |
|---|---|---|
| React | 18 | UI framework |
| CRA + craco | Latest | Build toolchain with customisation |
| shadcn/ui + Radix UI | Latest | Component library |
| Lucide React | Latest | Icon set |
| Axios | Latest | HTTP client |
| React Router | v6 | Client-side routing |
| React Beautiful DnD / dnd-kit | Latest | Drag-and-drop form builder |
| React Hot Toast | Latest | Toast notifications |
| Tailwind CSS | v3 | Utility-first CSS |
| TanStack React Query | Latest | Data fetching/caching |

---

## Connecting to AI Features

The frontend talks to the AI microservice **indirectly** via the backend proxy:

```
Frontend -> POST /api/ai/status      -> Backend -> ai-service /health
Frontend -> POST /api/ai/test-rag    -> Backend -> ai-service /ai/rag/query + /ai/chat
Frontend -> POST /api/ai/chat        -> Backend -> ai-service /ai/chat
```

If the AI microservice is down, only AI Training features are affected.
All form, submission, workflow, and PDF features continue normally.

---

## Build for Production

```powershell
# Build the static bundle
yarn build

# The build/ directory is then served by the nginx container
```

Or via Docker (recommended):
```bash
docker compose build frontend
docker compose up -d
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Blank screen / connection refused | Check `REACT_APP_BACKEND_URL` in `.env`; ensure backend is running on 8001 |
| CORS errors in console | Backend `CORS_ORIGINS` must include `http://localhost:3000` |
| AI status always shows offline | Ensure ai-service is running on port 9005 and `AI_SERVICE_URL` is set in backend/.env |
| Changes not reflecting | Hard-refresh (Ctrl+Shift+R) or clear browser cache |
| Build fails | Delete `node_modules/` and run `yarn install` again |
