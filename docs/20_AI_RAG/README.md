# 20. FormForge — RAG & Knowledge Management

## 1. What is RAG in FormForge?

FormForge uses **Retrieval-Augmented Generation (RAG)** to ground AI answers in actual plant
documentation. Instead of relying on a generic language model's training data, the system:

1. **Indexes your documents** (PDF manuals, SOPs, fault guides) into a vector store
2. **Searches semantically** using cosine similarity when a question is asked
3. **Injects the most relevant chunks** into the LLM prompt as context
4. **Generates a grounded answer** based strictly on that retrieved context

This means answers are traceable to specific pages of your actual plant manuals.

---

## 2. Folder & Collection Hierarchy

Knowledge is organised in a database-backed tree:

```
📁 Knowledge Base Root
   └── 📁 Site Operations
       ├── 📁 Inverter
       │   └── 📁 Deye
       │       └── 🧠 Deye Inverter Knowledge (Vector Collection)
       │           ├── 📄 Deye_SUN30K_Manual.pdf    → 18 chunks indexed
       │           └── 📄 Grid_Fault_SOP_2026.pdf   → 12 chunks indexed
       └── 📁 Battery
           └── 🧠 Battery BMS Knowledge (Vector Collection)
               └── 📄 BMS_Alarm_Guide.pdf           → 9 chunks indexed
```

**Folders** (`ai_folders`): Organisational nodes, can be nested up to 10 levels.
**RAG Collections** (`rag_collections`): Vector index containers tied to a folder, with configurable parameters.
**Documents** (`knowledge_documents`): Uploaded files tracked through the processing pipeline.
**Chunks** (`knowledge_chunks`): Page-level text segments stored with embedding vectors.

---

## 3. Document Processing Pipeline

When a document is uploaded and indexed:

```
Upload File (PDF / DOCX / TXT)
        │
        ▼
Text Extraction (PyPDF / PDFMiner)
        │
        ▼
Sliding Window Chunking
   chunk_size: 512 tokens
   chunk_overlap: 64 tokens
        │
        ▼
Vector Embedding Generation
   model: all-MiniLM-L6-v2
   dimensions: 384 (L2 normalised)
        │
        ▼
Vector Index Storage (data/vector_db/index.json)
        │
        ▼
MongoDB Status Update: knowledge_documents → "ready"
```

**Document status states:**
`uploaded` → `extracting` → `chunking` → `embedding` → `indexing` → `ready`

---

## 4. Semantic Vector Search

When a RAG query arrives at `/ai/rag/query`:

```python
# EmbeddingService generates a 384-dim vector for the query
q_vec = EmbeddingService.generate_embedding(query_text)

# Cosine similarity against all indexed chunks
for doc in vector_store.documents:
    score = sum(a * b for a, b in zip(q_vec, doc["vector"]))  # dot product of normalised vecs
    scored_chunks.append({...chunk..., "score": score})

# Return top-K by score
scored_chunks.sort(key=lambda x: x["score"], reverse=True)
return scored_chunks[:top_k]
```

Different questions produce genuinely different similarity scores and different chunks.

---

## 5. Test RAG Interface

Navigate to **AI Training → Test RAG** in the app to run diagnostic queries.

**What you see per query:**
- **Retrieved Knowledge**: Document name, page number, similarity score (0–1)
- **Retrieved Context**: Exact text chunks injected into the LLM prompt
- **Generated Answer**: Ollama Gemma's response grounded strictly in that context
- **Performance Metrics**: Search latency (ms), generation latency (ms), total time, chunk IDs

**Status when Ollama is offline:**
The test-RAG endpoint still returns ranked chunks with similarity scores.
The generated answer field shows: "Ollama LLM is offline — start Ollama to generate answers."

**Status when no documents are indexed:**
The generated answer field shows: "No knowledge chunks found — upload documents and index them."

---

## 6. Step-by-Step: Add Knowledge to the RAG System

### Step 1 — Create a Folder
Go to **AI Training → Folder Management**.
Click **New Folder**, give it a name (e.g. "Inverter Manuals").

### Step 2 — Create a RAG Collection
Inside the folder, click **New Collection**.
Set:
- Display Name: e.g. "Deye Inverter Knowledge"
- Embedding Model: `all-MiniLM-L6-v2` (default)
- Vector Dimensions: `384`
- Chunk Size: `512` (tokens per chunk)
- Chunk Overlap: `64` (overlap between chunks)

### Step 3 — Upload Documents
Go to **AI Training → Knowledge Base**.
Upload PDF / DOCX / TXT files into your collection.
The system shows pipeline status: uploaded → extracting → ... → ready.

### Step 4 — Verify Indexing
Go to **AI Training → Test RAG**.
Type a specific question from your document (e.g. "What is the grid fault trip voltage threshold?").
You should see chunks retrieved with similarity scores > 0.7 for relevant questions.

### Step 5 — Verify Answer Generation (requires Ollama)
If Ollama is running with a pulled model, the generated answer should directly quote
or paraphrase the retrieved chunk content — not generic boilerplate.

---

## 7. Document Movement & Re-indexing

When a document is moved from Collection A to Collection B:
1. All chunks for that document are purged from the vector store
2. Document metadata (`collection_id`, `folder_id`) is updated in MongoDB
3. The document is automatically re-chunked and re-indexed into Collection B

---

## 8. Vector Store Persistence

The vector index is persisted as a JSON file at `ai-service/data/vector_db/index.json`.
In Docker, this is stored in the `formforge_vector_data` named volume.

**Backup the vector store:**
```powershell
# Bare-metal
Copy-Item "D:\Website\PDF Form\ai-service\data\vector_db\index.json" `
          "D:\Backups\vector_db_$(Get-Date -Format 'yyyyMMdd').json"

# Docker
docker run --rm -v formforge_vector_data:/data -v C:\Backups:/backup alpine `
    cp /data/index.json /backup/vector_db_$(date +%F).json
```

**Restore the vector store:**
Replace `index.json` with the backup copy and restart the ai-service.

---

## 9. Structured Knowledge (Non-Vector)

In addition to vector RAG, FormForge maintains a **Structured Knowledge** table
(`structured_knowledge` MongoDB collection) for deterministic equipment alarm troubleshooting:

| Field | Description |
|---|---|
| `equipment` | Equipment name (e.g. "Deye SUN30K Inverter") |
| `alarm` | Alarm/fault code |
| `possible_causes` | List of potential causes |
| `checks` | Diagnostic steps |
| `corrective_actions` | Resolution actions |
| `domain` | Knowledge domain tag |
| `status` | `active` / `draft` / `deprecated` |

Manage via **AI Training → Structured Knowledge** tab.

---

## 10. Training Cases

**Training Cases** (`training_cases`) store verified historical diagnostics:

| Field | Description |
|---|---|
| `case_code` | Unique identifier (e.g. "TC-0042") |
| `question` | The original symptom/question |
| `conditions` | Environmental or system state at time of fault |
| `ai_diagnosis` | What the AI predicted |
| `actual_cause` | What the actual root cause was |
| `action` | Corrective action taken |
| `result` | Outcome |
| `status` | `verified` / `pending` / `rejected` |

New training cases can be created from AI feedback ratings (thumbs up/down on answers).

---

## 11. Prompt Governance

**AI Prompts** (`ai_prompts`) are versioned system prompt templates:
- Multiple versions per prompt key
- Only one version is `is_active = true` at a time
- Changes are audited in `ai_logs`
- Manage via **AI Training → Prompt Governance** tab
