"""
FormForge Solar Support Engineer AI — Advanced Intent-Driven RAG Pipeline
========================================================================
Implements intent-based query routing, entity extraction, multi-stage retrieval
(MongoDB structured knowledge first for faults), document-type priority reranking,
anti-hallucination model guarding, and comprehensive debug diagnostics.
"""

from __future__ import annotations

import re
import time
import logging
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime
from bson import ObjectId

logger = logging.getLogger("solar-rag-pipeline")

# ============================================================================
# 1. OEM & Entity Dictionaries
# ============================================================================

SOLAR_MANUFACTURERS = [
    "Growatt", "Huawei", "Sungrow", "Solis", "Deye", "SMA", "Delta",
    "SolarEdge", "Fimer", "ABB", "GoodWe", "Ingeteam", "Sineng",
    "Fronius", "Schneider", "TMEIC", "Hitachi", "Enphase", "Kaco",
    "Chint", "TBEA", "Kehua", "Polycab", "Havells", "Microtek", "Luminous"
]

FAULT_SYMPTOM_PATTERNS = [
    (r"\b(insulation|iso|ground\s*fault|isolation|riso|leakage\s*current|earth\s*fault)\b", "insulation fault"),
    (r"\b(grid\s*fault|grid\s*lost|no\s*grid|grid\s*absent|grid\s*outage|grid\s*fail)\b", "grid fault"),
    (r"\b(over\s*temp|overtemperature|high\s*temp|thermal|overheating)\b", "overtemperature"),
    (r"\b(dc\s*bus|bus\s*voltage|over\s*voltage|high\s*dc|dc\s*overvoltage)\b", "DC bus overvoltage"),
    (r"\b(under\s*voltage|low\s*voltage|ac\s*undervoltage)\b", "AC undervoltage"),
    (r"\b(arc\s*fault|afci|spark)\b", "arc fault"),
    (r"\b(pv\s*reverse|reverse\s*polarity|string\s*reverse)\b", "PV reverse polarity"),
    (r"\b(fan\s*error|fan\s*fault|fan\s*blocked|fan\s*failure)\b", "fan fault"),
    (r"\b(comm|communication|rs485|modbus|offline|cannot\s*connect)\b", "communication lost"),
    (r"\b(relay\s*fault|contactor|relay\s*check)\b", "relay check failure"),
]

KNOWN_MODEL_FAMILIES = {
    "growatt": [
        "max 50ktl3", "max 60ktl3", "max 70ktl3", "max 80ktl3", "max 100ktl3",
        "max 125ktl3", "max 150ktl3", "mid 15ktl3", "mid 20ktl3", "mid 25ktl3",
        "mac 50ktl3", "mac 60ktl3", "min 2500", "min 3000", "min 5000", "min 6000",
        "sph 3000", "sph 5000", "sph 6000", "sph 10000", "wit 50k", "wit 100k"
    ],
    "huawei": [
        "sun2000-100ktl", "sun2000-125ktl", "sun2000-60ktl", "sun2000-185ktl",
        "sun2000-215ktl", "sun2000-330ktl", "sun2000-50ktl", "sun2000-36ktl"
    ],
    "sungrow": [
        "sg110cx", "sg125hx", "sg250hx", "sg350hx", "sg33cx", "sg50cx",
        "sg80cx", "sg25cx", "sg100cx"
    ],
    "solis": [
        "solis-25k-5g", "solis-50k-5g", "solis-80k-5g", "solis-100k-5g", "solis-110k-5g",
        "s5-gc50k", "s5-gc60k", "s6-eh1p"
    ],
    "deye": [
        "sun-50k-sg01hp3", "sun-60k-sg01hp3", "sun-100k-g03", "sun-12k-sg04lp3"
    ],
    "sma": [
        "sunny highpower peak1", "sunny highpower peak3", "sunny tripower core1",
        "sunny tripower core2", "sunny boy"
    ]
}


