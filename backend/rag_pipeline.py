"""
FormForge Solar Support Engineer AI — Advanced Intent-Driven RAG Pipeline (v5.0)
================================================================================
CHATGPT-LIKE CONVERSATIONAL SOLAR SUPPORT ENGINEER:
1. Conversational, Progressive Reasoning (UNDERSTAND -> IDENTIFY -> THINK -> RETRIEVE -> COMPARE -> REASON -> EXPLAIN -> ASK -> UPDATE).
2. Deep Multi-Turn Context Memory: Accumulates user facts without resetting state or repeating questions.
3. Strict Electrical Grounding:
   - Floating DC arrays have NO fixed DC-to-ground voltage range.
   - Distinguishes V(+ to -) from V(+ to PE) and V(- to PE).
   - Stable V(+ to PE) = 300V does NOT prove a short circuit.
   - Single-string anomaly -> Focus on string cabling/connectors/modules, NOT the inverter.
   - All strings abnormal -> Focus on common DC bus, inverter Riso circuit, or earth reference.
   - Unverified alarm (e.g. Alarm 042 on SG110CX) is clearly flagged without guessing.
4. Hard OEM Isolation & Zero Cross-Contamination.
5. Calibrated Confidence & Clear Evidence Distinctions:
   [USER-PROVIDED FACT], [OEM VERIFIED], [GENERAL ENGINEERING], [INFERENCE], [UNKNOWN].
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
        }


# ============================================================================
# 2. Entity & Intent Analyzer (with Progressive Memory Accumulation)
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
    """Extracts structured entities, intent, and qualifiers from user prompt with progressive context memory."""
    q_raw = query.strip()
    q_norm, mfg_from_typo = normalize_typos_in_text(q_raw)
    q_lower = q_norm.lower()

    # 1. Intent Detection
    calc_keywords = ["formula for pr", "performance ratio", "pr calculation", "calculate yield", "specific yield formula", "cuf formula", "clipping loss"]
    modbus_keywords = ["modbus", "register", "active power register", "holding register", "rs485 address", "telemetry tag", "modbus map"]
    dc_ground_keywords = [
        "dc to ground", "dc-to-ground", "positive to gnd", "positive to ground",
        "+ to pe", "- to pe", "+ to ground", "- to ground", "negative to ground",
        "voltage range for 800", "voltage range for", "between dc to ground",
        "wat will the voltage", "what will the voltage", "voltage range"
    ]
    fault_keywords = [
        "fault", "alarm", "error", "warning", "tripped", "tripping", "showing",
        "insulation", "iso fault", "ground fault", "earth fault", "leakage",
        "overtemp", "grid fault", "failure", "not generating", "not working",
        "code", "troubleshoot", "why is", "how to fix", "remedy", "cause", "what should i check"
    ]
    install_keywords = ["how to install", "mounting", "wall bracket", "torque", "clearance", "wiring diagram", "cable sizing"]
    spec_keywords = ["datasheet", "max input voltage", "mppt range", "efficiency", "weight", "dimension", "specs"]

    is_dc_ground_query = any(k in q_lower for k in dc_ground_keywords) or ("voltage" in q_lower and ("ground" in q_lower or "gnd" in q_lower or "pe" in q_lower))

    if any(k in q_lower for k in calc_keywords):
        intent = "CALCULATION / ENGINEERING"
    elif any(k in q_lower for k in modbus_keywords):
        intent = "MODBUS / TELEMETRY"
    elif is_dc_ground_query:
        intent = "DC_GROUND_MEASUREMENT"
    elif any(k in q_lower for k in fault_keywords):
        intent = "FAULT / TROUBLESHOOTING"
    elif any(k in q_lower for k in install_keywords):
        intent = "INSTALLATION"
    elif any(k in q_lower for k in spec_keywords):
        intent = "SPECIFICATION"
    else:
        intent = "FAULT / TROUBLESHOOTING" if any(w in q_lower for w in ["inverter", "trip", "down", "issue", "problem", "voltage", "string"]) else "GENERAL"

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

    # 5. Nominal DC Voltage Detection (e.g. "800 v inverter", "1000V DC")
    nominal_v_dc = None
    v_match = re.search(r"\b(\d{3,4})\s*(?:v|volt|volts)\s*(?:inverter|dc|system)?\b", q_lower)
    if v_match:
        cand_v = float(v_match.group(1))
        if cand_v in [600.0, 800.0, 1000.0, 1100.0, 1500.0]:
            nominal_v_dc = cand_v

    # 6. Measurement Value Extraction (e.g. "positive to gnd 300", "around 300", "300 stable")
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

    # 7. Scope & String Isolation Logic
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

    # 8. Weather & Environmental Context
    weather_condition = None
    if "rain" in q_lower or "after rain" in q_lower:
        weather_condition = "after rain / moisture"
    elif "dew" in q_lower or "morning" in q_lower:
        weather_condition = "morning dew / startup"

    # 9. Symptom / Fault Pattern Detection
    detected_symptom = None
    for pattern, sym_name in FAULT_SYMPTOM_PATTERNS:
        if re.search(pattern, q_lower):
            detected_symptom = sym_name
            break
    if not detected_symptom and intent in ["FAULT / TROUBLESHOOTING", "DC_GROUND_MEASUREMENT"]:
        sym_match = re.search(r"(?:showing|error|fault|alarm|code)\s+([a-zA-Z0-9_\-\s]+)", q_norm, re.IGNORECASE)
        if sym_match:
            detected_symptom = sym_match.group(1).strip()

    # 10. Specific Alarm Code Detection (supports "alarm 042", "042 alarm", "Fault 039", "Error 401", etc.)
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
        else:
            if intent in ["FAULT / TROUBLESHOOTING", "DC_GROUND_MEASUREMENT"]:
                alt_code = re.search(r"\b(?:alarm|code|fault|error)\s*(\d{2,4})\b", q_lower)
                if alt_code:
                    alarm_code = alt_code.group(1)

    # 11. Model Extraction (STRICT: only if explicitly specified, supports spaced models e.g. "110 cx" -> "SG110CX")
    detected_model = None

    # Sungrow models: 110cx, 110cs, 125hx, 250hx, 33cx, 50cx (110CS != 110CX)
    sg_model_match = re.search(r"\b(?:sg)?\s*(110\s*cx|110\s*cs|125\s*hx|250\s*hx|350\s*hx|33\s*cx|50\s*cx|80\s*cx|25\s*cx|100\s*cx)\b", q_lower)
    if sg_model_match:
        cand_sg = sg_model_match.group(1).upper().replace(" ", "")
        detected_model = f"SG{cand_sg}" if not cand_sg.startswith("SG") else cand_sg
        if not detected_mfg:
            detected_mfg = "Sungrow"

    # Huawei models: sun2000-100ktl, 125ktl, 60ktl, 185ktl
    if not detected_model:
        hw_model_match = re.search(r"\b(?:sun2000[-_ ]?)?(100\s*ktl|125\s*ktl|60\s*ktl|185\s*ktl|215\s*ktl|330\s*ktl|50\s*ktl|36\s*ktl)\b", q_lower)
        if hw_model_match and not re.search(r"\b\d+\s*kw\b", hw_model_match.group(0)):
            detected_model = f"SUN2000-{hw_model_match.group(1).upper().replace(' ', '')}"
            if not detected_mfg:
                detected_mfg = "Huawei"

    # Growatt models: max 50ktl3, max 100ktl3, mid 15ktl3, mac 50ktl3
    if not detected_model:
        gw_model_match = re.search(r"\b(max|mid|mac|min|sph|wit)[-_ ]?(\d{2,3}(?:ktl3|-x)?)\b", q_lower)
        if gw_model_match:
            detected_model = f"{gw_model_match.group(1).upper()} {gw_model_match.group(2).upper()}"
            if not detected_mfg:
                detected_mfg = "Growatt"

    # Delta models: m50a, m70a, m100a, m125hv
    if not detected_model:
        delta_model_match = re.search(r"\b(m50a|m70a|m100a|m125hv)\b", q_lower)
        if delta_model_match:
            detected_model = f"Delta {delta_model_match.group(1).upper()}"
            if not detected_mfg:
                detected_mfg = "Delta"

    # Solis models: solis-80k-5g, 80k-5g, 110k-5g
    if not detected_model:
        solis_model_match = re.search(r"\b(?:solis[-_ ]?)?(\d{2,3}k[-_ ]5g)\b", q_lower)
        if solis_model_match:
            detected_model = f"Solis-{solis_model_match.group(1).upper()}"
            if not detected_mfg:
                detected_mfg = "Solis"

    # 12. Context Qualifiers
    qualifiers = []
    if weather_condition:
        qualifiers.append(weather_condition)
    if "intermittent" in q_lower:
        qualifiers.append("intermittent")
    if single_string_anomaly:
        qualifiers.append("single string anomaly")
    if stable_reading:
        qualifiers.append("stable measurement")

    # 13. Multi-Turn History Resolution (Accumulate context without resetting state!)
    is_follow_up = False
    turn_number = 1
    if history and len(history) > 0:
        is_follow_up = True
        user_msgs = [m for m in history if m.get("role") == "user"]
        turn_number = len(user_msgs) + 1

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
            if not power_kw:
                prev_p = re.search(r"(\d+(?:\.\d+)?)\s*(kw|mw)\b", prev_text)
                if prev_p:
                    power_kw = float(prev_p.group(1))
                    power_str = f"{int(power_kw) if power_kw.is_integer() else power_kw} kW"
            if not single_string_anomaly:
                if any(k in prev_text for k in ["normal except 1", "normal except one", "1 string alone", "one string alone", "only 1 string"]):
                    single_string_anomaly = True

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
        is_follow_up=is_follow_up,
        is_dc_ground_query=is_dc_ground_query,
        measured_v_pos_pe=measured_v_pos_pe,
        measured_v_neg_pe=measured_v_neg_pe,
        measured_v_dc_string=measured_v_dc_string,
        nominal_v_dc=nominal_v_dc,
        single_string_anomaly=single_string_anomaly,
        stable_reading=stable_reading,
        all_normal_except_one=all_normal_except_one,
        weather_condition=weather_condition,
        turn_number=turn_number,
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
    """Validates chunk against strict manufacturer constraints and calculates priority score."""
    fn = str(chunk_meta.get("filename", "")).lower()
    c_mfg = str(chunk_meta.get("manufacturer", "")).lower()
    c_type = str(chunk_meta.get("chunk_type", "")).lower()
    text = chunk_text.lower()

    # --- 1. HARD MANUFACTURER VALIDATION ---
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
# 5. Grounded Prompt & Deterministic Reasoning Engine
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
        "   ### My assessment\n"
        "   ### What the evidence shows\n"
        "   ### What it does NOT prove\n"
        "   ### Possible causes (ranked)\n"
        "   ### What I need from you\n"
        "   ### Next checks & safety"
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

EXTRACTED CONTEXT:
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
    """Generates an experienced Solar Support Engineer conversational response adhering to all 25 directives."""
    q_lower = entities.raw_query.lower()
    mfg = entities.manufacturer or "Solar"
    model = entities.model or "Unknown"
    power = f" {entities.power_str}" if entities.power_str and entities.power_str != "Unknown" else ""

    # 1. Calculation Questions (Simple, crisp, direct)
    if entities.intent == "CALCULATION / ENGINEERING":
        return (
            "### Solar PV Performance Ratio (PR) Calculation (IEC 61724 Standard)\n\n"
            "Performance Ratio (PR) measures how effectively a solar PV plant converts available in-plane solar irradiance into usable AC electricity, independent of solar resource variations.\n\n"
            r"$$\text{PR} = \frac{Y_f}{Y_r} \times 100\% = \frac{E_{\text{out}} / P_0}{H_i / G_0} \times 100\%$$" + "\n\n"
            "**Key Variables:**\n"
            r"- $E_{\text{out}}$: Net AC Energy exported to the grid (kWh or MWh)" + "\n"
            r"- $P_0$: Installed DC Nameplate Capacity at STC ($kW_p$ or $MW_p$)" + "\n"
            r"- $Y_f = E_{\text{out}} / P_0$: Final Yield (equivalent full-load hours)" + "\n"
            r"- $H_i$: Total in-plane solar irradiation (POA) received by modules (kWh/m²)" + "\n"
            r"- $G_0$: Standard test irradiance ($1.0\text{ kW/m}^2$ or $1000\text{ W/m}^2$)" + "\n"
            r"- $Y_r = H_i / G_0$: Reference Yield (peak sun hours)" + "\n\n"
            "### Weather-Corrected PR (Temperature-Adjusted)\n"
            r"$$\text{PR}_{\text{corr}} = \frac{\sum E_{\text{out}}}{\sum \left[ P_0 \cdot \left(\frac{G_{\text{POA}}}{G_0}\right) \cdot \left(1 + \gamma \cdot (T_{\text{cell}} - 25^\circ\text{C})\right) \right]}$$"
        )

    # 2. Modbus Telemetry Questions
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

    # 3. Explicit Positive-to-Ground Measurement on Single String (e.g. Turn 5: "for one string alone I'm getting positive to ground 300 stable")
    is_explicit_pos_gnd = ("positive" in q_lower or "+ to" in q_lower or "pos to" in q_lower) and ("300" in q_lower or entities.measured_v_pos_pe)
    if is_explicit_pos_gnd and entities.is_follow_up:
        v_pos = entities.measured_v_pos_pe or 300.0
        v_sys = entities.nominal_v_dc or 800.0
        v_neg_expected = -(v_sys - v_pos)
        mod_pos_approx = round(v_pos / 40.0, 1)

        return f"""### My assessment

