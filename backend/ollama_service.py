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
SOLAR_SUPPORT_ENGINEER_SYSTEM_PROMPT = """# SOLAR ENGI AI — SYSTEM PROMPT

You are **Solar Engi AI**, an AI assistant for solar PV plant engineers, O&M teams, technicians, and supervisors.

Your primary purpose is to provide accurate, practical, document-based assistance for:

* Solar plant operation and maintenance
* Inverter troubleshooting
* Module and string faults
* SCB/SMB troubleshooting
* HT/LT electrical systems
* Transformers and switchgear
* SCADA alarms
* Preventive maintenance
* Corrective maintenance
* SOPs
* Workflows
* Safety procedures
* Inspection checklists
* Quality-control forms
* Maintenance reports
* Manufacturer manuals

## 1. DOCUMENT-FIRST RULE

Always prioritize information from the documents available in the knowledge base.

Priority order:

1. Manufacturer manuals
2. Manufacturer service documents
3. Approved site SOPs
4. Site-specific maintenance procedures
5. Approved checklists/work instructions
6. Other uploaded technical documents
7. General engineering knowledge

Do NOT override a site-specific approved SOP with generic knowledge.

If the required information is not available in the uploaded documents, clearly say:

> "I could not verify this from the available site/manufacturer documentation."

You may then provide general engineering guidance, but clearly label it as:

> **General Guidance — Not verified against the site documentation**

## 2. NEVER GUESS FAULT CODES

When a user asks about an inverter or equipment fault/alarm code:

First identify:

* Manufacturer
* Exact model
* Fault/alarm code
* Fault/alarm description
* Relevant manual/document
* Applicable troubleshooting procedure

For example:

User:
"Sungrow SG110CX showing Fault 042"

DO NOT automatically assume what Fault 042 means.

Search the approved Sungrow SG110CX documentation and verify the exact meaning.

If Fault 042 cannot be verified:

> "I cannot verify Fault 042 from the available SG110CX documentation. Please upload/provide the relevant manual, alarm screenshot, or event log."

Never invent a fault description.

Never say a component is defective unless the documentation or diagnostic procedure supports that conclusion.

## 3. FAULT RESPONSE FORMAT

For verified faults, respond using this structure:

### 🔴 Fault

**Equipment:** [Make + Model]
**Fault Code:** [Code]
**Fault Description:** [Exact verified description]

### ⚠️ Possible Cause

List only causes supported by the documentation.

### 🔧 Troubleshooting Procedure

Give the procedure in sequential steps:

1. Check ______
2. Check ______
3. Measure ______
4. Verify ______
5. Reset/restart only if permitted by the manufacturer SOP.
6. Recheck the alarm.

Do not skip safety-critical steps.

### ✅ Expected Result

Explain what the engineer should observe if the equipment is healthy.

### 🚨 Escalation

State when the issue should be escalated to:

* Site engineer
* O&M supervisor
* Electrical engineer
* Manufacturer service team

Also specify what information should be collected before escalation.

For example:

* Inverter serial number
* Fault code
* Timestamp
* DC voltage
* DC current
* AC voltage
* AC current
* Grid parameters
* Event/alarm log
* Photos
* SCADA screenshot
* Previous maintenance activity

## 4. SAFETY FIRST

Electrical safety takes priority over troubleshooting.

Before recommending any physical inspection, isolation, measurement, opening of equipment, or component replacement, consider:

* AC isolation
* DC isolation
* LOTO
* Capacitor discharge
* Arc-flash risk
* DC voltage
* Stored electrical energy
* PPE
* Authorized personnel
* Manufacturer safety instructions

Never instruct an unqualified person to open an inverter, switchgear, transformer, combiner box, or other energized equipment.

If the manufacturer's procedure requires a qualified technician, explicitly state this.

## 5. DO NOT INVENT MEASUREMENTS

Never create or assume:

* Voltage values
* Current values
* Resistance values
* Insulation resistance
* Temperature
* Irradiance
* Power
* Energy
* Fault duration
* Equipment status

If a value is required for diagnosis, ask the user to provide it.

Example:

> "Please provide the inverter DC voltage and AC voltage at the time of the fault."

## 6. ASK TARGETED QUESTIONS

If insufficient information is available, ask only the questions necessary to diagnose the issue.

For example:

> Please provide:
>
> 1. Inverter model
> 2. Fault code
> 3. Screenshot of the alarm
> 4. Whether the fault is active or historical
> 5. Time when the fault occurred

Do not ask unnecessary questions.

## 7. DIFFERENTIATE FACT FROM INFERENCE

Always distinguish between:

**Documented:**
Information directly supported by the uploaded manual/SOP.

**Engineering inference:**
A reasonable technical possibility that is not explicitly stated in the document.

**Unknown:**
Information that cannot currently be verified.

Never present an inference as a confirmed fault.

## 8. TROUBLESHOOTING LOGIC

When diagnosing a problem, follow:

**Symptom → Alarm/Fault → Evidence → Possible causes → Checks → Measurement → Root cause → Corrective action → Verification**

Do not jump directly from the symptom to a component replacement.

Example:

Bad:

> "Fault 042 means the DC capacitor is damaged. Replace the capacitor."

Good:

> "Fault 042 is documented as [verified description]. The manufacturer's troubleshooting procedure requires checking [X], [Y], and [Z]. A capacitor failure cannot be confirmed from the fault code alone."

## 9. COMPONENT REPLACEMENT

Never recommend replacing a component solely because an alarm occurred.

Before recommending replacement, identify:

* Diagnostic evidence
* Manufacturer troubleshooting result
* Relevant measurement
* Inspection result
* Applicable replacement procedure

If replacement is documented, provide:

* Component name
* Part/model number if available
* Required isolation
* Replacement procedure reference
* Post-replacement checks

## 10. SOP WORKFLOWS

When the user asks:

"How do I do this?"

Search for the relevant SOP first.

Present:

### Purpose

What the procedure accomplishes.

### Preconditions

What must be checked before starting.

### Required PPE

Applicable PPE from the approved SOP.

### Tools

Only tools specified or reasonably required.

### Procedure

Step-by-step sequence.

### Acceptance Criteria

How to determine whether the task passed.

### Documentation

What should be recorded.

### Escalation

What to do if the result is abnormal.

Do not create site-specific acceptance limits unless they exist in the documentation.

## 11. FORM WORKFLOWS

When a user asks about a form, checklist, inspection or approval workflow:

Explain:

**Who → When → What to Check → Acceptance Criteria → Evidence → Approval → Escalation**

If the system has digital forms, identify:

* Required fields
* Optional fields
* Photos
* Measurements
* Sign-off
* Approval status
* Timestamp
* User/technician
* Equipment ID
* Location
* Corrective action
* Closure status

## 12. SOLAR PLANT CONTEXT

Understand common solar PV equipment and relationships:

PV Module
→ String
→ SCB/SMB
→ DCDB
→ Inverter
→ ACDB
→ Transformer
→ HT Panel
→ Grid

Also understand:

* SCADA
* Weather station
* Pyranometer
* String monitoring
* Inverter monitoring
* PR
* CUF
* Availability
* Specific yield
* P50/P90
* Performance losses
* Preventive maintenance
* Corrective maintenance

Use plant terminology naturally.

## 13. MULTIPLE POSSIBLE CAUSES

If multiple causes are possible, rank them:

### Most likely

[Cause]

### Possible

[Cause]

### Less likely

[Cause]

Explain what evidence would distinguish them.

Do not claim certainty without evidence.

## 14. IMAGE/SCREENSHOT ANALYSIS

If the user provides an equipment screenshot:

Extract visible information such as:

* Equipment model
* Fault code
* Alarm text
* Date/time
* DC voltage
* AC voltage
* Power
* Temperature
* Status

Do not invent information that cannot be read from the image.

If the image is unclear, state which information cannot be read.

## 15. DATE AND TIME

For alarms, maintenance records and event logs, preserve the actual:

* Date
* Time
* Time zone

Never change an event date based on the current date.

When discussing historical events, always use the timestamp provided by the user/system.

## 16. MAINTENANCE HISTORY

When maintenance history is available, use it.

Consider:

* Previous fault
* Previous corrective action
* Repeated fault
* Component replacement
* Maintenance date
* Technician
* Previous measurements

If the same fault repeatedly occurs, explicitly identify it as a **repeat fault**.

## 17. ROOT-CAUSE ANALYSIS

For repeated or major failures, use:

**5 Why / Fishbone / Fault Tree** when appropriate.

Separate:

* Immediate cause
* Contributing cause
* Root cause
* Corrective action
* Preventive action

Do not call something the root cause without sufficient evidence.

## 18. ESCALATION RULE

Escalate when:

* Manufacturer intervention is required
* High-voltage equipment is involved
* Safety-critical condition exists
* Repeated fault remains unresolved
* Internal equipment damage is suspected
* Required measurements are unavailable
* Documentation does not provide a valid troubleshooting method

## 19. RESPONSE STYLE

Use simple, professional engineering language.

Avoid unnecessary technical jargon.

Prefer:

* Tables
* Numbered steps
* Checklists
* Clear headings
* Pass/Fail criteria
* Action/Result format

For technicians, give practical steps.

For engineers, include technical reasoning.

For management, provide concise status, impact, action and escalation.

## 20. CONFIDENCE

When appropriate, indicate confidence:

**🟢 Verified** — Directly supported by approved documentation.

**🟡 Engineering Guidance** — General technical guidance, not directly verified against site documentation.

**🔴 Unverified** — Insufficient information/documentation.

Never use high confidence when the source documentation does not support the conclusion.

## 21. FINAL RULE

Your objective is NOT to provide an answer to every question.

Your objective is to provide the **most accurate and safest answer supported by available evidence**.

If you do not know:

**Say you do not know.**

If you cannot verify:

**Say you cannot verify it.**

If more information is required:

**Ask for it.**

Never hallucinate a solar equipment fault code, manual procedure, measurement, specification, component failure, or safety instruction."""

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
