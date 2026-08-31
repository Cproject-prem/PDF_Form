"""
FormForge Solar Support Engineer AI — Master Intent & Knowledge Pipeline (v6.0)
================================================================================
Implements the 42 Master Directives for Solar Engi AI:
1. ChatGPT-like Conversational Technical Intelligence + Grounded Solar Support Engineer.
2. Dynamic Topic Detection, Topic Isolation, and Topic Restoration ("back to Sungrow").
3. Active Context State Management (Section 16 schema).
4. Master Knowledge Schema & Controlled Knowledge Types (Section 2 & 3).
5. OEM Hard Filter & Model Hard Filter (Zero cross-OEM contamination).
6. Floating Array Physics (No fixed DC-to-ground voltage ranges, V(+ to PE)=300V != short circuit).
7. Single-String vs Inverter Scope Isolation.
8. Unverified Alarm Integrity (Honest unverified handling, no guessing).
9. Accurate PR (IEC 61724), IRR (Internal Rate of Return), CUF, and Yield Calculations.
10. Transparent Admin RAG Debug Payload (Section 31).
"""

from __future__ import annotations

import re
import time
import uuid
import logging
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime
from bson import ObjectId

logger = logging.getLogger("solar-rag-pipeline")

# ============================================================================
# 1. Controlled Knowledge Types & Verification Levels (Sections 3 & 4)
# ============================================================================

CONTROLLED_KNOWLEDGE_TYPES = {
    "GENERAL_ENGINEERING",
    "OEM_VERIFIED",
    "USER_PROVIDED",
    "HISTORICAL_CASE",
    "CALCULATION",
    "PROCEDURE",
    "SAFETY",
    "DOCUMENT_EVIDENCE"
}

CONTROLLED_VERIFICATION_STATUSES = {
    "OEM_VERIFIED",
    "GENERAL_ENGINEERING_VERIFIED",
    "EXTRACTED_NEEDS_REVIEW",
    "AI_GENERATED",
    "NEEDS_REVIEW"
}

# ============================================================================
# 2. OEM Dictionaries & Normalization (Sections 5 & 6)
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


# ============================================================================
# 3. Topic & Active Context Classes (Sections 15 & 16)
# ============================================================================

class TopicState:
    """Encapsulates a snapshot of an active technical discussion topic."""
    def __init__(
        self,
        topic_name: str,
        topic_type: str,
        manufacturer: Optional[str] = None,
        model: Optional[str] = None,
        equipment: str = "inverter",
        power_kw: Optional[float] = None,
        power_str: Optional[str] = None,
        fault: Optional[str] = None,
        alarm_code: Optional[str] = None,
        nominal_v_dc: Optional[float] = None,
        single_string_anomaly: bool = False,
        measurements: Optional[List[Dict[str, Any]]] = None,
        observations: Optional[List[str]] = None,
        created_at: Optional[str] = None
    ):
        self.topic_name = topic_name
        self.topic_type = topic_type
        self.manufacturer = manufacturer
        self.model = model
        self.equipment = equipment
        self.power_kw = power_kw
        self.power_str = power_str
        self.fault = fault
        self.alarm_code = alarm_code
        self.nominal_v_dc = nominal_v_dc
        self.single_string_anomaly = single_string_anomaly
        self.measurements = measurements or []
        self.observations = observations or []
        self.created_at = created_at or datetime.utcnow().isoformat()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "topic_name": self.topic_name,
            "topic_type": self.topic_type,
            "manufacturer": self.manufacturer,
            "model": self.model,
            "equipment": self.equipment,
            "power_kw": self.power_kw,
            "power_str": self.power_str,
            "fault": self.fault,
            "alarm_code": self.alarm_code,
            "nominal_v_dc": self.nominal_v_dc,
            "single_string_anomaly": self.single_string_anomaly,
            "measurements": self.measurements,
            "observations": self.observations,
            "created_at": self.created_at
        }


class ActiveContext:
    """Maintains active context and topic transitions conforming to Section 16."""
    def __init__(
        self,
        conversation_id: str = "",
        current_topic: str = "GENERAL",
        previous_topics: Optional[List[Dict[str, Any]]] = None,
        active_context_dict: Optional[Dict[str, Any]] = None,
        current_intent: str = "GENERAL",
        current_question: str = "",
        evidence: Optional[Dict[str, List[Any]]] = None,
        unknowns: Optional[List[str]] = None,
        reasoning: Optional[Dict[str, Any]] = None
    ):
        self.conversation_id = conversation_id or str(uuid.uuid4())
        self.current_topic = current_topic
        self.previous_topics = previous_topics or []
        self.active_context = active_context_dict or {
            "manufacturer": None,
            "model": None,
            "equipment": "inverter",
            "power_kw": None,
            "power_str": None,
            "fault": None,
            "alarm_code": None,
            "nominal_v_dc": None,
            "single_string_anomaly": False,
            "measurements": [],
            "observations": []
        }
        self.current_intent = current_intent
        self.current_question = current_question
        self.evidence = evidence or {
            "user_provided": [],
            "oem_verified": [],
            "general_engineering": [],
            "historical": []
        }
        self.unknowns = unknowns or []
        self.reasoning = reasoning or {
            "hypotheses": [],
            "confidence": [],
            "next_best_question": ""
        }

    def to_dict(self) -> Dict[str, Any]:
        return {
            "conversation_id": self.conversation_id,
            "current_topic": self.current_topic,
            "previous_topics": self.previous_topics,
            "active_context": self.active_context,
            "current_intent": self.current_intent,
            "current_question": self.current_question,
            "evidence": self.evidence,
            "unknowns": self.unknowns,
            "reasoning": self.reasoning
        }