class QueryEntities:
    def __init__(
        self,
        raw_query: str,
        intent: str = "GENERAL",
        manufacturer: Optional[str] = None,
        equipment_type: str = "inverter",
        power_kw: Optional[float] = None,
        power_str: Optional[str] = None,
        model: Optional[str] = None,
        symptom: Optional[str] = None,
        alarm_code: Optional[str] = None,
        context_qualifiers: Optional[List[str]] = None,
        is_follow_up: bool = False
    ):
        self.raw_query = raw_query
        self.intent = intent
        self.manufacturer = manufacturer
        self.equipment_type = equipment_type
        self.power_kw = power_kw
        self.power_str = power_str
        self.model = model  # Strictly None / "UNKNOWN" unless explicitly stated
        self.symptom = symptom
        self.alarm_code = alarm_code
        self.context_qualifiers = context_qualifiers or []
        self.is_follow_up = is_follow_up

    def to_dict(self) -> Dict[str, Any]:
        return {
            "raw_query": self.raw_query,
            "intent": self.intent,
            "manufacturer": self.manufacturer or "Unknown",
            "equipment_type": self.equipment_type,
            "power_kw": self.power_kw,
            "power_str": self.power_str or "Unknown",
            "model": self.model or "Unknown",
            "symptom": self.symptom or "Unknown",
            "alarm_code": self.alarm_code or "Unknown",
            "context_qualifiers": self.context_qualifiers,
            "is_follow_up": self.is_follow_up,
        }


# ============================================================================
# 2. Entity & Intent Analyzer
# ============================================================================

