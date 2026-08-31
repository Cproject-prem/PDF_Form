"""
FormForge Solar Support Engineer AI — Master Knowledge Management Engine (v2.0)
================================================================================
Implements Sections 2, 3, 4, 12, 33, 34, 35:
- Master Knowledge Schema for MongoDB collections
- Controlled Knowledge Types & Verification Levels
- Bulk JSON / ZIP Import Pipeline with Schema Validation & Upsert by knowledge_id
- OEM Import Protection (guards OEM_VERIFIED provenance)
- Batch Tracking, Rollback, and Export
"""

import os
import io
import json
import uuid
import zipfile
import tarfile
import tempfile
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple
from bson import ObjectId

logger = logging.getLogger("solar-knowledge-manager")

# Controlled Knowledge Types (Section 3)
CONTROLLED_KNOWLEDGE_TYPES = [
    "GENERAL_ENGINEERING",
    "OEM_VERIFIED",
    "USER_PROVIDED",
    "HISTORICAL_CASE",
    "CALCULATION",
    "PROCEDURE",
    "SAFETY",
    "DOCUMENT_EVIDENCE"
]

# Controlled Verification Levels (Section 4)
CONTROLLED_VERIFICATION_STATUSES = [
    "OEM_VERIFIED",
    "GENERAL_ENGINEERING_VERIFIED",
    "EXTRACTED_NEEDS_REVIEW",
    "AI_GENERATED",
    "NEEDS_REVIEW"
]

# Supported Collections (Section 12)
SUPPORTED_SOLAR_COLLECTIONS = [
    "manufacturers",
    "inverter_models",
    "oem_alarm_codes",
    "oem_troubleshooting_procedures",
    "modbus_registers",
    "fault_differential",
    "diagnostic_steps",
    "engineering_calculations",
    "solar_terminology",
    "safety_rules",
    "historical_incidents",
    "source_documents",
    "knowledge_import_batches",
    "ai_behavior_rules",
    "knowledge_chunks",
    "structured_knowledge"
]

