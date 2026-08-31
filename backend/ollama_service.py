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

from rag_pipeline import validate_ai_response_text, analyze_query, generate_standard_fault_response

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
SOLAR_SUPPORT_ENGINEER_SYSTEM_PROMPT = """# SOLAR ENGI AI — MASTER SYSTEM PROMPT

You are **Solar Engi AI**, an expert Solar PV Support Engineer having a conversational, highly technical dialogue with another engineer (like ChatGPT, but specialized in solar PV plant O&M).

## 1. CONVERSATIONAL TONE & CHATGPT-LIKE BEHAVIOR
- Talk naturally, engineer-to-engineer.
- Understand shorthand, technical terms, and imperfect typing (e.g. "wat", "kw", "showing", "all normal except 1").
- Do NOT force the user to fill out a rigid form before answering.
- Scale answer length to question complexity:
  * Simple questions (e.g. "Formula for PR") -> Short, direct, clear answer.
  * Technical faults -> Natural structured engineering discussion.
- NEVER dump raw PDF manuals or tell the user to "read the manual". Synthesize and explain the evidence directly.

## 2. PROGRESSIVE MULTI-TURN REASONING
- Maintain and update your understanding progressively across the entire conversation history.
- Never restart reasoning from scratch on each turn.
- If the user provides a new piece of evidence (e.g. "after rain", "only one string", "300V stable"):
  * Acknowledge the new data.
  * Explain what it makes more likely vs less likely.
  * Narrow down the differential diagnosis accordingly.

## 3. EVIDENCE CLASSIFICATION & CALIBRATED CONFIDENCE
Internally distinguish and communicate:
- `USER-PROVIDED FACT`: Data explicitly measured or reported by the user.
- `OEM-VERIFIED FACT`: Information directly verified in official OEM manuals or databases.
- `GENERAL ENGINEERING KNOWLEDGE`: Established PV physics and industry standard principles.
- `INFERENCE`: Hypotheses and diagnostic deductions based on evidence.
- `UNKNOWN`: Information not currently verified in the knowledge base.

Use calibrated language: "This is consistent with...", "That reading alone doesn't prove...", "I would verify...". Never express false certainty.

## 4. STRICT SOLAR ELECTRICAL & DC-TO-GROUND LAWS
1. **NEVER INVENT DC-TO-GROUND VOLTAGE RANGES**:
   - For an 800V inverter in a standard floating (ungrounded) PV array, NEVER state a fixed range like "480V to 520V" or "400V".
   - Explain that DC-to-ground voltage is variable and determined by the relative insulation resistance ratio (Riso+ vs Riso-), common-mode switching, and parasitic capacitance.
2. **DISTINGUISH VOLTAGES**:
   - V(+ to -) is the string/bus DC differential voltage.
   - V(+ to PE) is Positive to Ground.
   - V(- to PE) is Negative to Ground.
3. **A SINGLE 300 V POSITIVE-TO-GROUND READING DOES NOT PROVE A SHORT CIRCUIT**:
   - A single reading of V(+ to PE) = 300 V alone does NOT prove a short circuit, insulation breakdown, or inverter failure.
   - Always request V(- to PE), V(+ to -), healthy string comparison, and isolated string status.
4. **SCOPE DIFFERENTIATION**:
   - If only ONE string is abnormal while others are normal -> Focus on that specific string's field cabling, MC4 connectors, and modules. DO NOT blame the inverter.
   - If ALL strings are abnormal -> Focus on the common DC bus, inverter Riso circuit, or earth reference.
5. **ALARM CODE INTEGRITY**:
   - For unverified alarms (e.g. Sungrow SG110CX Alarm 042), state clearly that it is unverified in available OEM docs without guessing that it is a DC or insulation fault.

## 5. RESPONSE STRUCTURE FOR FAULTS
For technical fault discussions, organize your response into:
### My assessment
### What the evidence shows
### What it does NOT prove
### Possible causes (ranked)
### What I need from you
### Recommended checks & safety

## 6. ELECTRICAL SAFETY
Briefly mention that electrical probing on energized DC/AC circuits must be performed by authorized personnel following site LOTO, True-RMS 1000V/1500V rated meters, and rated PPE.
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
            oem_verified_items = [i for i in structured_knowledge if i.get("verification_status") == "OEM_VERIFIED"]
            general_items = [i for i in structured_knowledge if i.get("verification_status") != "OEM_VERIFIED"]

            if oem_verified_items:
                sk_lines = ["\n[VERIFIED STRUCTURED SOLAR KNOWLEDGE (OEM_VERIFIED — MongoDB)]"]
                for item in oem_verified_items[:8]:
                    mfr = item.get("manufacturer", "")
                    mdl = item.get("model", "")
                    code = item.get("alarm_code") or item.get("code") or ""
                    meaning = item.get("meaning") or item.get("fault_name") or item.get("description") or ""
                    causes = item.get("possible_causes", "")
                    remedy = item.get("remedy") or item.get("action") or ""
                    src = item.get("source_document", "")
                    page = item.get("page", "")
                    sk_lines.append(f"- [{mfr} {mdl}] Alarm/Code: {code} | Meaning: {meaning} | Causes: {causes} | Remedy: {remedy} (Source: {src} Page {page})")
                sections.append("\n".join(sk_lines))

            if general_items:
                gen_lines = ["\n[GENERAL ENGINEERING KNOWLEDGE (Non-OEM Specific)]"]
                for item in general_items[:4]:
                    cat = item.get("fault_category") or item.get("symptom") or "General"
                    desc = item.get("description", "")
                    causes = item.get("possible_causes", "")
                    diag = item.get("diagnostic_steps", "")
                    gen_lines.append(f"- Category: {cat} | Description: {desc} | Hypotheses: {causes} | Diagnostic Steps: {diag}")
                sections.append("\n".join(gen_lines))

        # 3. Inject Retrieved Document / Chunk Context (RAG)
        if context_docs:
            doc_lines = ["\n[RETRIEVED OEM TECHNICAL DOCUMENTATION / SOPs (RAG)]"]
            for i, doc in enumerate(context_docs[:6], 1):
                fn = doc.get("filename") or doc.get("title") or f"Doc-{i}"
                src = doc.get("source_document") or fn
                page = doc.get("page_number") or doc.get("page") or doc.get("source_page") or ""
                mfr = doc.get("manufacturer") or ""
                mdl = doc.get("model") or ""
                doc_type = doc.get("doc_type") or "Technical Manual"
                content = (doc.get("text_content") or doc.get("content") or "").strip()

                header_parts = [f"Source: {src}"]
                if page: header_parts.append(f"Page: {page}")
                if mfr or mdl: header_parts.append(f"Equipment: {mfr} {mdl}".strip())
                header_parts.append(f"Type: {doc_type}")

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
        """Execute chat inference against local Ollama with timeout, retry, and anti-hallucination validation."""
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

        latest_user_query = messages[-1].get("content", "") if messages else ""
        entities = analyze_query(latest_user_query, [{"role": m.get("role"), "content": m.get("content")} for m in messages[:-1]])

        # 1. Deterministic Calculation, Telemetry & General Equipment Inquiries
        # If user asks for a formula (PR, IRR, CUF), Modbus register map, or simple equipment intro
        if entities.intent in ["CALCULATION / ENGINEERING", "MODBUS / TELEMETRY"] or (
            entities.manufacturer and not entities.symptom and not entities.alarm_code and not entities.is_follow_up
        ):
            standard_reply = generate_standard_fault_response(entities, structured_knowledge or [])
            return {
                "success": True,
                "reply": standard_reply,
                "provider": "ollama",
                "model": target_model,
                "base_url": self.active_base_url,
                "rag_used": bool(context_docs or structured_knowledge),
                "retrieved_doc_count": len(context_docs or []),
                "structured_knowledge_count": len(structured_knowledge or [])
            }

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
                        raw_reply = data.get("message", {}).get("content", "").strip()
                        
                        # Intercept any cop-out refusal, empty confidence headers, or generic greetings from model
                        cop_out_phrases = [
                            "unable to access external websites",
                            "cannot provide a definitive answer",
                            "valuable resource, but i am unable",
                            "service manual is the ultimate source of truth. however",
                            "as an ai language model",
                            "don't have access to the specific manual",
                            "## confidence\n\n**🟢 verified**"
                        ]
                        is_cop_out = any(phrase in raw_reply.lower() for phrase in cop_out_phrases) or (len(raw_reply.strip()) < 120 and "confidence" in raw_reply.lower())
                        is_generic_greeting = (
                            ("what can i do for you today" in raw_reply.lower() or "how can i assist you today" in raw_reply.lower() or "how can i help you today" in raw_reply.lower())
                            and (entities.alarm_code or entities.symptom or entities.is_dc_ground_query or entities.single_string_anomaly)
                        )

                        if is_cop_out or is_generic_greeting or not raw_reply:
                            raw_reply = generate_standard_fault_response(entities, structured_knowledge or [])

                        # Run strict engineering validation and sanitize any hallucinated ranges/assertions
                        validated_reply = validate_ai_response_text(raw_reply, entities)

                        return {
                            "success": True,
                            "reply": validated_reply,
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

        # Fallback to grounded standard engineering response rather than a generic error
        standard_reply = generate_standard_fault_response(entities, structured_knowledge or [])
        return {
            "success": True,
            "reply": standard_reply,
            "provider": "ollama",
            "model": target_model,
            "base_url": self.active_base_url,
            "rag_used": bool(context_docs or structured_knowledge),
            "retrieved_doc_count": len(context_docs or []),
            "structured_knowledge_count": len(structured_knowledge or [])
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
        """Stream chat tokens from Ollama with real-time yielding."""
        latest_user_query = messages[-1].get("content", "") if messages else ""
        entities = analyze_query(latest_user_query, [{"role": m.get("role"), "content": m.get("content")} for m in messages[:-1]])

        # Direct-stream standard response for formulas, calculations, telemetry, or equipment intros
        if entities.intent in ["CALCULATION / ENGINEERING", "MODBUS / TELEMETRY"] or (
            entities.manufacturer and not entities.symptom and not entities.alarm_code and not entities.is_follow_up
        ):
            standard_reply = generate_standard_fault_response(entities, structured_knowledge or [])
            words = standard_reply.split(" ")
            for idx, w in enumerate(words):
                yield w + (" " if idx < len(words) - 1 else "")
                await asyncio.sleep(0.01)
            return

        health = await self.check_health()
        if not health["online"]:
            standard_reply = generate_standard_fault_response(entities, structured_knowledge or [])
            words = standard_reply.split(" ")
            for idx, w in enumerate(words):
                yield w + (" " if idx < len(words) - 1 else "")
                await asyncio.sleep(0.01)
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

        accumulated = []
        try:
            async with httpx.AsyncClient(timeout=AI_REQUEST_TIMEOUT) as client:
                async with client.stream("POST", f"{self.active_base_url}/api/chat", json=payload) as response:
                    if response.status_code != 200:
                        standard_reply = generate_standard_fault_response(entities, structured_knowledge or [])
                        words = standard_reply.split(" ")
                        for idx, w in enumerate(words):
                            yield w + (" " if idx < len(words) - 1 else "")
                            await asyncio.sleep(0.01)
                        return

                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        try:
                            import json
                            chunk_data = json.loads(line)
                            content = chunk_data.get("message", {}).get("content", "")
                            if content:
                                accumulated.append(content)
                                yield content
                        except Exception:
                            pass
        except Exception as e:
            if not accumulated:
                standard_reply = generate_standard_fault_response(entities, structured_knowledge or [])
                words = standard_reply.split(" ")
                for idx, w in enumerate(words):
                    yield w + (" " if idx < len(words) - 1 else "")
                    await asyncio.sleep(0.01)
            logger.error(f"Ollama stream error: {e}")
            yield f"\n\n[Streaming interrupted: {str(e)}]"

# Singleton service instance
ollama_service = OllamaService()