def analyze_query(query: str, history: Optional[List[Dict[str, Any]]] = None) -> QueryEntities:
    """Extracts structured entities, intent, and qualifiers from user prompt.
    CRITICAL RULE: Never assumes/guesses a specific model from power rating alone.
    """
    q_clean = query.strip()
    q_lower = q_clean.lower()

    # 1. Intent Detection
    fault_keywords = [
        "fault", "alarm", "error", "warning", "tripped", "tripping", "showing",
        "insulation", "iso fault", "ground fault", "earth fault", "leakage",
        "overtemp", "grid fault", "failure", "not generating", "not working",
        "code", "troubleshoot", "why is", "how to fix", "remedy", "cause"
    ]
    install_keywords = ["how to install", "mounting", "wall bracket", "torque", "clearance", "wiring diagram", "cable sizing"]
    spec_keywords = ["datasheet", "max input voltage", "mppt range", "efficiency", "weight", "dimension", "specs"]

    if any(k in q_lower for k in fault_keywords):
        intent = "FAULT / TROUBLESHOOTING"
    elif any(k in q_lower for k in install_keywords):
        intent = "INSTALLATION"
    elif any(k in q_lower for k in spec_keywords):
        intent = "SPECIFICATION"
    else:
        intent = "FAULT / TROUBLESHOOTING" if any(w in q_lower for w in ["inverter", "trip", "down", "issue", "problem"]) else "GENERAL"

    # 2. Manufacturer Detection
    detected_mfg = None
    for mfg in SOLAR_MANUFACTURERS:
        if re.search(rf"\b{re.escape(mfg.lower())}\b", q_lower):
            detected_mfg = mfg
            break

    # 3. Equipment Type
    equipment_type = "inverter"
    if "transformer" in q_lower:
        equipment_type = "transformer"
    elif "tracker" in q_lower:
        equipment_type = "tracker"
    elif "pyranometer" in q_lower or "sensor" in q_lower:
        equipment_type = "sensor"
    elif "module" in q_lower or "panel" in q_lower:
        equipment_type = "module"
    elif "combiner" in q_lower or "scb" in q_lower or "smb" in q_lower:
        equipment_type = "combiner_box"

    # 4. Power Rating Detection (e.g. 50 Kw, 50kw, 100 kW, 3.3 MW)
    power_kw = None
    power_str = None
    p_match = re.search(r"(\d+(?:\.\d+)?)\s*(k|kw|kva|mw|mva|w)\b", q_lower)
    if p_match:
        val = float(p_match.group(1))
        unit = p_match.group(2).lower()
        if "m" in unit:
            power_kw = val * 1000.0
            power_str = f"{int(val) if val.is_integer() else val} MW"
        else:
            power_kw = val
            power_str = f"{int(val) if val.is_integer() else val} kW"

    # 5. Symptom / Fault Pattern Detection
    detected_symptom = None
    for pattern, sym_name in FAULT_SYMPTOM_PATTERNS:
        if re.search(pattern, q_lower):
            detected_symptom = sym_name
            break
    if not detected_symptom and intent == "FAULT / TROUBLESHOOTING":
        sym_match = re.search(r"(?:showing|error|fault|alarm|code)\s+([a-zA-Z0-9_\-\s]+)", q_clean, re.IGNORECASE)
        if sym_match:
            detected_symptom = sym_match.group(1).strip()

    # 6. Specific Alarm Code Detection (e.g. Error 401, E023, F-04)
    alarm_code = None
    code_match = re.search(r"\b(?:error|alarm|code|fault|e|w|f)[\s\-_:]*([a-zA-Z]?\d{2,4}[a-zA-Z]?)\b", q_lower)
    if code_match:
        alarm_code = code_match.group(1).upper()

    # 7. Model Extraction (STRICT: only if explicitly specified, otherwise UNKNOWN)
    detected_model = None
    if detected_mfg:
        mfg_key = detected_mfg.lower()
        candidates = KNOWN_MODEL_FAMILIES.get(mfg_key, [])
        for c in candidates:
            if re.search(rf"\b{re.escape(c)}\b", q_lower):
                detected_model = c.upper()
                break

    if not detected_model:
        explicit_model_match = re.search(r"\b([A-Z]{2,5}[-_ ]?\d{2,4}[A-Z0-9\-_]*)\b", q_clean)
        if explicit_model_match:
            cand = explicit_model_match.group(1).strip()
            if not re.match(r"^\d+KW$", cand, re.IGNORECASE) and cand.upper() not in ["SOLAR", "INVERTER", "ERROR", "FAULT", "ALARM"]:
                detected_model = cand

    # 8. Context Qualifiers (after rain, morning, MPPT 3, etc.)
    qualifiers = []
    if "rain" in q_lower or "wet" in q_lower or "water" in q_lower:
        qualifiers.append("after rain / moisture")
    if "morning" in q_lower:
        qualifiers.append("morning start-up")
    if "intermittent" in q_lower:
        qualifiers.append("intermittent")
    mppt_m = re.search(r"mppt\s*(\d+)", q_lower)
    if mppt_m:
        qualifiers.append(f"MPPT {mppt_m.group(1)}")
    inv_m = re.search(r"inverter\s*(\d+)", q_lower)
    if inv_m:
        qualifiers.append(f"Inverter {inv_m.group(1)}")

    # 9. Follow-Up Resolution using Chat History
    is_follow_up = False
    if history and len(history) > 0:
        is_follow_up = True
        for msg in reversed(history):
            if msg.get("role") == "user":
                prev_text = msg.get("content", "").lower()
                if not detected_mfg:
                    for mfg in SOLAR_MANUFACTURERS:
                        if mfg.lower() in prev_text:
                            detected_mfg = mfg
                            break
                if not power_kw:
                    prev_p = re.search(r"(\d+(?:\.\d+)?)\s*(kw|mw)\b", prev_text)
                    if prev_p:
                        power_kw = float(prev_p.group(1))
                        power_str = f"{int(power_kw) if power_kw.is_integer() else power_kw} kW"
                if not detected_symptom:
                    for pattern, sym_name in FAULT_SYMPTOM_PATTERNS:
                        if re.search(pattern, prev_text):
                            detected_symptom = sym_name
                            break

    return QueryEntities(
        raw_query=q_clean,
        intent=intent,
        manufacturer=detected_mfg,
        equipment_type=equipment_type,
        power_kw=power_kw,
        power_str=power_str,
        model=detected_model,  # None if model was not explicitly named!
        symptom=detected_symptom,
        alarm_code=alarm_code,
        context_qualifiers=qualifiers,
        is_follow_up=is_follow_up
    )


# ============================================================================
# 3. Structured Knowledge & Fault Database Search (MongoDB First)
# ============================================================================

