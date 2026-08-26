# 19. FormForge — AI Architecture & Microservice Design

## 1. Overview

The AI module in FormForge is an **isolated, auxiliary microservice** providing:
- Local RAG (Retrieval-Augmented Generation) powered by an in-process vector store
- Dynamic hierarchical knowledge management (folders → collections → documents → chunks)
- Grounded AI answer generation via local Ollama (Gemma model)
- Chat playground for AI-assisted troubleshooting
- Prompt governance and evaluation benchmarking

**Core design guarantee:** If the AI microservice or Ollama runtime goes offline for any reason,
100% of core FormForge functionality continues uninterrupted — forms, submissions, PDF generation,
workflows, approvals, and reports are entirely unaffected.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  FORMFORGE CORE PLATFORM                    │
│  FastAPI :8001 + React :3000 + MongoDB :27017               │
│  (Forms, Submissions, Workflows, Approvals, Plants, Auth)  │
└──────────────────────────────┬──────────────────────────────┘
                               │
                   Optional proxy (httpx)
                   Circuit breaker: 5s connect / 30s request
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│              ISOLATED AI MICROSERVICE  :9005                │
│  FastAPI + httpx                                            │
│                                                             │
│  Endpoints:                                                 │
│  POST /ai/chat          — grounded LLM answers             │
│  POST /ai/rag/query     — semantic vector search            │
│  POST /ai/rag/index     — index new documents               │
│  POST /ai/summarize     — text summarization               │
│  GET  /health           — component-level health report     │
│                                                             │
│  In-process Vector Store (cosine similarity, JSON index)    │
└────────────────────────────┬────────────────────────────────┘
                             │
                   Ollama API calls (httpx)
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│              OLLAMA LLM ENGINE  :11434                      │
│  Model: gemma (default) or gemma:2b (low-RAM)              │
│  All inference is 100% local — no data leaves the network  │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Health States & UI Indicators

The backend polls the AI microservice health on the `/api/ai/status` endpoint and maps it to three states:

| Backend Status | Meaning | UI Badge | UI Notice |
|---|---|---|---|
| `healthy` | All components up | Green — "AI Fully Active" | None |
| `partial` | Microservice + RAG healthy, Ollama offline | Blue — "RAG Active · LLM Offline" | Slim blue strip (non-blocking) |
| `unavailable` | AI microservice unreachable | Grey — "AI Service Offline" | Amber blocking banner |

**Status aggregation logic (`ai_routes.py`):**
```python
if ai_service reachable:
    if ollama healthy: status = "healthy"
    else:              status = "partial"   # RAG works, chat offline
else:
    status = "unavailable"                  # full isolation
```

---

## 4. Fault Tolerance Pattern

- All `/api/ai/*` backend routes are wrapped in `try/except` with `httpx.ConnectError` handling
- Connection timeout: 5 seconds (configurable via `AI_CONNECT_TIMEOUT`)
- Request timeout: 30 seconds (configurable via `AI_REQUEST_TIMEOUT`)
- On failure: returns graceful degradation response — never raises HTTP 500 to the user
- The amber banner in the UI only fires for `status = "unavailable"` (microservice fully down)
- Ollama being offline (`status = "partial"`) shows a slim non-blocking blue indicator only

---

## 5. Test-RAG Pipeline

The `/api/ai/test-rag` endpoint runs a real two-stage RAG pipeline:

```
Question
   │
   ▼ Stage 1: Semantic Vector Search
POST ai-service /ai/rag/query
   └── EmbeddingService.generate_embedding(question)
   └── Cosine similarity against all indexed chunks
   └── Returns top-K chunks sorted by score
   │
   ▼ Stage 2: Grounded LLM Generation
POST ai-service /ai/chat
   └── System prompt: "Answer strictly using this retrieved context..."
   └── Retrieved chunks injected as context
   └── Ollama Gemma generates question-specific answer
   │
   ▼ Response
{
  "retrieved_knowledge": [...],   # filename, page, similarity score
  "retrieved_context": "...",     # raw text chunks used
  "generated_answer": "...",      # grounded LLM response
  "metrics": { search_latency_ms, generation_latency_ms, chunks_retrieved }
}
```

**Graceful degradation:**
- If Ollama offline → returns retrieved chunks + scores with message: "Ollama offline — start it to generate answers"
- If vector store empty → returns message: "No chunks found — upload and index documents first"

---

## 6. Database Collections

All AI data is stored in MongoDB (same instance as core, separate collections):

| Collection | Purpose |
|---|---|
| `ai_folders` | Hierarchical folder tree (max 10 levels deep) |
| `rag_collections` | Vector index configurations per folder |
| `knowledge_documents` | Document metadata + pipeline status |
| `knowledge_chunks` | Page-level text chunks (content + metadata) |
| `structured_knowledge` | Equipment alarm troubleshooting matrix |
| `training_cases` | Verified historical diagnostic cases |
| `ai_feedback` | User ratings → Training Case conversion queue |
| `ai_prompts` | Versioned system prompt templates |
| `ai_evaluations` | Benchmark accuracy/precision reports |
| `ai_logs` | Redacted audit log (action, latency, status) |

---

## 7. Access Control

Every `/api/ai/*` route enforces `require_admin(user)`.
Only `super_admin` and `admin` roles can access AI Training features.
`vendor_admin` and `vendor_user` roles are blocked from all AI endpoints.

---

## 8. Configuration

### Backend (`backend/.env`)
```
AI_ENABLED=true
AI_SERVICE_URL=http://localhost:9005
AI_REQUEST_TIMEOUT=30.0
AI_CONNECT_TIMEOUT=5.0
```

### AI Service (environment variables)
```
AI_ENABLED=true
AI_PROVIDER=local
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=gemma              # or gemma:2b for low-RAM (<8GB)
OLLAMA_TIMEOUT_SECONDS=25.0
VECTOR_DB_PATH=./data/vector_db
EMBEDDING_MODEL=all-MiniLM-L6-v2
CHUNK_SIZE=512
CHUNK_OVERLAP=64
MAX_RAG_DOCUMENTS=5
```

---

## 9. Starting All AI Components

### Bare-metal (development):
```powershell
# Terminal 1: AI Microservice
cd "D:\Website\PDF Form\ai-service"
.venv\Scripts\activate
uvicorn main:app --host 0.0.0.0 --port 9005

# Terminal 2: Ollama (install from https://ollama.com/download/OllamaSetup.exe first)
ollama serve
# Then pull model (first time only):
ollama pull gemma
```

### Docker:
```bash
docker compose up -d formforge-ai ollama
docker exec -it <ollama-container> ollama pull gemma
```

---

## 10. AI Service Files

```
ai-service/
├── main.py              FastAPI app, route definitions
├── config.py            AIServiceSettings (Pydantic)
├── health.py            Component-level health checker
├── services/
│   └── ai_engine.py     Ollama chat + summarization calls
├── rag/
│   └── vector_store.py  Cosine similarity vector search + indexing
├── embeddings/
│   └── embedding_service.py  Text chunking + embedding generation
└── data/
    └── vector_db/
        └── index.json   Persistent vector store (chunks + vectors)
```