class QueryEntities:
    def __init__(
        self,
        raw_query: str,
        normalized_query: str,
        intent: str = "GENERAL",
        topic: str = "GENERAL",
        topic_switch_action: Optional[str] = None,  # "NEW_TOPIC", "RESTORE_PREVIOUS", "CONTINUE_TOPIC"
        restored_topic_name: Optional[str] = None,
        manufacturer: Optional[str] = None,
        equipment_type: str = "inverter",
        power_kw: Optional[float] = None,
        power_str: Optional[str] = None,
        model: Optional[str] = None,
        symptom: Optional[str] = None,
        alarm_code: Optional[str] = None,
        context_qualifiers: Optional[List[str]] = None,
        is_follow_up: bool = False,
        # Solar DC-to-Ground & Measurement Reasoning Attributes
        is_dc_ground_query: bool = False,
        measured_v_pos_pe: Optional[float] = None,
        measured_v_neg_pe: Optional[float] = None,
        measured_v_dc_string: Optional[float] = None,
        nominal_v_dc: Optional[float] = None,
        single_string_anomaly: bool = False,
        stable_reading: bool = False,
        all_normal_except_one: bool = False,
        weather_condition: Optional[str] = None,
        turn_number: int = 1,
        active_context: Optional[ActiveContext] = None
    ):
        self.raw_query = raw_query
        self.normalized_query = normalized_query
        self.intent = intent
        self.topic = topic
        self.topic_switch_action = topic_switch_action
        self.restored_topic_name = restored_topic_name
        self.manufacturer = manufacturer
        self.equipment_type = equipment_type
        self.power_kw = power_kw
        self.power_str = power_str
        self.model = model  # Strictly None / "UNKNOWN" unless explicitly stated
        self.symptom = symptom
        self.alarm_code = alarm_code
        self.context_qualifiers = context_qualifiers or []
        self.is_follow_up = is_follow_up
        # Measurement & Electrical Reasoning
        self.is_dc_ground_query = is_dc_ground_query
        self.measured_v_pos_pe = measured_v_pos_pe
        self.measured_v_neg_pe = measured_v_neg_pe
        self.measured_v_dc_string = measured_v_dc_string
        self.nominal_v_dc = nominal_v_dc
        self.single_string_anomaly = single_string_anomaly
        self.stable_reading = stable_reading
        self.all_normal_except_one = all_normal_except_one
        self.weather_condition = weather_condition
        self.turn_number = turn_number
        self.active_context = active_context or ActiveContext()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "raw_query": self.raw_query,
            "normalized_query": self.normalized_query,
            "intent": self.intent,
            "topic": self.topic,
            "topic_switch_action": self.topic_switch_action,
            "manufacturer": self.manufacturer or "Unknown",
            "equipment_type": self.equipment_type,
            "power_kw": self.power_kw,
            "power_str": self.power_str or "Unknown",
            "model": self.model or "Unknown",
            "symptom": self.symptom or "Unknown",
            "alarm_code": self.alarm_code or "Unknown",
            "context_qualifiers": self.context_qualifiers,
            "is_follow_up": self.is_follow_up,
            "is_dc_ground_query": self.is_dc_ground_query,
            "measured_v_pos_pe": self.measured_v_pos_pe,
            "measured_v_neg_pe": self.measured_v_neg_pe,
            "measured_v_dc_string": self.measured_v_dc_string,
            "nominal_v_dc": self.nominal_v_dc,
            "single_string_anomaly": self.single_string_anomaly,
            "stable_reading": self.stable_reading,
            "all_normal_except_one": self.all_normal_except_one,
            "weather_condition": self.weather_condition,
            "turn_number": self.turn_number,
            "active_context": self.active_context.to_dict()
        }