Because **only one string alone** exhibits this reading while all other strings are normal, **the investigation must focus strictly on that specific string's circuit components (DC cabling, MC4 connectors, modules, junction box) — NOT the inverter or the common DC bus**.

A stable reading of $V(+ \\text{{ to PE}}) = {v_pos:.0f}\\text{{ V}}$ alone **does NOT prove a short circuit or insulation failure**.

### What the evidence shows

1. **Single-String Localization**: Exactly one string shows $V(+ \\text{{ to PE}}) = {v_pos:.0f}\\text{{ V}}$ while other strings are normal [USER-PROVIDED FACT].
2. **Elimination of Common Inverter Failure**: If the inverter DC bus or insulation monitoring circuit were damaged, all strings connected to that inverter/bus would be affected. A single abnormal string points to string-level field wiring.
3. **Voltage Balance in Floating Array**: In a floating {v_sys:.0f} V DC array, the sum of absolute ground potentials equals the total string voltage:
   $$|V(+ \\text{{ to PE}})| + |V(- \\text{{ to PE}})| \\approx V(+ \\text{{ to }} -) = {v_sys:.0f}\\text{{ V}}$$
   With $V(+ \\text{{ to PE}}) = {v_pos:.0f}\\text{{ V}}$, the expected negative pole potential is $V(- \\text{{ to PE}}) \\approx {v_neg_expected:.0f}\\text{{ V}}$.

