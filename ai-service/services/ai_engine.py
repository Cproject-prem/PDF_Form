"""
FormForge AI Service - AI Engine Service
Orchestrates AI services: chat, RAG queries, summarization, and form analysis.
"""

import time
import logging
from typing import List, Dict, Any
from models.llm_provider import LLMProvider
from rag.vector_store import vector_store
from prompts.templates import SYSTEM_RAG_PROMPT, SYSTEM_SUMMARIZE_PROMPT, SYSTEM_ANALYZE_PROMPT
from config import settings

logger = logging.getLogger("ai-service-engine")

class AIEngine:
    @staticmethod
    async def process_chat(
        messages: List[Dict[str, str]],
        provider: str = "local",
        use_rag: bool = True,
        documents: List[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Processes AI chat request with optional RAG context."""
        start_time = time.time()
        context_str = ""
        retrieved_doc_ids = []

        if use_rag:
            last_user_msg = messages[-1].get("content", "") if messages else ""
            
            # Query internal vector store
            rag_results = vector_store.query(last_user_msg, top_k=settings.MAX_RAG_DOCUMENTS)
            
            # Combine with any provided documents in payload
            if documents:
                for doc in documents:
                    doc_text = doc.get("text_content") or doc.get("text", "")
                    if doc_text:
                        context_str += f"\nDocument: {doc.get('filename', 'Doc')}\n{doc_text}\n"
                        if doc.get("id") or doc.get("_id"):
                            retrieved_doc_ids.append(str(doc.get("id") or doc.get("_id")))

            for res in rag_results:
                context_str += f"\nDocument: {res.get('filename')}\n{res.get('text')}\n"
                if res.get("doc_id") and res.get("doc_id") not in retrieved_doc_ids:
                    retrieved_doc_ids.append(res.get("doc_id"))

        system_prompt = SYSTEM_RAG_PROMPT.format(context=context_str if context_str else "No additional documents loaded.")
        
        result = await LLMProvider.generate_chat_response(messages, system_prompt, provider)
        latency_ms = int((time.time() - start_time) * 1000)

        return {
            "success": result.get("success", False),
            "reply": result.get("reply", "AI service is currently unavailable."),
            "provider": result.get("provider", provider),
            "model": result.get("model", settings.OLLAMA_MODEL),
            "rag_used": use_rag and bool(context_str),
            "retrieved_doc_ids": retrieved_doc_ids,
            "latency_ms": latency_ms,
            "error_category": result.get("error_category")
        }

    @staticmethod
    async def summarize_text(text: str, provider: str = "local") -> Dict[str, Any]:
        """Summarizes provided document or submission text."""
        start_time = time.time()
        messages = [{"role": "user", "content": f"Please summarize this text:\n\n{text}"}]
        result = await LLMProvider.generate_chat_response(messages, SYSTEM_SUMMARIZE_PROMPT, provider)
        latency_ms = int((time.time() - start_time) * 1000)
        return {
            "success": result.get("success", False),
            "summary": result.get("reply", "Summarization currently unavailable."),
            "latency_ms": latency_ms
        }

    @staticmethod
    async def analyze_form_submission(data: Dict[str, Any], provider: str = "local") -> Dict[str, Any]:
        """Analyzes submission payload for anomalies or missing compliance fields."""
        start_time = time.time()
        messages = [{"role": "user", "content": f"Analyze submission payload:\n{data}"}]
        result = await LLMProvider.generate_chat_response(messages, SYSTEM_ANALYZE_PROMPT, provider)
        latency_ms = int((time.time() - start_time) * 1000)
        return {
            "success": result.get("success", False),
            "analysis": result.get("reply", "Form analysis currently unavailable."),
            "latency_ms": latency_ms
        }
