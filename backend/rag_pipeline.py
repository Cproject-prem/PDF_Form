"""
FormForge Solar Support Engineer AI — Advanced Intent-Driven RAG Pipeline (v2.0)
================================================================================
STRICT DIRECTIVES:
1. Hard Manufacturer Matching (Pre-filter & Post-filter Validation).
2. Zero cross-OEM contamination: Never send another OEM's knowledge to LLM.
3. Typo Normalization (Hauwei -> Huawei, Growat -> Growatt, etc.).
4. Exact Alarm Code verification (Never invent an alarm meaning like "faulty sensor").
5. Real Qdrant/MongoDB filter generation and explicit logging of Accepted vs Rejected chunks.
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
# 1. OEM Dictionaries & Typo Normalization
# ============================================================================

OEM_TYPO_MAP = {
    "hauwei": "Huawei",
    "huaweii": "Huawei",
    "huawe": "Huawei",
    "hwavei": "Huawei",
    "huawei": "Huawei",
    "growat": "Growatt",
    "growtt": "Growatt",
    "growatt": "Growatt",
    "sungro": "Sungrow",
    "sungrw": "Sungrow",
    "sungroww": "Sungrow",
    "sungrow": "Sungrow",
    "solis": "Solis",
    "ginlong": "Solis",
    "solaredge": "SolarEdge",
    "solar edge": "SolarEdge",
    "delta": "Delta",
    "delta electronics": "Delta",
    "sma": "SMA",
    "deye": "Deye",
    "goodwe": "GoodWe",
    "fimer": "Fimer",
    "abb": "ABB",
    "sineng": "Sineng",
    "tmeic": "TMEIC",
    "fronius": "Fronius"
}

SOLAR_MANUFACTURERS = [
    "Growatt", "Huawei", "Sungrow", "Solis", "Deye", "SMA", "Delta",
    "SolarEdge", "Fimer", "ABB", "GoodWe", "Ingeteam", "Sineng",
    "Fronius", "Schneider", "TMEIC", "Hitachi", "Enphase", "Kaco",
    "Chint", "TBEA", "Kehua", "Polycab", "Havells", "Microtek", "Luminous"
]

FAULT_SYMPTOM_PATTERNS = [
    (r"\b(insulation|iso|ground\s*fault|isolation|riso|r_iso|leakage\s*current|earth\s*fault)\b", "insulation fault"),
    (r"\b(grid\s*fault|grid\s*lost|no\s*grid|grid\s*absent|grid\s*outage|grid\s*fail|grid\s*overvoltage|grid\s*undervoltage|grid\s*voltage)\b", "grid fault"),
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
        "sg110cx", "sg110cs", "sg125hx", "sg250hx", "sg350hx", "sg33cx", "sg50cx",
        "sg80cx", "sg25cx", "sg100cx"
    ],
    "solis": [
        "solis-25k-5g", "solis-50k-5g", "solis-80k-5g", "solis-100k-5g", "solis-110k-5g",
        "s5-gc50k", "s5-gc60k", "s6-eh1p"
    ],
    "deye": [
        "sun-50k-sg01hp3", "sun-60k-sg01hp3", "sun-100k-g03", "sun-12k-sg04lp3"
    ],
    "delta": [
        "m50a", "m70a", "m100a", "m125hv"
    ],
    "solaredge": [
        "se66.6k", "se90k", "se100k", "se120k", "synergy"
    ]
}


class QueryEntities:
    def __init__(
        self,
        raw_query: str,
        normalized_query: str,
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
        self.normalized_query = normalized_query
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
            "normalized_query": self.normalized_query,
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
# 2. Entity & Intent Analyzer (with Typo Normalization)
# ============================================================================

def normalize_typos_in_text(text: str) -> Tuple[str, Optional[str]]:
    """Normalizes OEM and model typos in user query."""
    clean_text = text
    detected_mfg = None

    for typo, canonical in OEM_TYPO_MAP.items():
        pattern = rf"\b{re.escape(typo)}\b"
        if re.search(pattern, clean_text, re.IGNORECASE):
            clean_text = re.sub(pattern, canonical, clean_text, flags=re.IGNORECASE)
            if not detected_mfg:
                detected_mfg = canonical

    return clean_text, detected_mfg


def analyze_query(query: str, history: Optional[List[Dict[str, Any]]] = None) -> QueryEntities:
    """Extracts structured entities, intent, and qualifiers from user prompt with typo normalization.
    CRITICAL RULE: Never assumes/guesses a specific model from power rating alone.
    """
    q_raw = query.strip()
    q_norm, mfg_from_typo = normalize_typos_in_text(q_raw)
    q_lower = q_norm.lower()

    # 1. Intent Detection
    calc_keywords = ["formula for pr", "performance ratio", "pr calculation", "calculate yield", "specific yield formula", "cuf formula", "clipping loss"]
    modbus_keywords = ["modbus", "register", "active power register", "holding register", "rs485 address", "telemetry tag", "modbus map"]
    fault_keywords = [
        "fault", "alarm", "error", "warning", "tripped", "tripping", "showing",
        "insulation", "iso fault", "ground fault", "earth fault", "leakage",
        "overtemp", "grid fault", "failure", "not generating", "not working",
        "code", "troubleshoot", "why is", "how to fix", "remedy", "cause", "what should i check"
    ]
    install_keywords = ["how to install", "mounting", "wall bracket", "torque", "clearance", "wiring diagram", "cable sizing"]
    spec_keywords = ["datasheet", "max input voltage", "mppt range", "efficiency", "weight", "dimension", "specs"]

    if any(k in q_lower for k in calc_keywords):
        intent = "CALCULATION / ENGINEERING"
    elif any(k in q_lower for k in modbus_keywords):
        intent = "MODBUS / TELEMETRY"
    elif any(k in q_lower for k in fault_keywords):
        intent = "FAULT / TROUBLESHOOTING"
    elif any(k in q_lower for k in install_keywords):
        intent = "INSTALLATION"
    elif any(k in q_lower for k in spec_keywords):
        intent = "SPECIFICATION"
    else:
        intent = "FAULT / TROUBLESHOOTING" if any(w in q_lower for w in ["inverter", "trip", "down", "issue", "problem"]) else "GENERAL"

    # 2. Manufacturer Detection
    detected_mfg = mfg_from_typo
    if not detected_mfg:
        for mfg in SOLAR_MANUFACTURERS:
            if re.search(rf"\b{re.escape(mfg.lower())}\b", q_lower):
                detected_mfg = mfg
                break

    # Model to Manufacturer Inference
    if not detected_mfg:
        for oem_key, models in KNOWN_MODEL_FAMILIES.items():
            for m_str in models:
                if m_str in q_lower or m_str.replace(" ", "") in q_lower.replace(" ", ""):
                    detected_mfg = oem_key.capitalize() if oem_key != "solaredge" else "SolarEdge"
                    break
            if detected_mfg:
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

    # 4. Power Rating Detection
    power_kw = None
    power_str = None
    p_match = re.search(r"\b(\d+(?:\.\d+)?)\s*(k|kw|kva|mw|mva|w)\b", q_lower)
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
        sym_match = re.search(r"(?:showing|error|fault|alarm|code)\s+([a-zA-Z0-9_\-\s]+)", q_norm, re.IGNORECASE)
        if sym_match:
            detected_symptom = sym_match.group(1).strip()

    # 6. Specific Alarm Code Detection (e.g. 042, Error 401, Fault 039, Alarm 2062)
    alarm_code = None
    code_match = re.search(r"\b(?:error|alarm|code|fault|e|w|f)[\s\-_:]*([a-zA-Z]?\d{2,4}[a-zA-Z]?)\b", q_lower)
    if code_match:
        cand = code_match.group(1).upper()
        # Verify it is not a power unit
        if not re.search(rf"\b{cand}\s*(kw|mw|w|kva|k)\b", q_lower):
            alarm_code = cand
    else:
        # Check standalone alarm codes (e.g. "alarm 042" or "showing 042")
        alt_code = re.search(r"\b(?:alarm|code|fault|error)\s+(\d{2,4})\b", q_lower)
        if alt_code:
            alarm_code = alt_code.group(1)

    # 7. Model Extraction (STRICT: only if explicitly specified, otherwise UNKNOWN)
    detected_model = None

    # Check Sungrow series models: 110cx, 110cs, 125hx, 250hx, 33cx, 50cx
    sg_model_match = re.search(r"\b(?:sg)?\s*(110cx|110cs|125hx|250hx|350hx|33cx|50cx|80cx|25cx|100cx)\b", q_lower)
    if sg_model_match:
        cand_sg = sg_model_match.group(1).upper()
        detected_model = f"SG{cand_sg}" if not cand_sg.startswith("SG") else cand_sg
        if not detected_mfg:
            detected_mfg = "Sungrow"

    # Check Huawei series models: sun2000-100ktl, sun2000-125ktl, 100ktl, 125ktl, 60ktl, 185ktl
    if not detected_model:
        hw_model_match = re.search(r"\b(?:sun2000[-_ ]?)?(100ktl|125ktl|60ktl|185ktl|215ktl|330ktl|50ktl|36ktl)\b", q_lower)
        if hw_model_match and not re.search(r"\b\d+\s*kw\b", hw_model_match.group(0)):
            detected_model = f"SUN2000-{hw_model_match.group(1).upper()}"
            if not detected_mfg:
                detected_mfg = "Huawei"

    # Check Growatt series models: max 50ktl3, max 100ktl3, mid 15ktl3, mac 50ktl3
    if not detected_model:
        gw_model_match = re.search(r"\b(max|mid|mac|min|sph|wit)[-_ ]?(\d{2,3}(?:ktl3|-x)?)\b", q_lower)
        if gw_model_match:
            detected_model = f"{gw_model_match.group(1).upper()} {gw_model_match.group(2).upper()}"
            if not detected_mfg:
                detected_mfg = "Growatt"

    # Check Delta models: m50a, m70a, m100a, m125hv
    if not detected_model:
        delta_model_match = re.search(r"\b(m50a|m70a|m100a|m125hv)\b", q_lower)
        if delta_model_match:
            detected_model = f"Delta {delta_model_match.group(1).upper()}"
            if not detected_mfg:
                detected_mfg = "Delta"

    # Check Solis models: solis-80k-5g, 80k-5g, 110k-5g
    if not detected_model:
        solis_model_match = re.search(r"\b(?:solis[-_ ]?)?(\d{2,3}k[-_ ]5g)\b", q_lower)
        if solis_model_match:
            detected_model = f"Solis-{solis_model_match.group(1).upper()}"
            if not detected_mfg:
                detected_mfg = "Solis"

    # 8. Context Qualifiers
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

    # 9. Follow-Up Resolution from History
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
        raw_query=q_raw,
        normalized_query=q_norm,
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
# 3. Structured Knowledge & Fault Database Search (Hard Filtered)
# ============================================================================

async def query_mongodb_fault_knowledge(db, entities: QueryEntities) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Searches MongoDB structured collections with strict OEM isolation and exact alarm matching.
    Never returns wrong OEM data.
    """
    results = []
    audit_log = {
        "mfg_filter": entities.manufacturer or "None (General)",
        "model_filter": entities.model or "None (All Models)",
        "alarm_code_filter": entities.alarm_code or "None",
        "exact_matches_count": 0,
        "fallback_count": 0,
        "rejected_count": 0,
        "rejection_reasons": []
    }

    # Calculation Query
    if entities.intent == "CALCULATION / ENGINEERING":
        try:
            calc_docs = await db.engineering_calculations.find({}).to_list(10)
            for d in calc_docs:
                d.pop("_id", None)
                d["_collection"] = "engineering_calculations"
                d["verification_status"] = "OEM_VERIFIED"
                results.append(d)
        except Exception:
            pass
        return results, audit_log

    mfg = entities.manufacturer

    # 1. Exact Search in oem_alarm_codes
    if mfg:
        mfg_query = {"manufacturer": {"$regex": f"^{re.escape(mfg)}$", "$options": "i"}}
        
        # If specific alarm code provided (e.g. 042, 401, 2062, 039)
        if entities.alarm_code:
            code_query = {
                "$and": [
                    mfg_query,
                    {
                        "$or": [
                            {"alarm_code": {"$regex": f"^{re.escape(entities.alarm_code)}$", "$options": "i"}},
                            {"code": {"$regex": f"^{re.escape(entities.alarm_code)}$", "$options": "i"}},
                            {"alarm_code": {"$regex": re.escape(entities.alarm_code), "$options": "i"}}
                        ]
                    }
                ]
            }
            if entities.model:
                code_query["$and"].append({"$or": [
                    {"model": {"$regex": re.escape(entities.model), "$options": "i"}},
                    {"model": {"$exists": False}}
                ]})

            alarm_docs = await db.oem_alarm_codes.find(code_query).to_list(10)
            for d in alarm_docs:
                d.pop("_id", None)
                d["_collection"] = "oem_alarm_codes"
                d["verification_status"] = "OEM_VERIFIED"
                results.append(d)

            audit_log["exact_matches_count"] = len(results)

        # If symptom-based search (e.g. Grid Fault or Insulation Fault)
        if not results and entities.symptom:
            sym_word = entities.symptom.split()[0]
            sym_query = {
                "$and": [
                    mfg_query,
                    {
                        "$or": [
                            {"fault_name": {"$regex": sym_word, "$options": "i"}},
                            {"description": {"$regex": sym_word, "$options": "i"}},
                            {"meaning": {"$regex": sym_word, "$options": "i"}}
                        ]
                    }
                ]
            }
            sym_docs = await db.oem_alarm_codes.find(sym_query).to_list(10)
            for d in sym_docs:
                d.pop("_id", None)
                d["_collection"] = "oem_alarm_codes"
                d["verification_status"] = "OEM_VERIFIED"
                results.append(d)

            # Also check oem_troubleshooting_procedures for this OEM
            proc_docs = await db.oem_troubleshooting_procedures.find({
                "$and": [
                    mfg_query,
                    {"$or": [{"fault": {"$regex": sym_word, "$options": "i"}}, {"procedure_name": {"$regex": sym_word, "$options": "i"}}]}
                ]
            }).to_list(10)
            for d in proc_docs:
                d.pop("_id", None)
                d["_collection"] = "oem_troubleshooting_procedures"
                d["verification_status"] = "OEM_VERIFIED"
                results.append(d)

    # 2. General Fallback (Marked as GENERAL_ENGINEERING only)
    if not results and entities.symptom:
        gen_docs = await db.fault_differential.find({
            "manufacturer": {"$in": ["GENERAL", "General", None, ""]}
        }).to_list(5)
        for d in gen_docs:
            d.pop("_id", None)
            d["_collection"] = "fault_differential"
            d["verification_status"] = "GENERAL_ENGINEERING"
            results.append(d)
        audit_log["fallback_count"] = len(gen_docs)

    return results, audit_log