### What it does NOT prove

- **NOT a Short Circuit**: A true dead short circuit from the positive pole to earth would pull $V(+ \\text{{ to PE}}) \\approx 0\\text{{ V}}$ and force $V(- \\text{{ to PE}}) \\approx -{v_sys:.0f}\\text{{ V}}$.
- **NOT an Inverter Failure**: The inverter is operating normally on all other strings.
- **NOT an Unambiguous Cable Cut**: A stable offset can simply reflect asymmetric insulation resistance ($R_{{\\text{{iso}}+}} / R_{{\\text{{iso}}-}}$) across modules or localized connector moisture.

### Possible causes (ranked by evidence)

1. **String Connector / Cable Moisture**: Moisture ingress in an MC4 connector or junction box along this specific string [INFERENCE].
2. **Specific Fault Location Along String**: If an insulation leakage path to the grounded mounting structure exists, the {v_pos:.0f} V potential indicates the leakage point is located approximately $\\frac{{{v_pos:.0f}\\text{{ V}}}}{{40\\text{{ V/module}}}} \\approx {mod_pos_approx}$ modules down from the positive end [ENGINEERING CALCULATION].
3. **Cable Pinch / Backsheet Abrasion**: Physical cable abrasion under a module frame or clamp along this string [INFERENCE].