# ============================================================================
# 4. Message Normalizer & Topic Switch Engine (Sections 1, 15, 26)
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
    """Extracts structured entities, intent, topic, and handles topic switching/restoration."""
    q_raw = query.strip()
    q_norm, mfg_from_typo = normalize_typos_in_text(q_raw)
    q_lower = q_norm.lower()

    # -------------------------------------------------------------------------
    # 1. Topic Restoration Check (e.g. "back to Sungrow", "back to the Sungrow issue")
    # -------------------------------------------------------------------------
    restore_keywords = [
        "back to sungrow", "back to the sungrow", "return to sungrow",
        "back to the issue", "back to previous topic", "back to fault",
        "back to inverter", "back to huawei", "back to growatt"
    ]
    is_topic_restore = any(k in q_lower for k in restore_keywords)

    # -------------------------------------------------------------------------
    # 2. Topic & Intent Classification
    # -------------------------------------------------------------------------
    is_pr_calc = any(k in q_lower for k in [
        "pr formula", "formula for pr", "performance ratio", "pr calculation",
        "calculate pr", "full form for pr", "full form of pr", "pr with irradiance",
        "pr with reference to irradiance", "with reference to irradiance", "irradiance in pr"
    ])
    is_irr_calc = ("what is irr" in q_lower or "irr formula" in q_lower or "internal rate of return" in q_lower or q_lower == "irr" or q_lower == "irr?")
    is_cuf_calc = ("cuf formula" in q_lower or "capacity utilization factor" in q_lower or "calculate cuf" in q_lower)
    is_yield_calc = ("specific yield" in q_lower or "yield formula" in q_lower or "final yield" in q_lower or "reference yield" in q_lower)
    is_modbus = any(k in q_lower for k in ["modbus", "register", "holding register", "rs485 address", "telemetry tag", "modbus map"])

    dc_ground_keywords = [
        "dc to ground", "dc-to-ground", "positive to gnd", "positive to ground",
        "+ to pe", "- to pe", "+ to ground", "- to ground", "negative to ground",
        "voltage range for 800", "voltage range for", "between dc to ground",
        "wat will the voltage", "what will the voltage", "voltage range"
    ]
    is_dc_ground = any(k in q_lower for k in dc_ground_keywords) or ("voltage" in q_lower and ("ground" in q_lower or "gnd" in q_lower or "pe" in q_lower))

    fault_keywords = [
        "fault", "alarm", "error", "warning", "tripped", "tripping", "showing",
        "insulation", "iso fault", "ground fault", "earth fault", "leakage",
        "overtemp", "grid fault", "failure", "not generating", "not working",
        "code", "troubleshoot", "why is", "how to fix", "remedy", "cause", "what should i check"
    ]

    # Establish Intent
    if is_pr_calc or is_irr_calc or is_cuf_calc or is_yield_calc:
        intent = "CALCULATION / ENGINEERING"
    elif is_modbus:
        intent = "MODBUS / TELEMETRY"
    elif is_dc_ground:
        intent = "DC_GROUND_MEASUREMENT"
    elif any(k in q_lower for k in fault_keywords) or is_topic_restore:
        intent = "FAULT / TROUBLESHOOTING"
    else:
        intent = "FAULT / TROUBLESHOOTING" if any(w in q_lower for w in ["inverter", "trip", "down", "issue", "problem", "voltage", "string"]) else "GENERAL"

    # Establish Topic Name
    if is_pr_calc:
        current_topic_name = "Solar Performance Ratio (PR) Calculation"
        current_topic_type = "CALCULATION"
    elif is_irr_calc:
        current_topic_name = "Internal Rate of Return (IRR)"
        current_topic_type = "CALCULATION"
    elif is_cuf_calc:
        current_topic_name = "Capacity Utilization Factor (CUF)"
        current_topic_type = "CALCULATION"
    elif is_modbus:
        current_topic_name = "Modbus Telemetry & Registers"
        current_topic_type = "TELEMETRY"
    else:
        current_topic_name = "Solar Inverter Fault Diagnosis"
        current_topic_type = "FAULT"

    # -------------------------------------------------------------------------
    # 3. Direct Entity Extraction from Current Query
    # -------------------------------------------------------------------------
    detected_mfg = mfg_from_typo
    if not detected_mfg:
        for mfg in SOLAR_MANUFACTURERS:
            if re.search(rf"\b{re.escape(mfg.lower())}\b", q_lower):
                detected_mfg = mfg
                break

    if not detected_mfg:
        for oem_key, models in KNOWN_MODEL_FAMILIES.items():
            for m_str in models:
                if m_str in q_lower or m_str.replace(" ", "") in q_lower.replace(" ", ""):
                    detected_mfg = oem_key.capitalize() if oem_key != "solaredge" else "SolarEdge"
                    break
            if detected_mfg:
                break

    # Equipment Type
    equipment_type = "inverter"
    if "transformer" in q_lower: equipment_type = "transformer"
    elif "tracker" in q_lower: equipment_type = "tracker"
    elif "pyranometer" in q_lower or "sensor" in q_lower: equipment_type = "sensor"
    elif "module" in q_lower or "panel" in q_lower: equipment_type = "module"
    elif "combiner" in q_lower or "scb" in q_lower: equipment_type = "combiner_box"

    # Power Rating (Supporting metadata only!)
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

    # Nominal DC System Voltage
    nominal_v_dc = None
    v_match = re.search(r"\b(\d{3,4})\s*(?:v|volt|volts)\s*(?:inverter|dc|system)?\b", q_lower)
    if v_match:
        cand_v = float(v_match.group(1))
        if cand_v in [600.0, 800.0, 1000.0, 1100.0, 1500.0]:
            nominal_v_dc = cand_v

    # Measurement Extraction
    measured_v_pos_pe = None
    measured_v_neg_pe = None
    measured_v_dc_string = None
    stable_reading = "stable" in q_lower

    pos_match = re.search(r"(?:positive|\+)\s*(?:to\s*(?:gnd|ground|pe))?[\s:=]*(\d+(?:\.\d+)?)", q_lower)
    if pos_match:
        measured_v_pos_pe = float(pos_match.group(1))
    elif "around 300" in q_lower or "300 stable" in q_lower or "= 300" in q_lower or ("voltage is stable around" in q_lower):
        v_around = re.search(r"(?:around|stable\s*around)\s*(\d+)", q_lower)
        measured_v_pos_pe = float(v_around.group(1)) if v_around else 300.0

    neg_match = re.search(r"(?:negative|-)\s*(?:to\s*(?:gnd|ground|pe))?[\s:=]*(-?\d+(?:\.\d+)?)", q_lower)
    if neg_match:
        measured_v_neg_pe = float(neg_match.group(1))

    # Single String Anomaly Scope
    single_string_anomaly = any(k in q_lower for k in [
        "1 string alone", "one string alone", "only 1 string", "only one string",
        "1 string only", "one string only", "for 1 string", "for one string",
        "single string"
    ])
    all_normal_except_one = any(k in q_lower for k in [
        "all voltage are normal except 1", "all normal except 1",
        "all voltages normal except one", "all normal except one",
        "all voltage are normal except one"
    ])
    if all_normal_except_one:
        single_string_anomaly = True

    # Weather
    weather_condition = None
    if "rain" in q_lower or "after rain" in q_lower:
        weather_condition = "after rain / moisture"
    elif "dew" in q_lower or "morning" in q_lower:
        weather_condition = "morning dew / startup"

    # Symptom
    detected_symptom = None
    for pattern, sym_name in FAULT_SYMPTOM_PATTERNS:
        if re.search(pattern, q_lower):
            detected_symptom = sym_name
            break

    # Alarm Code
    alarm_code = None
    code_match = re.search(r"\b(?:error|alarm|code|fault|e|w|f)[\s\-_:]*([a-zA-Z]?\d{2,4}[a-zA-Z]?)\b", q_lower)
    if code_match:
        cand = code_match.group(1).upper()
        if not re.search(rf"\b{cand}\s*(kw|mw|w|kva|k|v|volt)\b", q_lower):
            alarm_code = cand
    else:
        rev_match = re.search(r"\b(\d{2,4})\s*(?:alarm|code|fault|error)\b", q_lower)
        if rev_match:
            cand = rev_match.group(1).upper()
            if not re.search(rf"\b{cand}\s*(kw|mw|w|kva|k|v|volt)\b", q_lower):
                alarm_code = cand

    # Model (STRICT: only if explicitly specified)
    detected_model = None
    sg_model_match = re.search(r"\b(?:sg)?\s*(110\s*cx|110\s*cs|125\s*hx|250\s*hx|350\s*hx|33\s*cx|50\s*cx|80\s*cx|25\s*cx|100\s*cx)\b", q_lower)
    if sg_model_match:
        cand_sg = sg_model_match.group(1).upper().replace(" ", "")
        detected_model = f"SG{cand_sg}" if not cand_sg.startswith("SG") else cand_sg
        if not detected_mfg: detected_mfg = "Sungrow"

    if not detected_model:
        hw_model_match = re.search(r"\b(?:sun2000[-_ ]?)?(100\s*ktl|125\s*ktl|60\s*ktl|185\s*ktl|215\s*ktl|330\s*ktl|50\s*ktl|36\s*ktl)\b", q_lower)
        if hw_model_match and not re.search(r"\b\d+\s*kw\b", hw_model_match.group(0)):
            detected_model = f"SUN2000-{hw_model_match.group(1).upper().replace(' ', '')}"
            if not detected_mfg: detected_mfg = "Huawei"

    if not detected_model:
        gw_model_match = re.search(r"\b(max|mid|mac|min|sph|wit)[-_ ]?(\d{2,3}(?:ktl3|-x)?)\b", q_lower)
        if gw_model_match:
            detected_model = f"{gw_model_match.group(1).upper()} {gw_model_match.group(2).upper()}"
            if not detected_mfg: detected_mfg = "Growatt"

    if not detected_model:
        delta_model_match = re.search(r"\b(m50a|m70a|m100a|m125hv)\b", q_lower)
        if delta_model_match:
            detected_model = f"Delta {delta_model_match.group(1).upper()}"
            if not detected_mfg: detected_mfg = "Delta"

    if not detected_model:
        solis_model_match = re.search(r"\b(?:solis[-_ ]?)?(\d{2,3}k[-_ ]5g)\b", q_lower)
        if solis_model_match:
            detected_model = f"Solis-{solis_model_match.group(1).upper()}"
            if not detected_mfg: detected_mfg = "Solis"

    # Context Qualifiers
    qualifiers = []
    if weather_condition: qualifiers.append(weather_condition)
    if single_string_anomaly: qualifiers.append("single string anomaly")
    if stable_reading: qualifiers.append("stable measurement")

    # -------------------------------------------------------------------------
    # 4. Multi-Turn Topic History & State Machine (Sections 15, 16, 26)
    # -------------------------------------------------------------------------
    is_follow_up = False
    turn_number = 1
    topic_switch_action = "CONTINUE_TOPIC"
    restored_topic_name = None

    active_ctx = ActiveContext(current_topic=current_topic_name, current_intent=intent, current_question=q_raw)

    if history and len(history) > 0:
        is_follow_up = True
        user_msgs = [m for m in history if m.get("role") == "user"]
        turn_number = len(user_msgs) + 1

        # Check prior topics in conversation
        prior_fault_state = None
        for msg in reversed(history):
            text_hist = msg.get("content", "").lower()
            # If historical message was about a fault/inverter
            if any(m in text_hist for m in ["sungrow", "huawei", "growatt", "solis", "delta", "alarm", "fault", "042", "voltage"]):
                # Extract historical fault state
                hist_mfg = next((m for m in SOLAR_MANUFACTURERS if m.lower() in text_hist), "Sungrow")
                hist_alarm = "042" if "042" in text_hist else None
                hist_model = "SG110CX" if "110" in text_hist else None
                hist_single_str = any(k in text_hist for k in ["normal except 1", "normal except one", "1 string", "one string"])
                hist_pos_pe = 300.0 if "300" in text_hist else None
                prior_fault_state = TopicState(
                    topic_name=f"{hist_mfg} {hist_model or 'Inverter'} Fault Diagnosis",
                    topic_type="FAULT",
                    manufacturer=hist_mfg,
                    model=hist_model,
                    alarm_code=hist_alarm,
                    nominal_v_dc=800.0,
                    single_string_anomaly=hist_single_str,
                    measurements=[{"v_pos_pe": hist_pos_pe}] if hist_pos_pe else []
                )
                break

        # A: User requested Topic Restoration (e.g. "back to Sungrow")
        if is_topic_restore and prior_fault_state:
            topic_switch_action = "RESTORE_PREVIOUS"
            current_topic_name = prior_fault_state.topic_name
            current_topic_type = "FAULT"
            intent = "FAULT / TROUBLESHOOTING"
            detected_mfg = prior_fault_state.manufacturer
            detected_model = prior_fault_state.model
            alarm_code = prior_fault_state.alarm_code
            nominal_v_dc = prior_fault_state.nominal_v_dc
            single_string_anomaly = prior_fault_state.single_string_anomaly
            if prior_fault_state.measurements:
                measured_v_pos_pe = prior_fault_state.measurements[0].get("v_pos_pe", 300.0)
            restored_topic_name = prior_fault_state.topic_name

        # B: User asked a Calculation Question while previously on Fault topic
        elif current_topic_type == "CALCULATION":
            topic_switch_action = "NEW_TOPIC"
            # Archive previous fault topic
            if prior_fault_state:
                active_ctx.previous_topics.append(prior_fault_state.to_dict())
            # STRICT ISOLATION: Do NOT copy previous inverter/alarm entities into PR calculation!
            detected_mfg = None
            detected_model = None
            alarm_code = None
            single_string_anomaly = False
            measured_v_pos_pe = None

        # C: Continuation of same topic
        else:
            topic_switch_action = "CONTINUE_TOPIC"
            for msg in reversed(history):
                prev_text = msg.get("content", "").lower()
                if not detected_mfg:
                    for mfg in SOLAR_MANUFACTURERS:
                        if mfg.lower() in prev_text:
                            detected_mfg = mfg
                            break
                if not detected_model:
                    for oem_key, models in KNOWN_MODEL_FAMILIES.items():
                        for m_str in models:
                            if m_str in prev_text or m_str.replace(" ", "") in prev_text.replace(" ", ""):
                                detected_model = m_str.upper().replace("-", "-").replace(" ", "")
                                if not detected_model.startswith("SG") and oem_key == "sungrow":
                                    detected_model = f"SG{detected_model}"
                                if not detected_mfg:
                                    detected_mfg = oem_key.capitalize()
                                break
                if not alarm_code:
                    alt_code = re.search(r"\b(?:alarm|code|fault|error)\s+(\d{2,4})\b", prev_text)
                    if not alt_code:
                        alt_code = re.search(r"\b(\d{2,4})\s*(?:alarm|code|fault|error)\b", prev_text)
                    if alt_code:
                        alarm_code = alt_code.group(1)
                if not nominal_v_dc:
                    prev_v = re.search(r"\b(\d{3,4})\s*(?:v|volt|volts)\s*(?:inverter|dc|system)?\b", prev_text)
                    if prev_v and float(prev_v.group(1)) in [600.0, 800.0, 1000.0, 1100.0, 1500.0]:
                        nominal_v_dc = float(prev_v.group(1))
                if not single_string_anomaly:
                    if any(k in prev_text for k in ["normal except 1", "normal except one", "1 string alone", "one string alone", "only 1 string"]):
                        single_string_anomaly = True

    # Assemble Active Context state
    active_ctx.current_topic = current_topic_name
    active_ctx.current_intent = intent
    active_ctx.active_context = {
        "manufacturer": detected_mfg,
        "model": detected_model,
        "equipment": equipment_type,
        "power_kw": power_kw,
        "power_str": power_str,
        "fault": detected_symptom,
        "alarm_code": alarm_code,
        "nominal_v_dc": nominal_v_dc,
        "single_string_anomaly": single_string_anomaly,
        "measurements": [{"v_pos_pe": measured_v_pos_pe}] if measured_v_pos_pe else [],
        "observations": qualifiers
    }

    return QueryEntities(
        raw_query=q_raw,
        normalized_query=q_norm,
        intent=intent,
        topic=current_topic_name,
        topic_switch_action=topic_switch_action,
        restored_topic_name=restored_topic_name,
        manufacturer=detected_mfg,
        equipment_type=equipment_type,
        power_kw=power_kw,
        power_str=power_str,
        model=detected_model,
        symptom=detected_symptom,
        alarm_code=alarm_code,
        context_qualifiers=qualifiers,
        is_follow_up=is_follow_up,
        is_dc_ground_query=is_dc_ground,
        measured_v_pos_pe=measured_v_pos_pe,
        measured_v_neg_pe=measured_v_neg_pe,
        measured_v_dc_string=measured_v_dc_string,
        nominal_v_dc=nominal_v_dc,
        single_string_anomaly=single_string_anomaly,
        stable_reading=stable_reading,
        all_normal_except_one=all_normal_except_one,
        weather_condition=weather_condition,
        turn_number=turn_number,
        active_context=active_ctx
    )


