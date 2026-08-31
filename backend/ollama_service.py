"""
FormForge Solar Support Engineer AI - LLM & Ollama Service
Handles local Ollama connection, model discovery, multi-turn Solar O&M reasoning,
differential diagnostics, RAG context retrieval, and equipment context injection.
"""

import os
import time
import uuid
import logging
import asyncio
from datetime import datetime
from typing import List, Dict, Any, Optional, AsyncGenerator
import httpx

logger = logging.getLogger("solar-engineer-llm")

# Configuration from environment
OLLAMA_BASE_URL = (
    os.environ.get("OLLAMA_BASE_URL") or
    os.environ.get("OLLAMA_URL") or
    "http://host.docker.internal:11434"
).rstrip("/")

OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "gemma:2b")
AI_REQUEST_TIMEOUT = float(os.environ.get("AI_REQUEST_TIMEOUT", "90.0"))
AI_CONNECT_TIMEOUT = float(os.environ.get("AI_CONNECT_TIMEOUT", "5.0"))
AI_MAX_RETRIES = int(os.environ.get("AI_MAX_RETRIES", "2"))

# Candidate URLs for local host / container bridge probing
OLLAMA_PROBE_URLS = [
    OLLAMA_BASE_URL,
    "http://host.docker.internal:11434",
    "http://localhost:11434",
    "http://ollama:11434"
]

# Master Solar Support Engineer System Prompt
SOLAR_SUPPORT_ENGINEER_SYSTEM_PROMPT = """You are a Senior Solar PV Support Engineer AI operating inside a professional Solar Power Plant O&M portal.

Your role is to assist engineers, technicians, O&M managers and plant operators with:
- Solar PV plant troubleshooting, fault diagnosis, and root cause analysis (RCA)
- Equipment analysis (Inverters: Delta, Sungrow, Growatt, Huawei, Solis, SolarEdge — 20 kW to 320 kW; Modules, Strings, SCB, DCDB, ACDB, Transformers, RMU/VCB, Relays, CT/PT, SCADA, Trackers, BESS)
- SCADA, Modbus, and electrical measurement correlation
- Structured technical decision support

You are NOT a simple document search bot or generic chatbot. You must reason like an experienced Solar PV O&M Support Engineer.

CORE REASONING WORKFLOW:
1. UNDERSTAND: Identify the problem, equipment type, and symptom.
2. IDENTIFY: Determine manufacturer, exact model, and power rating whenever possible. If incomplete (e.g. "Growatt ground fault"), identify Manufacturer=Growatt, Equipment=Inverter, Model=Unknown, Symptom=Ground fault.
3. RETRIEVE: Apply relevant OEM documentation, structured registers/specs, historical RCA cases, and SOPs.
4. REASON: Correlate measurements (DC voltage, DC current, MPPT values, AC voltage, frequency, temperature, irradiance, weather, peer inverters).
5. DIFFERENTIAL DIAGNOSIS: Generate a ranked list of possible causes:
   1. Most likely
   2. Likely
   3. Possible
   4. Less likely
   5. Requires confirmation
6. CONFIDENCE LABELS: Distinguish:
   - CONFIRMED (supported by definitive electrical/SCADA/physical proof)
   - HIGHLY PROBABLE (strong circumstantial & peer evidence)
   - POSSIBLE (technically plausible, insufficient evidence)
   - UNKNOWN (information missing)
   Never present assumptions or possibilities as confirmed facts.
7. ACTIONABLE DIAGNOSTIC SEQUENCE:
   For each priority check provide:
   - Check: what to measure/inspect
   - Why: physical/electrical rationale
   - Expected: nominal range or condition
   - If abnormal: what it indicates
   - Next action: immediate step
8. CONVERSATIONAL REFINEMENT:
   When user provides new evidence (e.g. "happens after rain", "MPPT 3 current is zero", "only inverter 7 affected"), update the ranking and progressively narrow the root cause. Never repeat the initial generic answer.
9. SAFETY FIRST:
   PV DC strings can remain energized in daylight! Mandate appropriate site safety, PPE, LOTO isolation procedures, and authorized personnel for HV/MV and DC disconnects. Never instruct bypassing protection, earth monitoring, or safety interlocks.

STRICT OEM DATA SAFETY:
NEVER invent or hallucinate:
- Alarm/fault codes
- Modbus registers, addresses, data types, scaling
- Protection thresholds, voltage/current limits, or derating curves
- Firmware behavior or OEM proprietary reset procedures
If exact OEM information is not verified from available documentation, explicitly state:
"Exact OEM-specific information could not be verified from available model-specific documentation."

OUTPUT STRUCTURE FOR FAULT TROUBLESHOOTING:
### Assessment
Brief interpretation of what is currently known and equipment involved.

### Most Likely Causes
Ranked table or numbered list with Confidence level and rationale.

### What to Check First
Highest-value first diagnostic check.

### Diagnostic Sequence
Numbered steps with Check, Why, Expected, If abnormal, Next action.

### Corrective Action
Recommended recovery action.

### Verification
How to confirm resolution.

### Information Needed
Ask ONLY essential missing technical questions (exact model, error code, DC/AC readings, weather conditions).
"""