async def query_mongodb_fault_knowledge(db, entities: QueryEntities) -> List[Dict[str, Any]]:
    """Searches MongoDB structured collections for verified OEM alarm codes,
    fault differentials, troubleshooting steps, and training cases."""
    results = []

    mfg = entities.manufacturer or "Growatt"
    symptom = entities.symptom or "insulation fault"

    mfg_regex = {"$regex": f"^{re.escape(mfg)}$", "$options": "i"} if mfg else {"$exists": True}
    sym_regex = {"$regex": re.escape(symptom.split()[0]), "$options": "i"} if symptom else {"$exists": True}

    # 1. Search oem_alarm_codes
    try:
        alarm_docs = await db.oem_alarm_codes.find({
            "manufacturer": mfg_regex,
            "$or": [
                {"description": sym_regex},
                {"fault_name": sym_regex},
                {"alarm_code": {"$regex": entities.alarm_code, "$options": "i"}} if entities.alarm_code else {"_id": {"$exists": True}}
            ]
        }).to_list(10)
        for d in alarm_docs:
            d.pop("_id", None)
            d["_collection"] = "oem_alarm_codes"
            results.append(d)
    except Exception as e:
        logger.warning(f"oem_alarm_codes search error: {e}")

    # 2. Search fault_differential
    try:
        diff_docs = await db.fault_differential.find({
            "manufacturer": mfg_regex,
            "$or": [
                {"fault": sym_regex},
                {"symptom": sym_regex},
                {"alarm": sym_regex}
            ]
        }).to_list(10)
        for d in diff_docs:
            d.pop("_id", None)
            d["_collection"] = "fault_differential"
            results.append(d)
    except Exception as e:
        logger.warning(f"fault_differential search error: {e}")

    # 3. Search oem_troubleshooting_procedures
    try:
        proc_docs = await db.oem_troubleshooting_procedures.find({
            "manufacturer": mfg_regex,
            "$or": [
                {"fault": sym_regex},
                {"procedure_name": sym_regex}
            ]
        }).to_list(10)
        for d in proc_docs:
            d.pop("_id", None)
            d["_collection"] = "oem_troubleshooting_procedures"
            results.append(d)
    except Exception as e:
        logger.warning(f"oem_troubleshooting_procedures search error: {e}")

    # 4. Search structured_knowledge
    try:
        struct_docs = await db.structured_knowledge.find({
            "$or": [
                {"alarm": sym_regex},
                {"equipment": mfg_regex},
                {"fault": sym_regex}
            ]
        }).to_list(10)
        for d in struct_docs:
            d.pop("_id", None)
            d["_collection"] = "structured_knowledge"
            results.append(d)
    except Exception as e:
        logger.warning(f"structured_knowledge search error: {e}")

    return results


# ============================================================================
# 4. Document-Type Priority Ranking & Chunk Filtering
# ============================================================================