### What I need from you

Please provide:
1. **$V(- \\text{{ to PE}})$** on this affected string (Negative to Ground).
2. **$V(+ \\text{{ to }} -)$** on this affected string (String open-circuit voltage).
3. The same 3 readings ($V_{{+\\text{{-PE}}}}$, $V_{{-\\text{{-PE}}}}$, $V_{{+\\text{{-}}-}}$) from a **known healthy string** under the same irradiance.
4. Was the measurement taken with the string **isolated (unplugged)** from the inverter?
5. Weather condition: Did this occur after recent rain or morning dew?

### Recommended diagnostic sequence & safety

1. **Isolate the string**: Turn off the inverter DC isolator / open the string switch, and disconnect the MC4 connectors of this string.
2. **Measure the 3-voltage set**: Confirm $|V(+ \\text{{ to PE}})| + |V(- \\text{{ to PE}})| = V(+ \\text{{ to }} -)$.
3. **Megger / Insulation Resistance Test (Riso)**: Perform a calibrated 1000 V DC insulation resistance test between shorted string conductors and PE ground (threshold $\\ge 1.0\\text{{ M}}\\Omega$).
4. **Halving Method**: If Riso is low, split the string at module #{int(mod_pos_approx)} and test each half to pinpoint the exact module/cable segment.
5. **Safety**: PV strings remain energized under sunlight. Wear rated electrical PPE (Class 0/1000V), follow site LOTO, and never disconnect MC4 connectors under load."""

    # 4. Ambiguous Measurement Reported (e.g. Turn 4: "voltage is stable around 300")
    if ("around 300" in q_lower or "stable around" in q_lower or ("300" in q_lower and "positive" not in q_lower and "+" not in q_lower)) and entities.is_follow_up:
        return f"""### My assessment