# Master Knowledge Schema Template (Section 2)
def build_master_knowledge_record(
    raw_dict: Dict[str, Any],
    default_knowledge_type: str = "GENERAL_ENGINEERING",
    default_verification_status: str = "NEEDS_REVIEW"
) -> Dict[str, Any]:
    """Normalizes any incoming raw dictionary into the Master Knowledge Schema format."""
    now_iso = datetime.utcnow().isoformat()
    
    # 1. Knowledge ID (Section 34)
    k_id = raw_dict.get("knowledge_id") or raw_dict.get("id") or str(uuid.uuid4())
    
    # 2. Knowledge Type & Verification
    k_type = raw_dict.get("knowledge_type", default_knowledge_type)
    if k_type not in CONTROLLED_KNOWLEDGE_TYPES:
        k_type = "GENERAL_ENGINEERING"
        
    v_status = raw_dict.get("verification", {}).get("status") if isinstance(raw_dict.get("verification"), dict) else raw_dict.get("verification_status", default_verification_status)
    if v_status not in CONTROLLED_VERIFICATION_STATUSES:
        v_status = "NEEDS_REVIEW"

    # AI_GENERATED must NEVER automatically become OEM_VERIFIED (Section 4)
    if raw_dict.get("source_type") == "AI_GENERATED" or raw_dict.get("is_ai_generated"):
        v_status = "AI_GENERATED"

    # 3. Entity Extraction
    entity_raw = raw_dict.get("entity", {}) if isinstance(raw_dict.get("entity"), dict) else {}
    mfg = entity_raw.get("manufacturer") or raw_dict.get("manufacturer", "")
    model = entity_raw.get("model") or raw_dict.get("model", "")
    family = entity_raw.get("model_family") or raw_dict.get("model_family", "")
    product = entity_raw.get("product") or raw_dict.get("product", "")
    eq_type = entity_raw.get("equipment_type") or raw_dict.get("equipment_type", "inverter")
    power_kw = entity_raw.get("power_rating_kw") or raw_dict.get("power_rating_kw")

    # 4. Source & Provenance
    source_raw = raw_dict.get("source", {}) if isinstance(raw_dict.get("source"), dict) else {}
    src_doc = source_raw.get("document") or raw_dict.get("source_document") or raw_dict.get("manual", "")
    src_page = source_raw.get("page") or raw_dict.get("page") or raw_dict.get("source_page")
    src_type = source_raw.get("source_type") or raw_dict.get("source_type", "OEM_MANUAL")
    src_rev = source_raw.get("revision") or raw_dict.get("document_revision", "")

    # OEM Import Protection (Section 35)
    if v_status == "OEM_VERIFIED":
        if not src_doc or src_page is None or not mfg:
            v_status = "NEEDS_REVIEW"

    return {
        "knowledge_id": str(k_id),
        "knowledge_type": k_type,
        "domain": raw_dict.get("domain", "Solar PV"),
        "topic": raw_dict.get("topic", "Troubleshooting"),
        "subtopic": raw_dict.get("subtopic", ""),

        "entity": {
            "manufacturer": mfg,
            "product": product,
            "model": model,
            "model_family": family,
            "equipment_type": eq_type,
            "power_rating_kw": float(power_kw) if power_kw is not None else None
        },

        "user_intent": {
            "primary": raw_dict.get("user_intent", {}).get("primary", raw_dict.get("intent", "FAULT_DIAGNOSIS")),
            "secondary": raw_dict.get("user_intent", {}).get("secondary", ""),
            "confidence": raw_dict.get("user_intent", {}).get("confidence", 1.0)
        },

        "question_patterns": raw_dict.get("question_patterns", []),

        "concept": {
            "name": raw_dict.get("concept", {}).get("name", raw_dict.get("name", "")),
            "definition": raw_dict.get("concept", {}).get("definition", raw_dict.get("definition", "")),
            "aliases": raw_dict.get("concept", {}).get("aliases", []),
            "related_concepts": raw_dict.get("concept", {}).get("related_concepts", []),
            "not_same_as": raw_dict.get("concept", {}).get("not_same_as", [])
        },

        "facts": raw_dict.get("facts", []),
        "rules": raw_dict.get("rules", []),
        "conditions": raw_dict.get("conditions", []),

        "possible_causes": raw_dict.get("possible_causes", []),

        "diagnosis": {
            "symptoms": raw_dict.get("diagnosis", {}).get("symptoms", [raw_dict.get("symptom")] if raw_dict.get("symptom") else []),
            "observations": raw_dict.get("diagnosis", {}).get("observations", []),
            "hypotheses": raw_dict.get("diagnosis", {}).get("hypotheses", []),
            "confirmation_tests": raw_dict.get("diagnosis", {}).get("confirmation_tests", []),
            "decision_tree": raw_dict.get("diagnosis", {}).get("decision_tree", [])
        },

        "procedure": {
            "preconditions": raw_dict.get("procedure", {}).get("preconditions", []),
            "steps": raw_dict.get("procedure", {}).get("steps", [raw_dict.get("procedure")] if isinstance(raw_dict.get("procedure"), str) else (raw_dict.get("procedure") or [])),
            "expected_result": raw_dict.get("procedure", {}).get("expected_result", []),
            "if_abnormal": raw_dict.get("procedure", {}).get("if_abnormal", []),
            "next_step": raw_dict.get("procedure", {}).get("next_step", [])
        },

        "parameters": raw_dict.get("parameters", []),

        "calculations": {
            "formula": raw_dict.get("calculations", {}).get("formula", raw_dict.get("formula", "")),
            "variables": raw_dict.get("calculations", {}).get("variables", []),
            "example": raw_dict.get("calculations", {}).get("example", ""),
            "units": raw_dict.get("calculations", {}).get("units", ""),
            "assumptions": raw_dict.get("calculations", {}).get("assumptions", [])
        },

        "safety": {
            "level": raw_dict.get("safety", {}).get("level", "Standard"),
            "warnings": raw_dict.get("safety", {}).get("warnings", []),
            "required_ppe": raw_dict.get("safety", {}).get("required_ppe", ["Class 0 / 1000V rated gloves", "Safety glasses"]),
            "qualified_personnel_required": raw_dict.get("safety", {}).get("qualified_personnel_required", True)
        },

        "source": {
            "source_type": src_type,
            "document": src_doc,
            "revision": src_rev,
            "page": src_page,
            "section": source_raw.get("section", raw_dict.get("section", "")),
            "url": source_raw.get("url", "")
        },

        "verification": {
            "status": v_status,
            "confidence": raw_dict.get("verification", {}).get("confidence", 1.0 if v_status == "OEM_VERIFIED" else 0.8),
            "verified_by": raw_dict.get("verification", {}).get("verified_by", "Solar Engineering Review"),
            "verified_date": raw_dict.get("verification", {}).get("verified_date", now_iso)
        },

        "retrieval": {
            "keywords": raw_dict.get("retrieval", {}).get("keywords", raw_dict.get("keywords", [])),
            "embedding_text": raw_dict.get("retrieval", {}).get("embedding_text", ""),
            "priority": raw_dict.get("retrieval", {}).get("priority", 100 if v_status == "OEM_VERIFIED" else 50)
        },

        # Flat convenience fields for legacy query compatibility
        "manufacturer": mfg,
        "model": model,
        "alarm_code": raw_dict.get("alarm_code") or raw_dict.get("code"),
        "fault": raw_dict.get("fault") or raw_dict.get("symptom") or raw_dict.get("fault_name"),
        "meaning": raw_dict.get("meaning") or raw_dict.get("description"),
        "remedy": raw_dict.get("remedy") or raw_dict.get("action"),
        "source_document": src_doc,
        "page": src_page,
        "verification_status": v_status,

        "created_at": raw_dict.get("created_at", now_iso),
        "updated_at": now_iso
    }


