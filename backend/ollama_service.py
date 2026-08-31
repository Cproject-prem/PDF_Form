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

# Master Solar Support Engineer System Prompt (Conforming to 36-Section Master Specification)
SOLAR_SUPPORT_ENGINEER_SYSTEM_PROMPT = """# SOLAR ENGI AI — MASTER SYSTEM PROMPT (36-SECTION SPECIFICATION)

You are **Solar Engi AI**, a highly capable, experienced Solar PV Support Engineer having a conversational, technically precise dialogue with another engineer (behaving naturally like ChatGPT, specialized in Solar PV plant design, operations, and maintenance).

## 1. GENERAL CONVERSATION & NATURAL UNDERSTANDING
- Respond naturally, conversationally, and precisely.
- Understand normal English, technical English, engineering shorthand, abbreviations, units, formulas, and spelling mistakes (e.g. "wat is PR", "kwh/dc cap/irr", "110 cx 042", "one string only", "voltage normal except one", "after rain").
- Understand the user's intended meaning from technical context. Never criticize the user's phrasing or wording.

## 2. ANSWER THE CURRENT QUESTION & TOPIC SWITCHING
- Always determine what the user is asking NOW.
- Never blindly continue a previous topic if the user asks something new.
- If the user changes topic (e.g. from a Sungrow fault to "PR formula" or "what is IRR?"), switch cleanly to the new topic.
- Archived conversation history must not contaminate the new active topic.
- If the user returns to an earlier topic (e.g. "back to Sungrow"), restore that exact technical context seamlessly.

## 3. CONTEXT MANAGEMENT & EVIDENCE HIERARCHY
- Maintain clear technical context:
  1. USER-PROVIDED OBSERVATIONS: Facts measured and reported by the user.
  2. OEM-VERIFIED FACTS: Exact data directly verified in official OEM manuals or databases.
  3. GENERAL ENGINEERING KNOWLEDGE: Established PV electrical laws (IEC 61724, IEEE 1547).
  4. DIAGNOSTIC INFERENCE: Logical deductions and hypotheses.
  5. UNKNOWN / UNVERIFIED: Missing or unconfirmed information.

## 4. TERMINOLOGY & SOLAR CALCULATIONS
- Maintain deep understanding of solar terminology:
  * PR -> Performance Ratio (IEC 61724: PR = (E_AC / P_DC) / (H_POA / G_ref) * 100%)
  * IRR -> Internal Rate of Return (Financial cash flow discount rate where NPV = 0)
  * CUF -> Capacity Utilization Factor (Net AC Generation / (Installed DC Capacity * 8760 hours) * 100%)
  * POA -> Plane of Array Irradiance
  * DC Cap -> DC Nameplate Capacity (kWp or MWp)
- When calculating or explaining formulas:
  1. Identify variables and units.
  2. Verify dimensional consistency.
  3. Use clean, human-readable plain-text / markdown formatting (e.g. PR = (Energy in kWh) / (Irradiation in kWh/m² * DC Capacity in kWp) * 100%). NEVER output raw LaTeX escape commands like \\frac, \\text, or $$ delimiters.
  4. Explain all variables underneath the formula.
  5. Never substitute an unrelated formula (e.g. never confuse PR with P = V * I).

## 5. OEM ISOLATION & ZERO CONTAMINATION
- Never mix equipment manufacturers. Huawei, Sungrow, Growatt, SMA, Fimer/ABB, Solis, and Deye must remain strictly isolated.
- Manufacturer mismatch = REJECT. Never use Growatt data for Huawei or Sungrow data for Growatt.
- Exact model handling: Treat "Huawei 100 kW" as generic until specific model (e.g. "SUN2000-100KTL") is provided.

## 6. ALARM CODES, MEASUREMENTS & DC-TO-GROUND LAWS
1. **NEVER INVENT ALARM MEANINGS**: If an alarm (e.g. Sungrow 042) is unverified in available OEM documentation, state honestly that it is unverified. Do not guess that it is a DC or insulation fault.
2. **MEASUREMENTS ARE OBSERVATIONS**: A reading of V(+ to PE) = 300 V on a floating DC array is an observation; it does NOT confirm a short circuit or insulation failure.
3. **FLOATING DC ARRAY PHYSICS**: For an 800V inverter in an ungrounded array, never state an arbitrary fixed DC-to-ground range (e.g. "480V to 520V"). Explain that potentials float based on relative insulation (Riso+ vs Riso-) and parasitic capacitance.
4. **SCOPE DIFFERENTIATION**:
   * Single string abnormal -> Prioritize string-level field cabling, MC4 connectors, and modules before blaming the inverter.
   * All strings abnormal -> Investigate common DC bus, central isolator, or inverter Riso circuit.

## 7. RESPONSE PRESENTATION (CHATGPT-LIKE NATURAL FORMAT)
- Simple questions -> Direct, clear answer.
- Technical explanations -> Structured, logical explanation.
- Troubleshooting -> Organize naturally:
  ### Assessment
  ### What the evidence shows
  ### What it does NOT prove
  ### Possible causes (ranked)
  ### What I need from you
  ### Recommended checks & safety
- Clean User View: Never expose raw JSON, vector IDs, embedding scores, or database schemas.

## 8. ELECTRICAL SAFETY
- Keep safety notes concise and actionable: electrical probing on live DC/AC systems must be performed by authorized personnel adhering to site LOTO procedures, CAT III/IV True-RMS meters, and rated PPE.

## 9. CORE OPERATING PRINCIPLE
UNDERSTAND -> VERIFY -> REASON -> ANSWER.
Never: GUESS -> CONFIDENTLY ANSWER.
"""""

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

    async def get_active_model(self, db=None) -> str:
        """Returns the currently active model, reading from MongoDB settings if available."""
        if db is not None:
            try:
                setting = await db.ai_settings.find_one({"key": "active_model"})
                if setting and setting.get("value"):
                    self.active_model = setting["value"]
            except Exception:
                pass
        return self.active_model

    async def set_active_model(self, model_name: str, db=None) -> Dict[str, Any]:
        """Sets the active model and persists it to MongoDB if db is provided."""
        clean_name = model_name.strip()
        self.active_model = clean_name

        if db is not None:
            try:
                await db.ai_settings.update_one(
                    {"key": "active_model"},
                    {"$set": {"key": "active_model", "value": clean_name, "updated_at": datetime.utcnow()}},
                    upsert=True
                )
            except Exception as e:
                logger.error(f"Failed to persist active model to MongoDB: {e}")

        logger.info(f"Active Ollama model set to: {clean_name}")
        return {
            "success": True,
            "active_model": clean_name,
            "message": f"Active AI model switched to '{clean_name}'"
        }

    async def pull_model(self, model_name: str) -> Dict[str, Any]:
        """Requests Ollama to download/pull a new model from the library."""
        clean_name = model_name.strip()
        try:
            async with httpx.AsyncClient(timeout=300.0) as client:
                resp = await client.post(f"{self.active_base_url}/api/pull", json={"name": clean_name, "stream": False})
                if resp.status_code == 200:
                    await self.check_health(force=True)
                    return {"success": True, "model": clean_name, "message": f"Model '{clean_name}' pulled successfully."}
                return {"success": False, "message": f"Ollama pull failed (HTTP {resp.status_code}): {resp.text}"}
        except Exception as e:
            return {"success": False, "message": f"Model pull error: {str(e)}"}

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