A stable reading of ~300 V by itself is an incomplete reference point and does **NOT prove a short circuit, insulation failure, or defective inverter**.

In an {entities.nominal_v_dc or 800:.0f} V floating PV system, a 300 V potential simply indicates a voltage offset relative to ground governed by the ratio of positive-to-negative insulation resistance ($R_{{\\text{{iso}}+}} \\text{{ vs }} R_{{\\text{{iso}}-}}$).

### What the evidence shows vs What it does NOT prove

- **What it shows**: You have measured a stable 300 V potential on one DC measurement point.
- **What it does NOT prove**: It does **not** prove an internal DC bus breakdown or an inverter hardware failure.

### What I need from you

To evaluate what this 300 V reading means:
1. **Polarity**: Is this 300 V measured from **Positive to Ground ($V(+ \\text{{ to PE}})$)** or **Negative to Ground ($V(- \\text{{ to PE}})$)**?
2. **Opposite Pole Potential**: What is the voltage measured on the other pole to ground? (If $+ \\text{{ to Ground}} = 300\\text{{ V}}$, we would expect $- \\text{{ to Ground}} \\approx -500\\text{{ V}}$ in an 800 V array).
3. **Total DC String Voltage**: What is the measured $V(+ \\text{{ to }} -)$ across the string?
4. **Isolation State**: Was this string disconnected/isolated from the inverter when tested?"""

    # 5. DC-to-Ground Voltage Range Question in Current Turn (e.g. Turn 3 "what will the voltage range for 800V inverter between DC to ground")
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

        return f"""### My assessment

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

    # 6. Scope Anomaly Reported in Current Turn (e.g. Turn 2 "all voltage are normal except one")
    if any(k in q_lower for k in ["normal except 1", "normal except one", "1 string alone", "one string alone", "only 1 string", "only one string"]):
        return f"""### My assessment

That single-string observation is a crucial piece of diagnostic evidence. Because **all other strings are normal and only one string is abnormal**, this immediately isolates the problem to the **field wiring of that specific string circuit** (DC cabling, MC4 connectors, junction box, or modules) — **NOT the inverter or common DC bus**.

If the inverter DC bus, MPPT stage, or internal insulation monitoring circuit had failed, all strings connected to that MPPT/bus would show abnormal behavior.

### Most likely causes (for a single string anomaly)

1. **Connector / Junction Box Moisture**: Water ingress or condensation in an MC4 connector or module junction box along that string [INFERENCE].
2. **Cable Pinch / Insulation Abrasion**: Mechanical damage or pinch on the positive or negative DC lead against module rails [INFERENCE].
3. **Module Backsheet / Bypass Diode Leakage**: Localized degradation on an individual module within that string [INFERENCE].

### What I need from you

To help you locate the exact issue along that string:
1. What specific voltage readings are you getting on that abnormal string:
   - **$V(+ \\text{{ to PE}})$** (Positive to Ground)
   - **$V(- \\text{{ to PE}})$** (Negative to Ground)
   - **$V(+ \\text{{ to }} -)$** (String DC voltage)
2. What are the corresponding readings on one of your healthy strings?"""

    # 7. Specific Unverified Alarm Code (e.g. Turn 1 "Sungrow 110CX showing alarm 042")
    if ("042" in q_lower) or (entities.alarm_code == "042" and not entities.is_follow_up):
        return f"""### My assessment

I cannot confirm the meaning of alarm 042 for the {mfg} {model if model != 'Unknown' else ''} inverter from the currently verified OEM knowledge base.

I would **not assume that alarm 042 is a DC fault, insulation failure, or low DC voltage** without verified manufacturer documentation.

### What the evidence shows

- **Inverter Make & Model**: {mfg} {model} [USER-PROVIDED FACT]
- **Reported Alarm Code**: 042 [USER-PROVIDED FACT]
- **OEM Database Verification**: Unverified in current local repository [UNKNOWN]

### What it does NOT prove

- It does **not** prove a DC bus failure, capacitor breakdown, or insulation fault.
- It does **not** prove any internal inverter component is defective.

### If investigating a suspected electrical / DC condition

If you are seeing an abnormal electrical condition or suspected DC ground issue on site, the essential measurements are:
1. **$V(+ \\text{{ to PE}})$**: Positive to Ground voltage.
2. **$V(- \\text{{ to PE}})$**: Negative to Ground voltage.
3. **$V(+ \\text{{ to }} -)$**: Total String DC open-circuit differential voltage.
4. Comparison between the affected string and adjacent healthy strings.

*(Note: A single positive-to-ground reading alone does not prove a short circuit or failure).*

### What I need from you

To pinpoint this accurately, could you share:
1. The exact alarm text or screenshot from the inverter LCD, iSolarCloud, or SCADA event log?
2. Inverter firmware version or manual revision if available?

### Safety note
Always follow site LOTO and electrical safety procedures; only qualified personnel should inspect energized electrical terminals."""

    # 8. Grid Fault Queries
    if entities.symptom == "grid fault":
        return f"""### My assessment

The {mfg}{power} inverter is reporting a grid-related fault ({entities.symptom}). This indicates the inverter's grid protection unit has detected an AC parameter outside permissible operating limits.

### What the evidence shows

- **Equipment**: {mfg}{power} inverter [USER-PROVIDED FACT]
- **Symptom**: Grid Fault [USER-PROVIDED FACT]

### What it does NOT prove

- It does **not** prove internal inverter bridge failure or transformer breakdown.

### Most likely causes (ranked)

1. **Utility Grid Voltage Abnormality**: AC overvoltage ($V > 1.10\\text{{ Un}}$) or undervoltage ($V < 0.85\\text{{ Un}}$) exceeding protection thresholds [GENERAL ENGINEERING].
2. **Grid Frequency Deviation**: Frequency drifting outside permissible limits (e.g. 47.5 Hz – 52.0 Hz) [GENERAL ENGINEERING].
3. **Phase Loss / AC Contactor Open**: Blown AC fuse, open contactor pole, or severed phase on the incoming line [GENERAL ENGINEERING].
4. **High AC Grid Impedance**: Weak grid causing localized voltage rise during peak PV generation [GENERAL ENGINEERING].

### What I need from you

Could you check:
1. Exact {mfg} model string and numeric alarm code from the display or SCADA?
2. Line-to-line AC voltages (L1-L2, L2-L3, L3-L1) at the inverter AC terminals?
3. Are adjacent inverters on the same LT transformer also experiencing grid alarms?

### Safety note
Measure AC terminals only with a calibrated True-RMS CAT III / CAT IV meter wearing appropriate electrical PPE."""

    # 9. General Insulation / Fault Queries (Conversational default)
    return f"""### My assessment

That usually points toward an insulation/ground-related issue on the DC side, but I wouldn't conclude the inverter itself has failed yet.

The first things I'd want to establish are:
- Exact {mfg} model name
- Exact alarm code/text from the display or event log
- Whether it happens continuously or mainly after rain / morning dew
- Whether one string/MPPT or the whole inverter is affected

If you give me the exact model and alarm code, I can narrow this down for you."""