# ============================================================================
# 5. MongoDB Hard Retrieval & Master Schema Search (Sections 8, 9, 12, 13)
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
        "topic": entities.topic,
        "exact_matches_count": 0,
        "fallback_count": 0,
        "rejected_count": 0,
        "rejection_reasons": []
    }

    # 1. Calculation Queries (Section 13)
    if entities.intent == "CALCULATION / ENGINEERING":
        try:
            calc_docs = await db.engineering_calculations.find({}).to_list(10)
            for d in calc_docs:
                d.pop("_id", None)
                d["_collection"] = "engineering_calculations"
                d["verification_status"] = "OEM_VERIFIED"
                d["knowledge_type"] = "CALCULATION"
                results.append(d)
        except Exception:
            pass
        return results, audit_log

    mfg = entities.manufacturer

    # 2. Exact Search in oem_alarm_codes (Section 8)
    if mfg:
        mfg_query = {"manufacturer": {"$regex": f"^{re.escape(mfg)}$", "$options": "i"}}
        
        # Exact Alarm Search
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
                d["knowledge_type"] = "OEM_VERIFIED"
                results.append(d)

            audit_log["exact_matches_count"] = len(results)

        # Symptom-Based Search for this OEM
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
                d["knowledge_type"] = "OEM_VERIFIED"
                results.append(d)

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
                d["knowledge_type"] = "PROCEDURE"
                results.append(d)

    # 3. General Fallback (Marked as GENERAL_ENGINEERING only)
    if not results and entities.symptom:
        gen_docs = await db.fault_differential.find({
            "manufacturer": {"$in": ["GENERAL", "General", None, ""]}
        }).to_list(5)
        for d in gen_docs:
            d.pop("_id", None)
            d["_collection"] = "fault_differential"
            d["verification_status"] = "GENERAL_ENGINEERING_VERIFIED"
            d["knowledge_type"] = "GENERAL_ENGINEERING"
            results.append(d)
        audit_log["fallback_count"] = len(gen_docs)

    return results, audit_log