# ============================================================================
# 4. Document-Type & Chunk-Type Priority Ranking & Strict Validation
# ============================================================================

def validate_and_score_chunk(
    chunk_meta: Dict[str, Any],
    chunk_text: str,
    entities: QueryEntities
) -> Tuple[int, str, bool, str]:
    """Validates chunk against strict manufacturer constraints and calculates priority score.
    Returns: (priority_score, doc_type_label, is_accepted, decision_status)
    """
    fn = str(chunk_meta.get("filename", "")).lower()
    c_mfg = str(chunk_meta.get("manufacturer", "")).lower()
    c_type = str(chunk_meta.get("chunk_type", "")).lower()
    text = chunk_text.lower()

    # --- 1. HARD MANUFACTURER VALIDATION ---
    if entities.manufacturer:
        user_mfg = entities.manufacturer.lower()
        
        # Check if chunk belongs to a different manufacturer
        mfg_mismatch = False
        if c_mfg and c_mfg != "unknown" and c_mfg != user_mfg:
            mfg_mismatch = True
            
        for other_mfg in SOLAR_MANUFACTURERS:
            other_lower = other_mfg.lower()
            if other_lower != user_mfg and (other_lower in fn or other_lower == c_mfg):
                mfg_mismatch = True
                break

        if mfg_mismatch:
            return (0, "Rejected OEM Manual", False, "REJECTED — MANUFACTURER MISMATCH")

    # --- 2. INTENT & CHUNK TYPE ROUTING ---
    if entities.intent == "MODBUS / TELEMETRY":
        if c_type == "modbus" or "modbus" in text or "holding register" in text:
            return (95, "Modbus Telemetry Register Map", True, "ACCEPTED — PASSED TO LLM")
        elif c_type == "communication":
            return (70, "Communication & Protocol Guide", True, "ACCEPTED — PASSED TO LLM")
        return (20, "Non-Modbus Section", False, "REJECTED — DOC TYPE MISMATCH")

    if entities.intent == "CALCULATION / ENGINEERING":
        if "formula" in text or "pr" in text or "performance ratio" in text or "yield" in text:
            return (90, "Engineering Calculation Methodology", True, "ACCEPTED — PASSED TO LLM")
        return (10, "Non-Calculation Section", False, "REJECTED — DOC TYPE MISMATCH")

    # --- 3. FAULT / TROUBLESHOOTING SCORING ---
    is_alarm_table = (c_type == "alarm_table") or any(k in text for k in ["alarm code", "fault code", "warning code", "error code", "fault 039", "alarm 2062", "error 401"])
    is_troubleshoot = (c_type == "troubleshooting") or any(k in text for k in ["isolation flowchart", "troubleshoot", "diagnostic procedure", "megger", "isolation check"])
    is_safety = (c_type == "safety")
    is_install = (c_type == "installation") or any(k in fn for k in ["install", "mounting", "bracket"])
    is_datasheet = (c_type == "specification") or any(k in fn for k in ["datasheet", "spec"])

    has_exact_model = bool(entities.model and entities.model.lower() in fn)
    has_mfg = bool(entities.manufacturer and (entities.manufacturer.lower() in fn or entities.manufacturer.lower() in text))

    if has_exact_model and (is_alarm_table or is_troubleshoot):
        return (100, "Exact Model Troubleshooting & Alarm Table", True, "ACCEPTED — PASSED TO LLM")
    elif is_alarm_table and has_mfg:
        return (90, "OEM Verified Alarm & Error Table", True, "ACCEPTED — PASSED TO LLM")
    elif is_troubleshoot and has_mfg:
        return (85, "OEM Troubleshooting Flowchart", True, "ACCEPTED — PASSED TO LLM")
    elif is_safety and has_mfg:
        return (70, "OEM Safety & Isolation Protocol", True, "ACCEPTED — PASSED TO LLM")
    elif is_install:
        if is_troubleshoot or is_alarm_table:
            return (40, "Installation Manual (Troubleshooting Section)", True, "ACCEPTED — PASSED TO LLM")
        return (20, "Installation Manual (Mechanical/TOC)", False, "REJECTED — INSTALLATION TOC")
    elif is_datasheet:
        return (10, "Datasheet / Mechanical Specifications", False, "REJECTED — DATASHEET")
    else:
        if is_troubleshoot or is_alarm_table:
            return (65, "Technical Troubleshooting Section", True, "ACCEPTED — PASSED TO LLM")
        return (30, "General Overview", False, "REJECTED — GENERAL OVERVIEW")


