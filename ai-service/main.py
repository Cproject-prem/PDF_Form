"""
FormForge AI Service - Dedicated Microservice Application
Standalone, isolated REST microservice for AI chat, RAG, summarization, and health monitoring.
"""

from fastapi import FastAPI, HTTPException, Depends, Header
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import uvicorn
import logging

from config import settings
from health import get_system_health, check_ollama_health
from services.ai_engine import AIEngine
from rag.vector_store import vector_store

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("ai-service-main")

app = FastAPI(
    title="FormForge AI Microservice",
    description="Auxiliary isolated AI microservice for FormForge platform",
    version="1.0.0"
)

# ----------------- Request Models -----------------

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    provider: Optional[str] = "local"
    use_rag: Optional[bool] = True
    documents: Optional[List[Dict[str, Any]]] = None

class RAGQueryRequest(BaseModel):
    query: str
    top_k: Optional[int] = 3

class RAGIndexRequest(BaseModel):
    doc_id: str
    filename: str
    text_content: str
    metadata: Optional[Dict[str, Any]] = None

class SummarizeRequest(BaseModel):
    text: str
    provider: Optional[str] = "local"

class AnalyzeRequest(BaseModel):
    data: Dict[str, Any]
    provider: Optional[str] = "local"

# ----------------- Health & Readiness -----------------

@app.get("/health")
async def health_check():
    """Detailed health check endpoint reporting all AI components independently."""
    return await get_system_health()

@app.get("/ready")
async def readiness_check():
    """Readiness probe endpoint for Kubernetes / Docker Compose healthchecks."""
    health = await get_system_health()
    status = health.get("status")
    if status in ("healthy", "degraded"):
        return {"ready": True, "status": status}
    raise HTTPException(status_code=503, detail={"ready": False, "status": status})

# ----------------- Core AI Endpoints -----------------

@app.post("/ai/chat")
async def chat_endpoint(req: ChatRequest):
    """Processes chat query using LLM and optional RAG context."""
    if not settings.AI_ENABLED:
        return {
            "success": False,
            "reply": "AI service is currently disabled in system configuration.",
            "error_category": "service_disabled"
        }
    
    msgs = [{"role": m.role, "content": m.content} for m in req.messages]
    result = await AIEngine.process_chat(
        messages=msgs,
        provider=req.provider or settings.AI_PROVIDER,
        use_rag=req.use_rag,
        documents=req.documents
    )
    return result

@app.post("/ai/rag/query")
async def rag_query_endpoint(req: RAGQueryRequest):
    """Queries vector database for relevant text chunks."""
    results = vector_store.query(req.query, top_k=req.top_k or settings.MAX_RAG_DOCUMENTS)
    return {"success": True, "results": results, "count": len(results)}

@app.post("/ai/rag/index")
async def rag_index_endpoint(req: RAGIndexRequest):
    """Indexes new document into vector store."""
    ok = vector_store.add_document(req.doc_id, req.filename, req.text_content, req.metadata)
    return {"success": ok, "doc_id": req.doc_id}

@app.post("/ai/summarize")
async def summarize_endpoint(req: SummarizeRequest):
    """Summarizes text content."""
    return await AIEngine.summarize_text(req.text, req.provider or settings.AI_PROVIDER)

@app.post("/ai/analyze")
async def analyze_endpoint(req: AnalyzeRequest):
    """Analyzes submission payload for anomalies."""
    return await AIEngine.analyze_form_submission(req.data, req.provider or settings.AI_PROVIDER)

if __name__ == "__main__":
    uvicorn.run("main:app", host=settings.HOST, port=settings.PORT, reload=settings.DEBUG)