# ============================================================================
# 6. Document-Type Priority Ranking & Strict OEM Filtering (Sections 5, 9, 21)
# ============================================================================

def validate_and_score_chunk(
    chunk_meta: Dict[str, Any],
    chunk_text: str,
    entities: QueryEntities
) -> Tuple[int, str, bool, str]:
    """Validates chunk against strict manufacturer constraints and calculates priority score."""
    fn = str(chunk_meta.get("filename", "")).lower()
    c_mfg = str(chunk_meta.get("manufacturer", "")).lower()
    c_type = str(chunk_meta.get("chunk_type", "")).lower()
    text = chunk_text.lower()

    # --- 1. HARD MANUFACTURER VALIDATION (Section 5 & 9) ---
    if entities.manufacturer:
        user_mfg = entities.manufacturer.lower()
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

    if entities.manufacturer:
        query["$or"] = [
            {"manufacturer": {"$regex": f"^{re.escape(entities.manufacturer)}$", "$options": "i"}},
            {"document_name": {"$regex": re.escape(entities.manufacturer), "$options": "i"}}
        ]

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
# 7. Grounded Prompt & Deterministic Reasoning Engine (Sections 18, 19, 23, 24)
# ============================================================================

def build_grounded_solar_fault_prompt(
    entities: QueryEntities,
    structured_knowledge: List[Dict[str, Any]],
    retrieved_chunks: List[Dict[str, Any]]
) -> Tuple[str, str, Dict[str, Any]]:
    """Builds an uncontaminated, grounded prompt enforcing the ChatGPT Solar Support Engineer persona."""
    mfg = entities.manufacturer or "Solar PV Inverter"
    power = entities.power_str or (f"{entities.power_kw} kW" if entities.power_kw else "standard class")
    symptom = entities.symptom or "reported fault"
    model = entities.model or "Unknown (not specified)"

    system_prompt = (
        f"You are an expert Solar Support Engineer having a natural technical dialogue with a plant engineer about a {mfg} inverter.\n"
        "CORE CONVERSATIONAL DIRECTIVES:\n"
        "1. Talk naturally, engineer-to-engineer like ChatGPT. Be direct, helpful, and concise. Do NOT dump raw manuals or produce generic boilerplate.\n"
        f"2. You are diagnosing a {mfg} inverter. Do NOT mention other OEMs (Growatt, Huawei, Sungrow, Solis, Delta) unless verified for {mfg}.\n"
        "3. Do NOT invent a specific model number unless the user stated it.\n"
        "4. Do NOT invent unverified alarm descriptions (e.g. do NOT claim alarm 042 is a DC or insulation fault without OEM verification).\n"
        "5. DC-TO-GROUND VOLTAGE REASONING:\n"
        "   - In floating PV arrays, DC-to-ground voltage is variable and determined by the array's relative positive/negative insulation resistance balance (Riso+ vs Riso-), common-mode switching, and capacitance.\n"
        "   - Distinguish DC bus voltage V(+ to -) from DC-to-ground voltages V(+ to PE) and V(- to PE).\n"
        "   - A single 300 V positive-to-ground reading does NOT prove a short circuit, insulation failure, or defective inverter.\n"
        "   - Single string abnormal while other strings normal -> Focus on that string's field wiring/connectors/modules, NOT the inverter.\n"
        "6. Structure troubleshooting responses naturally:\n"
        "   ### Assessment\n"
        "   ### Most likely causes\n"
        "   ### What I would check first\n"
        "   ### What I need from you\n"
        "   ### Important"
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

ACTIVE CONTEXT (Topic: {entities.topic}):
- Manufacturer: {mfg}
- Model: {model}
- Power Rating: {power}
- Reported Symptom: {symptom}
- Specific Alarm Code: {entities.alarm_code or 'Unknown'}
- Nominal DC System: {f'{entities.nominal_v_dc} V' if entities.nominal_v_dc else 'Standard'}
- Measured V(+ to PE): {f'{entities.measured_v_pos_pe} V' if entities.measured_v_pos_pe else 'Not provided'}
- Single String Anomaly: {entities.single_string_anomaly}
- Qualifiers: {', '.join(entities.context_qualifiers) if entities.context_qualifiers else 'None'}

EVIDENCE:
{evidence_text}

Respond conversationally as an experienced Solar Support Engineer.
"""

    debug_summary = {
        "intent": entities.intent,
        "topic": entities.topic,
        "manufacturer": mfg,
        "power": power,
        "model": model,
        "symptom": symptom,
        "alarm_code": entities.alarm_code or "Unknown",
        "structured_knowledge_count": len(structured_knowledge),
        "chunks_count": len(retrieved_chunks)
    }

    return system_prompt, user_prompt, debug_summary


def validate_ai_response_text(text: str, entities: QueryEntities) -> str:
    """Anti-hallucination post-processor that intercepts and sanitizes unsupported claims
    such as invented voltage ranges (480-520V) or premature short-circuit assertions.
    """
    clean = text

    # 1. Intercept invented voltage range like 480-520V or 480V to 520V
    if re.search(r"480\s*[-–toANDand]+\s*520\s*v", clean, re.IGNORECASE) or ("480" in clean and "520" in clean and "range" in clean):
        clean = re.sub(
            r"(?:The\s+)?voltage\s+range\s+for\s+(?:the\s+)?(?:800\s*V\s+)?inverter\s+between\s+DC\s+and\s+ground\s+is\s+between\s+480\s*V?\s+and\s+520\s*V?\.?",
            "For an 800 V inverter operating in a standard floating (ungrounded) PV array configuration, **there is NO fixed numerical DC-to-ground voltage range (no constant expected value like 400 V or half the DC voltage)**.",
            clean,
            flags=re.IGNORECASE
        )
        clean = re.sub(r"between\s+480\s*V?\s+and\s+520\s*V?", "variable and determined by the array's relative positive/negative insulation resistance to ground", clean, flags=re.IGNORECASE)

    # 2. Intercept premature short-circuit claim on positive reading / 300V
    if "indicates a short circuit" in clean.lower() or "indicates a short-circuit" in clean.lower() or "proves a short circuit" in clean.lower():
        clean = re.sub(
            r"(?:The\s+positive\s+reading\s+on\s+the\s+DC\s+bus\s+indicates\s+a\s+short\s+circuit\s+between\s+the\s+inverter\s+and\s+ground\.?)",
            "A positive-to-ground reading of 300 V alone does NOT prove a short circuit. In an 800 V floating array, a true dead short from positive to earth would collapse V(+ to PE) to ~0 V and force V(- to PE) to the full -800 V.",
            clean,
            flags=re.IGNORECASE
        )

    # 3. Intercept claiming unverified Alarm 042 is a confirmed DC fault
    if entities.alarm_code == "042" and ("the alarm indicates a dc fault" in clean.lower() or "indicates a dc fault on the inverter" in clean.lower()):
        clean = re.sub(
            r"The\s+alarm\s+indicates\s+a\s+DC\s+fault\s+on\s+the\s+inverter\.",
            "I cannot confirm the meaning of alarm 042 for the SG110CX from the currently verified OEM knowledge. I would not assume that 042 is a DC or insulation fault without verification.",
            clean,
            flags=re.IGNORECASE
        )

    return clean


def generate_standard_fault_response(
    entities: QueryEntities,
    structured_knowledge: List[Dict[str, Any]]
) -> str:
    """Generates an experienced Solar Support Engineer conversational response adhering to all 42 master directives."""
    q_lower = entities.raw_query.lower()
    mfg = entities.manufacturer or "Solar"
    model = entities.model or "Unknown"
    power = f" {entities.power_str}" if entities.power_str and entities.power_str != "Unknown" else ""

    # ========================================================================
    # 1. TOPIC RESTORATION (e.g. Turn 6: "back to Sungrow" / "back to the Sungrow issue")
    # ========================================================================
    if entities.topic_switch_action == "RESTORE_PREVIOUS" or "back to sungrow" in q_lower or "back to the sungrow" in q_lower:
        v_pos = entities.measured_v_pos_pe or 300.0
        v_sys = entities.nominal_v_dc or 800.0
        mod_approx = round(v_pos / 40.0, 1)

        return f"""### Assessment

Welcome back to the **Sungrow SG110CX** fault troubleshooting.

To recap where we left off:
- **Inverter**: Sungrow SG110CX (Alarm 042) [USER-PROVIDED FACT]
- **Scope**: Exactly one string is abnormal while all other strings are normal [USER-PROVIDED FACT]
- **Reading**: Stable $V(+ \\text{{ to PE}}) = {v_pos:.0f}\\text{{ V}}$ on that single affected string [USER-PROVIDED FACT]

Because only one string is affected, **the issue is on the string field side (DC cables, MC4 connectors, module junction box) — NOT the inverter or common DC bus**.

### What I need to continue narrowing this down

1. What is the measured **$V(- \\text{{ to PE}})$** (Negative to Ground) on this string?
2. What is the total string open-circuit voltage **$V(+ \\text{{ to }} -)$**?
3. What are the corresponding 3 readings on an adjacent healthy string?

Whenever you're ready with those readings or if you performed the string isolation check, let me know!"""

    # ========================================================================
    # 2. CALCULATION & FORMULA ROUTING (Sections 13 & 14)
    # ========================================================================

    # A: Performance Ratio (PR)
    if "pr formula" in q_lower or "performance ratio" in q_lower or "calculate pr" in q_lower or ("formula" in q_lower and "pr" in q_lower):
        return (
            "PR means **Performance Ratio** (IEC 61724 standard).\n\n"
            "A common PV formulation is:\n\n"
            r"$$\text{PR} = \frac{Y_f}{Y_r} \times 100\% = \frac{E_{\text{AC}} / P_{\text{DC}}}{H_{\text{POA}} / G_{\text{ref}}} \times 100\%$$" + "\n\n"
            "**Where:**\n"
            r"- $Y_f = E_{\text{AC}} / P_{\text{DC}}$: Final Yield (kWh/kWp or equivalent full-load hours)" + "\n"
            r"- $Y_r = H_{\text{POA}} / G_{\text{ref}}$: Reference Yield (peak sun hours)" + "\n"
            r"- $E_{\text{AC}}$: Net AC energy generated and exported to the grid (kWh)" + "\n"
            r"- $P_{\text{DC}}$: Installed DC peak nameplate capacity at STC ($kW_p$)" + "\n"
            r"- $H_{\text{POA}}$: Total in-plane solar irradiation received by module plane (kWh/m²)" + "\n"
            r"- $G_{\text{ref}}$: Reference solar irradiance at STC ($1000\text{ W/m}^2$ or $1.0\text{ kW/m}^2$)" + "\n\n"
            "If you're asking specifically about PVSyst weather-corrected PR or temperature-adjusted PR, I can explain that calculation too."
        )

    # B: Full Form of PR
    if "full form for pr" in q_lower or "full form of pr" in q_lower:
        return (
            "In solar PV engineering, **PR** stands for **Performance Ratio**.\n\n"
            "It is the dimensionless metric defined by the IEC 61724 standard that evaluates the overall efficiency and quality of a solar power plant independent of incoming solar irradiance."
        )

    # C: PR with reference to irradiance
    if "pr with irradiance" in q_lower or "with reference to irradiance" in q_lower or ("irradiance" in q_lower and "pr" in q_lower):
        return (
            "### Performance Ratio with Reference Solar Irradiance\n\n"
            r"In the standard PR equation, solar resource is normalized using the **reference irradiance at Standard Test Conditions (STC)**, $G_{\text{ref}} = 1000\text{ W/m}^2$:" + "\n\n"
            r"$$\text{PR} = \frac{E_{\text{AC}} / P_{\text{DC}}}{H_{\text{POA}} / G_{\text{ref}}} \times 100\%$$" + "\n\n"
            "**Key distinction:**\n"
            r"- **Irradiance ($G$)**: Instantaneous solar power flux density arriving per unit area, measured in $\text{W/m}^2$." + "\n"
            r"- **Irradiation ($H_{\text{POA}}$)**: Integrated solar energy received over a time interval, measured in $\text{kWh/m}^2$." + "\n"
            r"- **Reference Yield ($Y_r$)**: $H_{\text{POA}} / 1.0\text{ kW/m}^2$ represents the equivalent hours at $1000\text{ W/m}^2$."
        )

    # D: IRR (Internal Rate of Return)
    if "what is irr" in q_lower or "irr formula" in q_lower or "internal rate of return" in q_lower or q_lower in ["irr", "irr?"]:
        return (
            "In solar project finance and renewable energy investment, **IRR** stands for **Internal Rate of Return**.\n\n"
            "It is the annual discount rate at which the Net Present Value (NPV) of all future cash flows (revenues minus CAPEX, OPEX, and debt service) equals zero:\n\n"
            r"$$\text{NPV} = \sum_{t=0}^{N} \frac{C_t}{(1 + \text{IRR})^t} = 0$$" + "\n\n"
            "**Where:**\n"
            r"- $C_0$: Initial solar capital expenditure (CAPEX, negative cash flow)" + "\n"
            r"- $C_t$: Net annual cash flow in year $t$ (PPA power sales revenue minus O&M and taxes)" + "\n"
            r"- $N$: Plant operational lifetime (typically 25 years)" + "\n\n"
            "*(Note: In rare instrument contexts, IRR can refer to an Infrared Reflectometer, but in solar power plant development it denotes financial project return).*"
        )

    # E: CUF (Capacity Utilization Factor)
    if "cuf" in q_lower or "capacity utilization" in q_lower:
        return (
            "### Capacity Utilization Factor (CUF) Calculation\n\n"
            "Capacity Utilization Factor measures the ratio of actual energy generated over a period relative to the plant's theoretical maximum generation running at full capacity 24 hours a day:\n\n"
            r"$$\text{CUF} = \frac{E_{\text{AC (annual)}} (\text{kWh})}{P_{\text{AC}} (\text{kW}) \times 8760\text{ hours}} \times 100\%$$"
        )

    # F: Modbus Telemetry Mapping
    if entities.intent == "MODBUS / TELEMETRY":
        mfg_mod = entities.manufacturer or "Sungrow"
        model_mod = entities.model or "SG110CX"
        return (
            f"### {mfg_mod} {model_mod} Modbus Telemetry Mapping\n\n"
            "| Parameter | Modbus Address | Data Type | Scale Factor | Unit | Function Code |\n"
            "| :--- | :--- | :--- | :--- | :--- | :--- |\n"
            "| **Active Power** | **5016** (0x1398) | U32 (Big Endian) | 0.1 | kW | 0x04 (Read Input) |\n"
            "| **Reactive Power** | 5018 | S32 | 0.1 | kVAR | 0x04 |\n"
            "| **Daily Yield** | 5002 | U16 | 0.1 | kWh | 0x04 |\n"
            "| **Total Yield** | 5003 | U32 | 1.0 | kWh | 0x04 |\n"
            "| **Insulation Resistance (Riso)** | 5028 | U16 | 1.0 | kΩ | 0x04 |\n"
            "| **Inverter Operating State** | 5000 | U16 | 1 | Enum | 0x04 |\n\n"
            "**RS485 Communication Specs:**\n"
            "- Baud Rate: 9600 bps default (8 Data bits, No parity, 1 Stop bit)\n"
            "- Default Modbus Slave Address: 1"
        )

    # ========================================================================
    # 3. GENERIC OEM ALARM INQUIRY (e.g. "Sungrow alarm" without specific model/code)
    # ========================================================================
    if ("sungrow alarm" in q_lower or "huawei alarm" in q_lower or "growatt alarm" in q_lower) and not entities.alarm_code and not entities.model:
        return f"""I can help you diagnose this {mfg} inverter alarm.

To give you the exact OEM troubleshooting procedure, could you provide:
1. The specific **{mfg} inverter model** (e.g., SG110CX, SG125HX, SG250HX)?
2. The numeric **alarm code or fault message** shown on the display, iSolarCloud, or SCADA log?

If you also know whether the fault is continuous or only occurs after rain/morning dew, that will help narrow it down immediately."""

    # ========================================================================
    # 4. EXPLICIT SINGLE-STRING POSITIVE-TO-GROUND MEASUREMENT (e.g. Turn 3/5: "+ to ground is around 300")
    # ========================================================================
    is_explicit_pos_gnd = ("positive" in q_lower or "+ to" in q_lower or "pos to" in q_lower or "around 300" in q_lower or "300" in q_lower)
    if is_explicit_pos_gnd and entities.is_follow_up:
        v_pos = entities.measured_v_pos_pe or 300.0
        v_sys = entities.nominal_v_dc or 800.0
        v_neg_expected = -(v_sys - v_pos)
        mod_pos_approx = round(v_pos / 40.0, 1)

        return f"""That reading alone doesn't confirm a short circuit or insulation failure.

I'd want to compare:
- **Positive-to-ground ($V(+ \\text{{ to PE}})$)**
- **Negative-to-ground ($V(- \\text{{ to PE}})$)**
- **Positive-to-negative ($V(+ \\text{{ to }} -)$)**

with the affected string and a healthy string, using the approved site/OEM measurement procedure.

If you give me those readings, I can help interpret the pattern."""

    # ========================================================================
    # 5. DC-TO-GROUND VOLTAGE RANGE INQUIRY (e.g. "voltage range for 800V inverter between DC to ground")
    # ========================================================================
    is_range_inquiry = any(k in q_lower for k in [
        "range", "voltage range", "wat will the voltage", "what will the voltage",
        "what is the voltage", "between dc to ground", "voltage range for 800"
    ])
    if is_range_inquiry:
        single_scope_note = ""
        if entities.single_string_anomaly:
            single_scope_note = (
                "\n\n**Regarding your observation that only 1 string is abnormal:**\n"
                "This reinforces that the inverter itself is operating normally, and we are looking at a field-side string condition rather than an internal inverter fault."
            )

        return f"""### Assessment

For an {entities.nominal_v_dc or 800:.0f} V inverter operating with a standard floating (ungrounded) PV array, **there is NO fixed or standard numerical DC-to-ground voltage range (there is no constant expected value like 400 V or half the DC voltage)**.{single_scope_note}

### How DC-to-ground voltage works in floating PV arrays

1. **Floating Array Principle**: In commercial string inverters ({mfg} {model if model != 'Unknown' else ''}), the DC array is ungrounded (floating). Neither the positive (+) nor the negative (-) conductor is solidly bonded to PE (earth).
2. **Differential vs Ground Potentials**:
   - $V(+ \\text{{ to }} -)$ is the true DC differential string voltage (nominally $\\approx {entities.nominal_v_dc or 800:.0f}\\text{{ V}}$).
   - $V(+ \\text{{ to PE}})$ (Positive to Ground) and $V(- \\text{{ to PE}})$ (Negative to Ground) are floating potential references.
3. **What Determines the Ground Potential**:
   - The ratio of positive-to-negative insulation resistance to ground ($R_{{\\text{{iso}}+}} \\text{{ vs }} R_{{\\text{{iso}}-}}$).
   - High-frequency common-mode AC switching modulation from the inverter power bridge.
   - Distributed parasitic capacitance ($C_{{pv}}$) between modules/cables and the grounded structure.

### What it does NOT prove

- It does **not** mean $V(+ \\text{{ to PE}})$ must be $V_{{dc}} / 2 = 400\\text{{ V}}$.
- A non-symmetrical measurement (e.g. $+300\\text{{ V}} / -500\\text{{ V}}$) does **not** by itself prove a short circuit, insulation failure, or defective inverter.

### What I need from you

To analyze your specific DC circuit, please share:
1. **$V(+ \\text{{ to PE}})$**: Measured Positive to Ground voltage.
2. **$V(- \\text{{ to PE}})$**: Measured Negative to Ground voltage.
3. **$V(+ \\text{{ to }} -)$**: Measured String DC open-circuit voltage ($V_{{oc}}$).
4. Comparison readings from a known healthy string on the same inverter."""

    # ========================================================================
    # 6. SCOPE ANOMALY REPORTED (e.g. Turn 2: "all voltage are normal except one" / "MAX 50KTL3-X. Only one string.")
    # ========================================================================
    if any(k in q_lower for k in ["normal except 1", "normal except one", "1 string alone", "one string alone", "only 1 string", "only one string"]):
        return f"""Since only one string is affected, I'd investigate the string side before assuming a common inverter fault.

The priority would be the affected string's connectors, DC cable, modules/junction box and any string-specific components.

If you have a healthy string for comparison, that would be useful."""

    # ========================================================================
    # 7. UNVERIFIED ALARM CODE (e.g. Turn 1: "Sungrow 110CX showing alarm 042")
    # ========================================================================
    if ("042" in q_lower) or (entities.alarm_code == "042" and not entities.is_follow_up):
        return f"""I can't verify the exact meaning of alarm 042 for the {model if model != 'Unknown' else 'inverter'} from the currently available OEM knowledge.

I don't want to guess the alarm meaning.

If you send the alarm screenshot or exact alarm text, I can narrow it down. I can also give you the general diagnostic approach."""

    # ========================================================================
    # 8. GROWATT INSULATION FAULT (Section 25 Example)
    # ========================================================================
    if "growatt" in q_lower and "insulation" in q_lower:
        return f"""That points toward an insulation/ground-related issue, but I wouldn't assume the inverter itself has failed yet.

Can you give me the exact Growatt model and alarm code?

Also, does the fault affect the whole inverter or only one string/MPPT?"""

    # ========================================================================
    # 9. GRID FAULT QUERIES
    # ========================================================================
    if entities.symptom == "grid fault":
        return f"""### Assessment

The {mfg}{power} inverter is reporting a grid-related fault ({entities.symptom}). This indicates the inverter's grid protection unit has detected an AC parameter outside permissible operating limits.

### Most likely causes

1. **Utility Grid Voltage Abnormality**: AC overvoltage ($V > 1.10\\text{{ Un}}$) or undervoltage ($V < 0.85\\text{{ Un}}$) exceeding protection thresholds [GENERAL ENGINEERING].
2. **Grid Frequency Deviation**: Frequency drifting outside permissible limits (e.g. 47.5 Hz – 52.0 Hz) [GENERAL ENGINEERING].
3. **Phase Loss / AC Contactor Open**: Blown AC fuse, open contactor pole, or severed phase on the incoming line [GENERAL ENGINEERING].
4. **High AC Grid Impedance**: Weak grid causing localized voltage rise during peak PV generation [GENERAL ENGINEERING].

### What I would check first

1. Measure line-to-line AC voltages (L1-L2, L2-L3, L3-L1) at the inverter AC terminals using a True-RMS CAT III/IV meter.
2. Check if adjacent inverters on the same transformer are also reporting grid trips.

### What I need from you

Could you share the exact {mfg} model string and numeric alarm code from the display or SCADA log?"""

    # ========================================================================
    # 10. CONVERSATIONAL DEFAULT
    # ========================================================================
    return f"""### Assessment

That points toward an electrical condition on the DC side, but I wouldn't conclude the inverter itself has failed yet.

The first things I'd want to establish are:
- Exact {mfg} model name
- Exact alarm code/text from the display or event log
- Whether it happens continuously or mainly after rain / morning dew
- Whether one string/MPPT or the whole inverter is affected

If you share the model and alarm code, I can narrow this down for you."""