def parse_json_payload(raw_bytes: bytes, filename: str) -> List[Tuple[str, List[Dict[str, Any]]]]:
    """Parses JSON or ZIP payload into a list of (collection_name, records)."""
    fn_lower = filename.lower()
    packages = []

    if fn_lower.endswith(".zip"):
        with zipfile.ZipFile(io.BytesIO(raw_bytes)) as z:
            for zip_fn in z.namelist():
                if zip_fn.lower().endswith(".json") and not zip_fn.startswith("__MACOSX"):
                    content = z.read(zip_fn)
                    coll_name = auto_detect_collection(zip_fn)
                    data = json.loads(content.decode("utf-8", errors="ignore"))
                    recs = data if isinstance(data, list) else [data]
                    packages.append((coll_name, recs))
    else:
        coll_name = auto_detect_collection(filename)
        data = json.loads(raw_bytes.decode("utf-8", errors="ignore"))
        recs = data if isinstance(data, list) else [data]
        packages.append((coll_name, recs))

    return packages


def auto_detect_collection(filename: str) -> str:
    """Heuristic filename to collection mapper."""
    fn = filename.lower()
    if "alarm" in fn: return "oem_alarm_codes"
    if "troubleshoot" in fn or "procedure" in fn: return "oem_troubleshooting_procedures"
    if "modbus" in fn or "register" in fn: return "modbus_registers"
    if "calculation" in fn or "formula" in fn: return "engineering_calculations"
    if "terminology" in fn or "term" in fn: return "solar_terminology"
    if "safety" in fn: return "safety_rules"
    if "model" in fn: return "inverter_models"
    if "incident" in fn or "rca" in fn: return "historical_incidents"
    if "rule" in fn: return "ai_behavior_rules"
    return "structured_knowledge"