class OllamaService:
    """Reusable service for local Ollama LLM execution with resilience and context assembly."""

    def __init__(self):
        self.active_base_url = OLLAMA_BASE_URL
        self.active_model = OLLAMA_MODEL
        self._is_online = False
        self._available_models: List[str] = []
        self._last_health_check = 0.0

    async def check_health(self, force: bool = False) -> Dict[str, Any]:
        """Probes local Ollama instance across candidate network endpoints."""
        now = time.time()
        if not force and (now - self._last_health_check < 10.0) and self._is_online:
            return {
                "online": self._is_online,
                "base_url": self.active_base_url,
                "active_model": self.active_model,
                "models": self._available_models,
                "status": "healthy" if self._is_online else "unavailable"
            }

        self._last_health_check = now
        urls_to_try = [self.active_base_url] + [u for u in OLLAMA_PROBE_URLS if u != self.active_base_url]

        for base_url in urls_to_try:
            try:
                async with httpx.AsyncClient(timeout=AI_CONNECT_TIMEOUT) as client:
                    resp = await client.get(f"{base_url}/api/tags")
                    if resp.status_code == 200:
                        data = resp.json()
                        models = [m.get("name") for m in data.get("models", [])]
                        self._available_models = models
                        self.active_base_url = base_url
                        self._is_online = True

                        matched = OLLAMA_MODEL
                        if OLLAMA_MODEL in models:
                            matched = OLLAMA_MODEL
                        else:
                            pref = next((m for m in models if OLLAMA_MODEL.split(":")[0] in m or m.startswith("gemma")), None)
                            if pref:
                                matched = pref
                            elif models:
                                matched = models[0]

                        self.active_model = matched
                        return {
                            "online": True,
                            "base_url": base_url,
                            "active_model": self.active_model,
                            "models": models,
                            "status": "healthy"
                        }
            except Exception as e:
                logger.debug(f"Ollama probe failed on {base_url}: {e}")

        self._is_online = False
        return {
            "online": False,
            "base_url": self.active_base_url,
            "active_model": self.active_model,
            "models": [],
            "status": "unavailable",
            "message": "Local Ollama service is unavailable. Please ensure Ollama is running on port 11434."
        }

    async def list_models(self) -> List[str]:
        """Returns list of installed models from local Ollama."""
        health = await self.check_health()
        return health.get("models", [])

    def assemble_system_prompt(
        self,
        system_override: Optional[str] = None,
        context_docs: Optional[List[Dict[str, Any]]] = None,
        equipment_context: Optional[Dict[str, Any]] = None,
        structured_knowledge: Optional[List[Dict[str, Any]]] = None
    ) -> str:
        """Assembles prompt with Solar O&M instructions, equipment telemetry context, and retrieved RAG knowledge."""
        base = system_override.strip() if system_override else SOLAR_SUPPORT_ENGINEER_SYSTEM_PROMPT.strip()

        sections = [base]

        # 1. Inject Live Portal / Equipment Context if present
        if equipment_context:
            eq_lines = ["\n[CURRENT PLANT / EQUIPMENT TELEMETRY CONTEXT]"]
            for k, v in equipment_context.items():
                if v is not None and v != "":
                    eq_lines.append(f"- {k.replace('_', ' ').title()}: {v}")
            eq_lines.append("Use this telemetry context as baseline facts. Do not ask user for fields already provided here.")
            sections.append("\n".join(eq_lines))

        # 2. Inject Structured Knowledge (Modbus, Inverter Specs, OEM Alarms)
        if structured_knowledge:
            sk_lines = ["\n[VERIFIED STRUCTURED SOLAR KNOWLEDGE (MongoDB)]"]
            for item in structured_knowledge[:8]:
                mfr = item.get("manufacturer", "")
                mdl = item.get("model", "")
                param = item.get("parameter") or item.get("alarm") or item.get("fault") or ""
                val = item.get("value") or item.get("meaning") or ""
                unit = item.get("unit", "")
                src = item.get("source_document", "")
                verif = item.get("verification_status", "NOT_VERIFIED")
                line = f"- [{mfr} {mdl}] {param}: {val} {unit} (Status: {verif}, Source: {src})".strip()
                sk_lines.append(line)
            sections.append("\n".join(sk_lines))

        # 3. Inject Retrieved Document / Chunk Context (RAG)
        if context_docs:
            doc_lines = ["\n[RETRIEVED OEM TECHNICAL DOCUMENTATION / SOPs (RAG)]"]
            for i, doc in enumerate(context_docs[:6], 1):
                fn = doc.get("filename") or doc.get("title") or f"Doc-{i}"
                src = doc.get("source_document") or fn
                page = doc.get("page_number") or doc.get("source_page") or ""
                rev = doc.get("document_revision") or ""
                mfr = doc.get("manufacturer") or ""
                mdl = doc.get("model") or ""
                content = (doc.get("text_content") or doc.get("content") or "").strip()

                header_parts = [f"Source: {src}"]
                if page: header_parts.append(f"Page: {page}")
                if rev: header_parts.append(f"Rev: {rev}")
                if mfr or mdl: header_parts.append(f"Equipment: {mfr} {mdl}".strip())

                doc_lines.append(f"\n--- Document [{i}]: {', '.join(header_parts)} ---")
                doc_lines.append(content[:1600])
            sections.append("\n".join(doc_lines))

        return "\n\n".join(sections)

    async def chat(
        self,
        messages: List[Dict[str, str]],
        context_docs: Optional[List[Dict[str, Any]]] = None,
        equipment_context: Optional[Dict[str, Any]] = None,
        structured_knowledge: Optional[List[Dict[str, Any]]] = None,
        system_override: Optional[str] = None,
        model: Optional[str] = None
    ) -> Dict[str, Any]:
        """Execute chat inference against local Ollama with timeout, retry, and fallback."""
        health = await self.check_health()
        if not health["online"]:
            return {
                "success": False,
                "reply": "Local AI service is unavailable. Please check that Ollama is running.",
                "error_category": "ollama_offline",
                "active_model": self.active_model
            }

        target_model = model or self.active_model
        system_prompt = self.assemble_system_prompt(
            system_override=system_override,
            context_docs=context_docs,
            equipment_context=equipment_context,
            structured_knowledge=structured_knowledge
        )

        ollama_messages = [{"role": "system", "content": system_prompt}]
        for m in messages:
            role = m.get("role", "user")
            content = m.get("content", "")
            if content.strip():
                ollama_messages.append({"role": role, "content": content})

        payload = {
            "model": target_model,
            "messages": ollama_messages,
            "stream": False,
            "options": {
                "temperature": 0.2,
                "num_ctx": 4096,
            }
        }

        last_error = ""
        for attempt in range(AI_MAX_RETRIES + 1):
            try:
                async with httpx.AsyncClient(timeout=AI_REQUEST_TIMEOUT) as client:
                    resp = await client.post(f"{self.active_base_url}/api/chat", json=payload)
                    if resp.status_code == 200:
                        data = resp.json()
                        reply = data.get("message", {}).get("content", "").strip()
                        if not reply:
                            reply = "No response was generated by the model. Please check the prompt."

                        return {
                            "success": True,
                            "reply": reply,
                            "provider": "ollama",
                            "model": target_model,
                            "base_url": self.active_base_url,
                            "rag_used": bool(context_docs or structured_knowledge),
                            "retrieved_doc_count": len(context_docs or []),
                            "structured_knowledge_count": len(structured_knowledge or [])
                        }
                    else:
                        last_error = f"Ollama returned HTTP status {resp.status_code}: {resp.text[:200]}"
            except httpx.TimeoutException:
                last_error = "Model inference timed out (cold start or complex prompt)."
                logger.warning(f"Ollama inference timeout on attempt {attempt+1}")
            except Exception as e:
                last_error = str(e)
                logger.error(f"Ollama chat error on attempt {attempt+1}: {e}")

            if attempt < AI_MAX_RETRIES:
                await asyncio.sleep(1.0)

        return {
            "success": False,
            "reply": f"Local Solar Support Engineer AI is temporarily unresponsive ({last_error}). Please try again.",
            "error_category": "inference_error",
            "active_model": target_model
        }

    async def stream_chat(
        self,
        messages: List[Dict[str, str]],
        context_docs: Optional[List[Dict[str, Any]]] = None,
        equipment_context: Optional[Dict[str, Any]] = None,
        structured_knowledge: Optional[List[Dict[str, Any]]] = None,
        system_override: Optional[str] = None,
        model: Optional[str] = None
    ) -> AsyncGenerator[str, None]:
        """Stream chunks from local Ollama for real-time frontend rendering."""
        health = await self.check_health()
        if not health["online"]:
            yield "Local AI service is unavailable. Please check that Ollama is running."
            return

        target_model = model or self.active_model
        system_prompt = self.assemble_system_prompt(
            system_override=system_override,
            context_docs=context_docs,
            equipment_context=equipment_context,
            structured_knowledge=structured_knowledge
        )

        ollama_messages = [{"role": "system", "content": system_prompt}]
        for m in messages:
            role = m.get("role", "user")
            content = m.get("content", "")
            if content.strip():
                ollama_messages.append({"role": role, "content": content})

        payload = {
            "model": target_model,
            "messages": ollama_messages,
            "stream": True,
            "options": {
                "temperature": 0.2,
                "num_ctx": 4096,
            }
        }

        try:
            async with httpx.AsyncClient(timeout=AI_REQUEST_TIMEOUT) as client:
                async with client.stream("POST", f"{self.active_base_url}/api/chat", json=payload) as response:
                    if response.status_code != 200:
                        yield f"Ollama error: HTTP {response.status_code}"
                        return
                    async for line in response.aiter_lines():
                        if line:
                            import json
                            try:
                                chunk = json.loads(line)
                                part = chunk.get("message", {}).get("content", "")
                                if part:
                                    yield part
                            except Exception:
                                pass
        except Exception as e:
            logger.error(f"Ollama streaming failed: {e}")
            yield f"\n[Inference interrupted: {str(e)}]"


# Singleton instance
ollama_service = OllamaService()