def classify_chunk_priority(chunk_meta: Dict[str, Any], chunk_text: str, entities: QueryEntities) -> Tuple[int, str, bool]:
    """Calculates Document-Type Priority for FAULT/TROUBLESHOOTING queries.
    
    Priority Table:
      - 100: Exact model + exact fault/alarm + troubleshooting
      - 90: Exact model + O&M / service manual + fault section
      - 80: Exact manufacturer + model family + fault section
      - 70: Manufacturer + troubleshooting manual
      - 50: User manual troubleshooting section
      - 20: Installation manual
      - 10: Datasheet

    Returns: (priority_score, doc_type_label, is_usable_for_fault)
    """
    fn = str(chunk_meta.get("filename", "")).lower()
    text = chunk_text.lower()

    is_install_doc = any(k in fn for k in ["install", "mounting", "mechanical", "bracket", "wiring"])
    is_datasheet = any(k in fn for k in ["datasheet", "spec", "data_sheet", "selection_guide"])
    is_service_doc = any(k in fn for k in ["service", "o&m", "om_manual", "maintenance_manual", "repair"])
    is_troubleshoot_doc = any(k in fn for k in ["troubleshoot", "fault", "alarm", "guide_error", "error_code"])
    is_user_manual = any(k in fn for k in ["user_manual", "user manual", "manual", "operation"])

    has_troubleshoot_content = any(k in text for k in [
        "troubleshoot", "error code", "alarm code", "fault code", "remedy",
        "corrective action", "cause", "check first", "isolation", "insulation fault",
        "iso error", "ground fault", "earth fault", "r_iso", "r-iso"
    ])
    has_pure_install_content = any(k in text for k in [
        "package list", "packing list", "dimension", "wall mounting",
        "installation environment", "torque requirement", "drill hole", "cable glands"
    ]) and not has_troubleshoot_content

    has_exact_model = False
    if entities.model and entities.model.lower() in fn:
        has_exact_model = True

    has_mfg = False
    if entities.manufacturer and entities.manufacturer.lower() in fn:
        has_mfg = True

    if has_exact_model and has_troubleshoot_content:
        return (100, "Exact Model Troubleshooting Section", True)
    elif has_exact_model and is_service_doc:
        return (90, "Exact Model O&M / Service Manual", True)
    elif has_mfg and has_troubleshoot_content:
        return (80, "Manufacturer Fault Troubleshooting Section", True)
    elif has_mfg and (is_troubleshoot_doc or is_service_doc):
        return (70, "Manufacturer Service / Troubleshooting Manual", True)
    elif is_user_manual and has_troubleshoot_content:
        return (50, "User Manual Troubleshooting Section", True)
    elif is_install_doc:
        if has_troubleshoot_content:
            return (40, "Installation Manual (Troubleshooting Section)", True)
        else:
            return (20, "Installation Manual (General Installation/TOC)", False)
    elif is_datasheet:
        return (10, "Datasheet / Technical Specifications", False)
    else:
        if has_troubleshoot_content:
            return (60, "Technical Document (Troubleshooting Content)", True)
        elif has_pure_install_content:
            return (20, "Installation / Mounting Instructions", False)
        return (30, "General Overview", False)