def serialize_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Helper to convert ObjectId to string."""
    clean = {}
    for k, v in doc.items():
        if isinstance(v, ObjectId):
            clean[k] = str(v)
        elif isinstance(v, datetime):
            clean[k] = v.isoformat()
        elif isinstance(v, dict):
            clean[k] = serialize_doc(v)
        elif isinstance(v, list):
            clean[k] = [serialize_doc(i) if isinstance(i, dict) else (str(i) if isinstance(i, ObjectId) else i) for i in v]
        else:
            clean[k] = v
    return clean


class KnowledgeManager:
    """Handles bulk upsert, schema validation, and rollback tracking."""
    def __init__(self, db):
        self.db = db

    async def validate_batch(self, collection: str, records: List[Dict[str, Any]], mode: str = "UPSERT") -> Dict[str, Any]:
        """Validates records before writing to DB (Section 33)."""
        valid_count = 0
        needs_review_count = 0
        rejected_count = 0
        issues = []

        for idx, r in enumerate(records):
            if not isinstance(r, dict):
                rejected_count += 1
                issues.append(f"Row {idx+1}: Not a valid JSON object.")
                continue

            norm = build_master_knowledge_record(r)
            if norm["verification"]["status"] == "NEEDS_REVIEW":
                needs_review_count += 1
                if norm.get("verification_status") == "OEM_VERIFIED" and not norm.get("source_document"):
                    issues.append(f"Row {idx+1}: OEM_VERIFIED missing source_document/page.")
            else:
                valid_count += 1

        return {
            "collection": collection,
            "total_records": len(records),
            "valid_records": valid_count,
            "needs_review": needs_review_count,
            "rejected": rejected_count,
            "issues_sample": issues[:10],
            "is_valid": rejected_count == 0
        }

    async def execute_bulk_import(
        self,
        collection: str,
        records: List[Dict[str, Any]],
        mode: str = "UPSERT",
        filename: str = "upload.json",
        user_email: str = "system",
        source_type: str = "OEM_MANUAL",
        source_doc_override: Optional[str] = None
    ) -> Dict[str, Any]:
        """Executes bulk import with upsert by knowledge_id (Section 34 & 35)."""
        batch_id = f"BATCH-{int(time.time())}-{uuid.uuid4().hex[:6]}"
        now = datetime.utcnow()
        inserted = 0
        updated = 0
        skipped = 0
        rejected = 0
        needs_review = 0
        backup_log = []

        target_coll = self.db[collection]

        for r in records:
            if not isinstance(r, dict):
                rejected += 1
                continue

            if source_doc_override:
                r["source_document"] = source_doc_override

            norm = build_master_knowledge_record(r)
            if norm["verification"]["status"] == "NEEDS_REVIEW":
                needs_review += 1

            k_id = norm["knowledge_id"]

            # Check existing document by knowledge_id
            existing = await target_coll.find_one({"knowledge_id": k_id})

            if existing:
                backup_log.append({
                    "action": "UPDATE",
                    "knowledge_id": k_id,
                    "previous_doc": serialize_doc(existing)
                })
                if mode in ["UPSERT", "REPLACE", "MERGE"]:
                    await target_coll.replace_one({"knowledge_id": k_id}, norm)
                    updated += 1
                else:
                    skipped += 1
            else:
                backup_log.append({
                    "action": "INSERT",
                    "knowledge_id": k_id
                })
                await target_coll.insert_one(norm)
                inserted += 1

        # Record Import Batch in MongoDB (Section 12)
        batch_doc = {
            "batch_id": batch_id,
            "filename": filename,
            "collection": collection,
            "total_records": len(records),
            "inserted": inserted,
            "updated": updated,
            "skipped": skipped,
            "rejected": rejected,
            "needs_review": needs_review,
            "user_email": user_email,
            "upload_date": now,
            "backup_log": backup_log
        }
        await self.db.knowledge_import_batches.insert_one(batch_doc)

        return {
            "success": True,
            "batch_id": batch_id,
            "collection": collection,
            "total": len(records),
            "inserted": inserted,
            "updated": updated,
            "skipped": skipped,
            "rejected": rejected,
            "needs_review": needs_review,
            "message": f"Successfully processed {len(records)} records: {inserted} inserted, {updated} updated, {needs_review} flagged for review."
        }

    async def rollback_batch(self, batch_id: str, user_email: str = "system") -> Dict[str, Any]:
        """Rolls back an import batch using the stored backup log."""
        batch = await self.db.knowledge_import_batches.find_one({"batch_id": batch_id})
        if not batch:
            return {"success": False, "message": f"Batch {batch_id} not found."}

        target_coll = self.db[batch["collection"]]
        reverted = 0

        for item in batch.get("backup_log", []):
            k_id = item.get("knowledge_id")
            action = item.get("action")
            if action == "INSERT":
                await target_coll.delete_one({"knowledge_id": k_id})
                reverted += 1
            elif action == "UPDATE":
                prev = item.get("previous_doc", {})
                prev.pop("_id", None)
                await target_coll.replace_one({"knowledge_id": k_id}, prev, upsert=True)
                reverted += 1

        await self.db.knowledge_import_batches.update_one(
            {"batch_id": batch_id},
            {"$set": {"status": "ROLLED_BACK", "rolled_back_by": user_email, "rolled_back_at": datetime.utcnow()}}
        )

        return {
            "success": True,
            "batch_id": batch_id,
            "reverted_count": reverted,
            "message": f"Successfully rolled back batch {batch_id} ({reverted} operations reverted)."
        }

    async def export_knowledge(self, collection: Optional[str] = None, batch_id: Optional[str] = None, limit: int = 2000) -> List[Dict[str, Any]]:
        """Exports sanitized knowledge records as JSON."""
        colls = [collection] if collection else SUPPORTED_SOLAR_COLLECTIONS
        all_recs = []

        for c in colls:
            if c in await self.db.list_collection_names():
                query = {}
                docs = await self.db[c].find(query).limit(limit).to_list(length=limit)
                for d in docs:
                    d.pop("_id", None)
                    d["_collection"] = c
                    all_recs.append(d)

        return all_recs