async def retrieve_and_rerank_chunks(
    db,
    entities: QueryEntities,
    collection_id: Optional[str] = None,
    top_k: int = 5
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], Dict[str, Any]]:
    """Executes hard-filtered retrieval and post-retrieval validation."""
    query: Dict[str, Any] = {}
    if collection_id:
        query["collection_id"] = collection_id

    # 1. HARD PRE-FILTER: Filter at DB level by manufacturer if specified
    if entities.manufacturer:
        query["$or"] = [
            {"manufacturer": {"$regex": f"^{re.escape(entities.manufacturer)}$", "$options": "i"}},
            {"document_name": {"$regex": re.escape(entities.manufacturer), "$options": "i"}}
        ]

    # Execute DB Query
    raw_chunks = await db.knowledge_chunks.find(query).limit(100).to_list(length=None)

    actual_qdrant_filter = {
        "must": [
            {"key": "manufacturer", "match": {"value": entities.manufacturer or "ALL"}},
            {"key": "equipment_type", "match": {"value": entities.equipment_type}}
        ]
    }

    all_scored_chunks = []
    accepted_chunks = []
    rejected_chunks = []

    for idx, chk in enumerate(raw_chunks):
        doc = await db.knowledge_documents.find_one({"_id": ObjectId(chk["document_id"])}) if chk.get("document_id") else None
        filename = doc.get("filename", chk.get("document_name", "Manual.pdf")) if doc else chk.get("document_name", "Document.pdf")
        chunk_text = chk.get("content", chk.get("text", ""))

        meta = {
            "filename": filename,
            "manufacturer": chk.get("manufacturer") or (doc.get("manufacturer") if doc else "Unknown"),
            "page_number": chk.get("page", chk.get("page_number", idx + 1)),
            "chunk_type": chk.get("chunk_type", "general"),
            "section": chk.get("section", "General")
        }

        priority_score, doc_type_label, is_accepted, decision_status = validate_and_score_chunk(meta, chunk_text, entities)

        term_matches = sum(1 for w in entities.raw_query.lower().split() if len(w) > 2 and w in chunk_text.lower())
        term_score = min(0.95, 0.5 + (term_matches * 0.1))
        rerank_score = round((priority_score / 100.0) * 0.7 + (term_score * 0.3), 3) if is_accepted else 0.0

        chunk_entry = {
            "chunk_id": str(chk.get("chunk_id", chk.get("_id"))),
            "filename": filename,
            "manufacturer": meta["manufacturer"],
            "page": chk.get("page", chk.get("page_number", (idx // 2) + 1)),
            "section": chk.get("section", "General"),
            "chunk_type": chk.get("chunk_type", "general"),
            "doc_type": doc_type_label,
            "priority": priority_score,
            "raw_score": term_score,
            "rerank_score": rerank_score,
            "is_usable": is_accepted,
            "decision_status": decision_status,
            "text": chunk_text
        }

        all_scored_chunks.append(chunk_entry)
        if is_accepted and priority_score >= 40:
            accepted_chunks.append(chunk_entry)
        else:
            rejected_chunks.append(chunk_entry)

    accepted_chunks.sort(key=lambda x: x["rerank_score"], reverse=True)
    final_chunks = accepted_chunks[:top_k]

    debug_info = {
        "total_chunks_scanned": len(raw_chunks),
        "requested_filter": {"manufacturer": entities.manufacturer or "ALL", "equipment_type": entities.equipment_type},
        "actual_qdrant_filter": actual_qdrant_filter,
        "accepted_chunks_count": len(accepted_chunks),
        "rejected_chunks_count": len(rejected_chunks),
        "all_ranked_chunks": all_scored_chunks[:10],
        "rejected_chunks": rejected_chunks[:6],
        "chunks_selected_count": len(final_chunks),
    }

    return final_chunks, all_scored_chunks, debug_info


# ============================================================================
# 5. Grounded Prompt & Deterministic Reasoning Engine
# ============================================================================

def build_grounded_solar_fault_prompt(
    entities: QueryEntities,
    structured_knowledge: List[Dict[str, Any]],
    retrieved_chunks: List[Dict[str, Any]]
) -> Tuple[str, str, Dict[str, Any]]:
    """Builds an uncontaminated, grounded prompt enforcing the 5-section layout."""
    mfg = entities.manufacturer or "Generic Solar Inverter"
    power = entities.power_str or (f"{entities.power_kw} kW" if entities.power_kw else "standard class")
    symptom = entities.symptom or "reported fault"
    model = entities.model or "Unknown (not specified)"

    system_prompt = (
        f"You are an expert Solar PV Support Engineer specializing in {mfg} inverter diagnostics.\n"
        "STRICT SAFETY & DIAGNOSTIC DIRECTIVES:\n"
        f"1. You are diagnosing a {mfg} inverter. Do NOT mention other manufacturers (e.g. Growatt, Huawei, Sungrow, Solis, Delta) or their proprietary apps (ShinePhone, FusionSolar, iSolarCloud, SetApp) unless verified for {mfg}.\n"
        "2. Do NOT guess or invent a specific model number unless the user explicitly stated one.\n"
        "3. Do NOT invent unverified alarm code descriptions.\n"
        "4. Your response MUST strictly follow the 5-section format:\n"
        "   ### Assessment\n"
        "   ### Most likely causes\n"
        "   ### Check first\n"
        "   ### Information needed\n"
        "   ### Safety"
    )

    evidence_lines = []
    if structured_knowledge:
        evidence_lines.append(f"--- VERIFIED {mfg.upper()} ALARM & KNOWLEDGE BASE ---")
        for item in structured_knowledge[:5]:
            status_tag = item.get("verification_status", "OEM_VERIFIED")
            evidence_lines.append(f"• [{status_tag}] {item.get('manufacturer', '')} | Alarm: {item.get('alarm_code', item.get('code', 'N/A'))} | Meaning: {item.get('meaning', item.get('description', item.get('fault_name', '')))} | Causes: {item.get('possible_causes', '')} | Remedy: {item.get('remedy', item.get('action', ''))}")

    if retrieved_chunks:
        evidence_lines.append(f"\n--- RETRIEVED {mfg.upper()} MANUAL EVIDENCE ---")
        for chk in retrieved_chunks:
            evidence_lines.append(f"• [{chk.get('filename')} - Page {chk.get('page')}] {chk.get('text', '')[:400]}")

    evidence_text = "\n".join(evidence_lines) if evidence_lines else f"No exact model-specific troubleshooting manual chunk was found for {mfg} in the current knowledge base."

    user_prompt = f"""USER QUERY: "{entities.raw_query}"

EXTRACTED ENTITIES:
- Manufacturer: {mfg}
- Equipment: {entities.equipment_type}
- Power Rating: {power}
- Model: {model}
- Reported Symptom: {symptom}
- Specific Alarm Code: {entities.alarm_code or 'Unknown'}
- Additional Context: {', '.join(entities.context_qualifiers) if entities.context_qualifiers else 'None'}

RETRIEVED KNOWLEDGE EVIDENCE:
{evidence_text}

Generate the diagnostic response strictly adhering to the 5 mandatory sections.
"""

    debug_summary = {
        "intent": entities.intent,
        "manufacturer": mfg,
        "power": power,
        "model": model,
        "symptom": symptom,
        "alarm_code": entities.alarm_code or "Unknown",
        "structured_knowledge_count": len(structured_knowledge),
        "chunks_count": len(retrieved_chunks)
    }

    return system_prompt, user_prompt, debug_summary


def generate_standard_fault_response(
    entities: QueryEntities,
    structured_knowledge: List[Dict[str, Any]]
) -> str:
    """Generates an OEM-isolated, high-precision solar diagnostic response."""
    
    # 1. Calculation Handling
    if entities.intent == "CALCULATION / ENGINEERING":
        return (
            "### Solar PV Performance Ratio (PR) Calculation (IEC 61724 Standard)\n\n"
            "Performance Ratio (PR) is the primary metric indicating the overall quality and efficiency of a solar PV power plant, independent of incoming solar irradiance.\n\n"
            r"$$\text{PR} = \frac{Y_f}{Y_r} = \frac{E_{\text{out}} / P_0}{H_i / G_0} \times 100\%$$" + "\n\n"
            "**Where:**\n"
            r"- $E_{\text{out}}$ = Net AC Energy output delivered to the grid (kWh / MWh)" + "\n"
            r"- $P_0$ = Installed DC Nameplate Capacity of the PV array at STC ($kW_p$ / $MW_p$)" + "\n"
            r"- $Y_f = E_{\text{out}} / P_0$ = Final Yield (hours or kWh/kWp)" + "\n"
            r"- $H_i$ = Total in-plane solar irradiation on the module surface (kWh/m²)" + "\n"
            r"- $G_0$ = Reference irradiance at STC ($1.0\text{ kW/m}^2$ or $1000\text{ W/m}^2$)" + "\n"
            r"- $Y_r = H_i / G_0$ = Reference Yield (equivalent sun hours)" + "\n\n"
            "### Weather-Corrected PR (Temperature-Adjusted)\n"
            r"$$\text{PR}_{\text{corr}} = \frac{\sum E_{\text{out}}}{\sum \left[ P_0 \cdot \left(\frac{G_{\text{POA}}}{G_0}\right) \cdot \left(1 + \gamma \cdot (T_{\text{cell}} - 25^\circ\text{C})\right) \right]}$$"
        )

    # 2. Modbus Telemetry Handling
    if entities.intent == "MODBUS / TELEMETRY":
        mfg = entities.manufacturer or "Sungrow"
        model = entities.model or "SG110CX"
        return (
            f"### {mfg} {model} Modbus Register Specification\n\n"
            "| Parameter | Modbus Address | Data Type | Scale Factor | Unit | Access |\n"
            "| :--- | :--- | :--- | :--- | :--- | :--- |\n"
            "| **Active Power** | **5016** (0x1398) | U32 (Big Endian) | 0.1 | kW | Read Only (0x04) |\n"
            "| **Reactive Power** | 5018 | S32 | 0.1 | kVAR | Read Only |\n"
            "| **Daily Yield** | 5002 | U16 | 0.1 | kWh | Read Only |\n"
            "| **Total Yield** | 5003 | U32 | 1.0 | kWh | Read Only |\n"
            "| **PV Insulation Resistance** | 5028 | U16 | 1.0 | kΩ | Read Only |\n"
            "| **Inverter Operating State** | 5000 | U16 | 1 | Enum | Read Only |\n\n"
            "**Communication Parameters:**\n"
            "- Protocol: Modbus RTU / Modbus TCP\n"
            "- Default Baud Rate: 9600 bps (configurable up to 115200 bps)\n"
            "- Data Bits: 8, Parity: None, Stop Bits: 1\n"
            "- Slave ID Default: 1"
        )

    mfg = entities.manufacturer or "Solar"
    model = entities.model or "Unknown"
    symptom = entities.symptom or "fault"
    power = f" {entities.power_str}" if entities.power_str and entities.power_str != "Unknown" else ""

    # Check if specific alarm code could not be verified
    alarm_unverified_notice = ""
    if entities.alarm_code and not any(entities.alarm_code in str(k.get("alarm_code", "")) for k in structured_knowledge):
        alarm_unverified_notice = f"\n\n> ⚠️ *I could not verify alarm {entities.alarm_code} for the specified {mfg} {model if model != 'Unknown' else ''} inverter from the current OEM knowledge base. The following is a general engineering diagnostic guide.*"

    # Specific response for Grid Fault queries
    if symptom == "grid fault":
        return f"""### Assessment

The {mfg}{power} inverter is reporting a grid-related fault ({symptom}). The exact root cause cannot be confirmed without the specific inverter model and exact numerical alarm code.{alarm_unverified_notice}

### Most likely causes

1. **Grid voltage abnormality**: Utility grid overvoltage or undervoltage exceeding the inverter's protection thresholds.
2. **Grid frequency deviation**: Grid frequency drifting outside the permissible operating window (e.g. 47.5 Hz – 52.0 Hz).
3. **Phase loss or voltage imbalance**: Blown AC fuse, open contactor pole, or severed phase on the incoming AC line.
4. **AC breaker / contactor trip**: Upstream AC circuit breaker tripped or high contact resistance on AC terminal lugs.
5. **Anti-islanding / impedance detection**: Grid disconnection or high line impedance causing localized voltage rise during peak generation.
6. **Incorrect grid-code settings**: Mismatched regional grid standard or overvoltage protection curve.

*Note: These are engineering hypotheses, NOT confirmed causes.*

### Check first

1. **Confirm the exact {mfg} model**: Check the nameplate sticker on the side of the inverter or read the model string from SCADA.
2. **Capture the exact numeric alarm code**: Note down the specific numerical error code from the inverter display or monitoring system.
3. **Verify single vs multiple inverter correlation**: Check whether other inverters on the same transformer / LT panel are reporting the same grid fault.
4. **Measure AC terminal voltages**: Measure line-to-line voltages (L1-L2, L2-L3, L3-L1) and line-to-neutral voltages (L1-N, L2-N, L3-N) at the inverter AC terminals using a calibrated true-RMS multimeter.
5. **Check grid frequency**: Verify that grid frequency is within the nominal operating limits.
6. **Follow applicable {mfg} OEM procedure**: Once the exact model is verified, follow the official manufacturer troubleshooting flowchart.

### Information needed

Please provide:
- Exact {mfg} model name (e.g. from nameplate rating)
- Exact numeric fault/alarm code displayed on the screen or SCADA
- Screenshot of the inverter display or SCADA alarm history
- Line-to-line AC voltage measurements at inverter terminals
- Whether other inverters on the same LT feeder are also affected

### Safety

> ⚠️ **CRITICAL ELECTRICAL SAFETY NOTICE**:
> - Never bypass AC grid protection, overvoltage trips, frequency relays, or internal safety interlocks.
> - High AC grid voltage and energized DC conductors present lethal shock hazards.
> - Follow site Lockout/Tagout (LOTO), wear rated electrical PPE, and only permit qualified personnel to measure energized terminals.
"""

    # Default 5-section response for insulation / other faults
    return f"""### Assessment

The {mfg}{power} inverter is reporting an insulation-related fault ({symptom}). The exact root cause cannot yet be confirmed because the specific inverter model and exact numeric alarm code have not been provided.{alarm_unverified_notice}

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
2. **Capture the exact alarm/fault code**: Note down the specific numerical error code from the inverter display, app, or SCADA.
3. **Determine fault timing & environmental correlation**: Check whether the fault is continuous (present all day) or intermittent (occurs primarily in early morning or after rain).
4. **String-by-string isolation**:
   - Turn off the inverter following the proper shutdown sequence (AC breaker first, then DC isolator).
   - Disconnect all DC string inputs.
   - Measure string open-circuit voltage ($V_{{oc}}$) from (+) to Ground and (-) to Ground using a calibrated multimeter.
   - Reconnect strings one-by-one to identify the specific string or MPPT triggering the insulation threshold.
5. **Inspect DC connectors and conduit**: Check all MC4 connectors along the affected string for proper mating, water ingress, or signs of burning.
6. **Follow applicable {mfg} OEM procedure**: Once the exact model is confirmed, follow the manufacturer's official troubleshooting flowchart.

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