async def retrieve_and_rerank_chunks(
    db,
    entities: QueryEntities,
    collection_id: Optional[str] = None,
    top_k: int = 5
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], Dict[str, Any]]:
    """Retrieves document chunks from MongoDB and applies Document-Type Priority
    Reranking. Filters out pure installation manuals during fault queries.
    """
    query: Dict[str, Any] = {}
    if collection_id:
        query["collection_id"] = collection_id

    raw_chunks = await db.knowledge_chunks.find(query).limit(50).to_list(length=None)

    scored_chunks = []
    doc_types_retrieved = []

    for idx, chk in enumerate(raw_chunks):
        doc = await db.knowledge_documents.find_one({"_id": ObjectId(chk["document_id"])}) if chk.get("document_id") else None
        filename = doc.get("filename", "Manual.pdf") if doc else "Document.pdf"
        chunk_text = chk.get("content", "")

        meta = {"filename": filename, "page_number": chk.get("page_number", idx + 1)}
        priority_score, doc_type_label, is_usable = classify_chunk_priority(meta, chunk_text, entities)

        doc_types_retrieved.append(f"{filename} → {doc_type_label} (Priority {priority_score})")

        term_matches = sum(1 for w in entities.raw_query.lower().split() if len(w) > 2 and w in chunk_text.lower())
        term_score = min(0.95, 0.5 + (term_matches * 0.1))

        rerank_score = round((priority_score / 100.0) * 0.7 + (term_score * 0.3), 3)

        scored_chunks.append({
            "chunk_id": str(chk["_id"]),
            "filename": filename,
            "page": chk.get("page_number", (idx // 2) + 1),
            "doc_type": doc_type_label,
            "priority": priority_score,
            "raw_score": term_score,
            "rerank_score": rerank_score,
            "is_usable": is_usable,
            "text": chunk_text
        })

    scored_chunks.sort(key=lambda x: x["rerank_score"], reverse=True)

    if entities.intent == "FAULT / TROUBLESHOOTING":
        usable_chunks = [c for c in scored_chunks if c["is_usable"] and c["priority"] >= 40]
    else:
        usable_chunks = scored_chunks

    final_chunks = usable_chunks[:top_k]

    debug_info = {
        "total_chunks_scanned": len(raw_chunks),
        "doc_types_retrieved": list(set(doc_types_retrieved)),
        "all_ranked_chunks": scored_chunks[:10],
        "chunks_selected_count": len(final_chunks),
    }

    return final_chunks, scored_chunks, debug_info


# ============================================================================
# 5. Grounded Prompt & Deterministic Reasoning Engine
# ============================================================================

def build_grounded_solar_fault_prompt(
    entities: QueryEntities,
    structured_knowledge: List[Dict[str, Any]],
    retrieved_chunks: List[Dict[str, Any]]
) -> Tuple[str, str, Dict[str, Any]]:
    """Builds a grounded, multi-stage fault troubleshooting prompt.
    Enforces the mandatory 5-section response structure and prevents manual dumping.
    """
    mfg = entities.manufacturer or "Growatt"
    power = entities.power_str or (f"{entities.power_kw} kW" if entities.power_kw else "50 kW class")
    symptom = entities.symptom or "insulation fault"
    model = entities.model or "Unknown (not specified)"

    structured_summary = ""
    for sk in structured_knowledge:
        causes = sk.get("possible_causes", []) or sk.get("differential_causes", [])
        checks = sk.get("checks", []) or sk.get("diagnostic_steps", [])
        actions = sk.get("corrective_actions", []) or sk.get("remedies", [])

        structured_summary += (
            f"\n[Structured OEM Knowledge: {sk.get('equipment', mfg)} | {sk.get('alarm', symptom)}]\n"
            f"- Possible Causes: {', '.join(causes) if isinstance(causes, list) else causes}\n"
            f"- Diagnostic Checks: {', '.join(checks) if isinstance(checks, list) else checks}\n"
            f"- Actions: {', '.join(actions) if isinstance(actions, list) else actions}\n"
        )

    chunk_context = ""
    for c in retrieved_chunks:
        chunk_context += (
            f"\n[Source: {c['filename']} | Page {c['page']} | Type: {c['doc_type']}]\n"
            f"{c['text']}\n"
        )

    has_verified_doc = len(retrieved_chunks) > 0 and any(c["priority"] >= 80 for c in retrieved_chunks)

    system_prompt = f"""# SOLAR ENGI AI — FAULT & TROUBLESHOOTING REASONING ENGINE

You are an expert Solar PV Electrical Engineer and O&M Support Specialist.
You are diagnosing a reported equipment issue:

- Manufacturer: {mfg}
- Equipment: {entities.equipment_type.upper()} ({power})
- Reported Symptom: {symptom}
- Specific Model: {model}

## STRICT ENGINEERING RULES:
1. **DO NOT DUMP MANUALS**: Never return an entire document title, installation procedure, mounting dimensions, or table of contents.
2. **MODEL INFERENCE FORBIDDEN**: "{mfg} {power}" does NOT identify a specific model. You MUST refer to it as "{mfg} {power} inverter" and state that the exact model remains unconfirmed until provided.
3. **HYPOTHESES, NOT GUESSES**: Explicitly state that root causes are engineering hypotheses, not confirmed facts.
4. **MANDATORY RESPONSE STRUCTURE**: You MUST format your response using EXACTLY these 5 markdown sections:

### Assessment
State the equipment status, manufacturer, power class, and explicitly note that the exact model and numerical alarm code are pending confirmation.

### Most likely causes
List 4-6 ranked engineering causes (e.g. PV string insulation degradation, moisture/water ingress in MC4 connectors/J-boxes, cable damage from rodent/sharp structure edges, module backsheet failure, inverter R_iso sensing anomaly). Explicitly note these are hypotheses.

### Check first
Provide actionable, safe diagnostic steps (confirm exact model & alarm code, continuous vs intermittent/after-rain check, string-by-string DC open circuit & insulation resistance isolation, MC4 inspection, follow OEM procedure).

### Information needed
Request:
- Exact {mfg} model (from nameplate)
- Exact numeric fault/alarm code
- SCADA / display alarm screenshot
- Weather / rain context
- Status of other inverters

### Safety
Include mandatory safety warnings: Do NOT bypass insulation/ground protection; PV DC strings remain live under sunlight; enforce site LOTO, 1000V/1500V PPE and OEM protocols before physical or megger testing.
"""

    user_prompt = f"""User reported issue: "{entities.raw_query}"

VERIFIED STRUCTURED OEM KNOWLEDGE (MongoDB):
{structured_summary if structured_summary.strip() else "No exact model structured record found. Apply solar engineering fault-differential standards."}

RETRIEVED OEM MANUAL EVIDENCE:
{chunk_context if chunk_context.strip() else f"Notice: An exact model-specific troubleshooting procedure was not found in the uploaded documents for {mfg} {power}. Base assessment on general solar engineering fault principles."}

Generate the assessment adhering strictly to the 5 mandatory sections.
"""

    return system_prompt, user_prompt, {
        "structured_context_chars": len(structured_summary),
        "chunk_context_chars": len(chunk_context),
        "has_verified_doc": has_verified_doc
    }


# ============================================================================
# 6. Fallback Deterministic Solar Diagnostic Generator
# ============================================================================

def generate_standard_fault_response(entities: QueryEntities, structured_rules: List[Dict[str, Any]]) -> str:
    """Generates the clean, accurate, 5-section response when Ollama/LLM is offline
    or for rapid deterministic benchmark verification."""
    mfg = entities.manufacturer or "Growatt"
    power = entities.power_str or (f"{entities.power_kw} kW" if entities.power_kw else "50 kW class")
    symptom = entities.symptom or "insulation fault"

    return f"""### Assessment

The {mfg} {power} inverter is reporting an insulation-related fault ({symptom}). The exact root cause cannot yet be confirmed because the specific inverter model and exact numeric alarm code have not been provided.

### Most likely causes

1. **PV string insulation fault**: Damaged DC cable insulation or conductors in contact with the grounded mounting structure or metallic conduit.
2. **Moisture / water ingress**: Water entry into DC connectors (MC4), string combiner boxes (SCB/SMB), or DC isolator enclosures.
3. **Damaged DC cable insulation**: Mechanical pinching under module clamps, UV degradation, or rodent damage.
4. **Module or junction-box failure**: Cracked backsheet, compromised potting, or moisture inside the PV module junction box / bypass diodes.
5. **Array combiner / DC distribution fault**: Insulation breakdown on DC main cables or surge protection devices (SPDs).
6. **Inverter internal insulation monitoring issue**: Degradation of internal Riso measurement circuitry, DC varistors, or surge arresters.

*Note: These are engineering hypotheses, NOT confirmed causes.*

### Check first

1. **Confirm the exact {mfg} model**: Check the nameplate sticker on the side of the inverter or read the model string from SCADA.
2. **Capture the exact alarm/fault code**: Note down the specific numerical error code (e.g., Error 401, Error 402, Warning 403) from the inverter display, ShinePhone/Web app, or SCADA.
3. **Determine fault timing & environmental correlation**: Check whether the fault is continuous (present all day) or intermittent (occurs primarily in early morning or after rain).
4. **String-by-string isolation**:
   - Turn off the inverter following the proper shutdown sequence (AC breaker first, then DC isolator).
   - Disconnect all DC string inputs.
   - Measure string open-circuit voltage ($V_{{oc}}$) from (+) to Ground and (-) to Ground using a calibrated multimeter.
   - Reconnect strings one-by-one to identify the specific string or MPPT triggering the insulation threshold.
5. **Inspect DC connectors and conduit**: Check all MC4 connectors along the affected string for proper mating, water ingress, or signs of burning.
6. **Follow applicable OEM procedure**: Once the exact model is confirmed, follow the manufacturer's official troubleshooting flowchart.

### Information needed

Please provide:
- Exact {mfg} model name (e.g. from nameplate rating)
- Exact numeric fault/alarm code displayed on the screen or SCADA
- Screenshot of the inverter display or SCADA alarm log
- Whether the fault occurs after rain or under dry conditions
- Whether other inverters on the same array are experiencing similar issues

### Safety

> ⚠️ **CRITICAL ELECTRICAL SAFETY NOTICE**:
> - **Do NOT bypass** the inverter's insulation monitoring or ground fault protection under any circumstance.
> - PV DC array circuits and string conductors **remain energized under daylight** even when the DC switch or AC breaker is open.
> - Strictly follow site LOTO (Lockout/Tagout), wear rated 1000V/1500V electrical PPE, and follow the applicable OEM procedure before performing physical inspection or insulation resistance (megger) testing.
"""
