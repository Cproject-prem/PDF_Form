"""
FormForge AI Service - LLM Provider Abstraction
Handles communication with local Ollama LLM with strict timeout and fallback.
"""

import httpx
import logging
from typing import List, Dict, Any
from config import settings

logger = logging.getLogger("ai-service-llm")

class LLMProvider:
    @staticmethod
    async def generate_chat_response(
        messages: List[Dict[str, str]],
        system_prompt: str = "",
        provider: str = "local"
    ) -> Dict[str, Any]:
        """Routes chat request to local Ollama LLM provider with strict timeout."""
        return await LLMProvider._call_ollama(messages, system_prompt)

    @staticmethod
    async def _call_ollama(
        messages: List[Dict[str, str]],
        system_prompt: str = ""
    ) -> Dict[str, Any]:
        """Dispatches request to local Ollama API."""
        ollama_messages = []
        if system_prompt:
            ollama_messages.append({"role": "system", "content": system_prompt})
        
        for m in messages:
            ollama_messages.append({
                "role": m.get("role", "user"),
                "content": m.get("content", "")
            })

        payload = {
            "model": settings.OLLAMA_MODEL,
            "messages": ollama_messages,
            "stream": False
        }

        try:
            async with httpx.AsyncClient(timeout=settings.OLLAMA_TIMEOUT_SECONDS) as client:
                resp = await client.post(f"{settings.OLLAMA_URL}/api/chat", json=payload)
                if resp.status_code == 200:
                    data = resp.json()
                    content = data.get("message", {}).get("content", "")
                    return {
                        "success": True,
                        "reply": content,
                        "provider": "ollama",
                        "model": settings.OLLAMA_MODEL
                    }
                else:
                    return {
                        "success": False,
                        "reply": f"Local AI model returned status {resp.status_code}",
                        "error_category": "ollama_http_error"
                    }
        except httpx.TimeoutException:
            logger.error("Ollama request timed out")
            return {
                "success": False,
                "reply": "Local AI model request timed out",
                "error_category": "timeout"
            }
        except Exception as e:
            logger.error(f"Ollama connection failure: {str(e)}")
            return {
                "success": False,
                "reply": "Could not connect to local Ollama runtime",
                "error_category": "connection_refused"
            }
