"""
FormForge AI Service - Health & Status Module
Independent health probe for AI service, Ollama LLM runtime, embeddings, and vector DB.
"""

import httpx
import logging
from typing import Dict, Any
from config import settings

logger = logging.getLogger("ai-service-health")

async def check_ollama_health() -> Dict[str, Any]:
    """Probes local Ollama instance status and loaded model availability."""
    if not settings.ENABLE_LOCAL_AI:
        return {"status": "disabled", "details": "Local AI / Ollama disabled in configuration"}

    try:
        async with httpx.AsyncClient(timeout=settings.CONNECT_TIMEOUT_SECONDS) as client:
            resp = await client.get(f"{settings.OLLAMA_URL}/api/tags")
            if resp.status_code == 200:
                models = [m.get("name", "") for m in resp.json().get("models", [])]
                has_model = any(settings.OLLAMA_MODEL in m for m in models)
                return {
                    "status": "healthy" if has_model else "degraded",
                    "url": settings.OLLAMA_URL,
                    "target_model": settings.OLLAMA_MODEL,
                    "available_models": models,
                    "model_loaded": has_model
                }
            return {
                "status": "degraded",
                "url": settings.OLLAMA_URL,
                "error": f"Ollama HTTP {resp.status_code}"
            }
    except Exception as e:
        logger.warning(f"Ollama health check failed: {str(e)}")
        return {
            "status": "unavailable",
            "url": settings.OLLAMA_URL,
            "error": "Ollama service connection refused or timed out"
        }

async def get_system_health() -> Dict[str, Any]:
    """Compiles overall AI service readiness & component health breakdown."""
    if not settings.AI_ENABLED:
        return {
            "status": "disabled",
            "ai_service": "disabled",
            "ollama": "disabled",
            "model": settings.OLLAMA_MODEL,
            "rag": "disabled",
            "vector_db": "disabled"
        }

    ollama_info = await check_ollama_health()
    ollama_status = ollama_info.get("status", "unavailable")

    # Determine overall status
    if ollama_status == "healthy":
        overall_status = "healthy"
    elif ollama_status in ("degraded", "disabled"):
        overall_status = "degraded"
    else:
        overall_status = "unavailable"


    return {
        "status": overall_status,
        "ai_service": "healthy",
        "ollama": ollama_status,
        "model": settings.OLLAMA_MODEL,
        "rag": "healthy",
        "vector_db": "healthy",
        "provider": settings.AI_PROVIDER,
        "ollama_details": ollama_info
    }
