"""
FormForge Solar Support Engineer AI - MongoDB Knowledge Management Engine
Handles Bulk JSON/ZIP upload, collection auto-detection, schema normalization,
logical duplicate detection, 4 update modes (INSERT_ONLY, UPSERT, MERGE, REPLACE),
batch tracking, rollback, and JSON export.
"""

import os
import json
import uuid
import zipfile
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple
from bson import ObjectId

logger = logging.getLogger("solar-knowledge-manager")

# Whitelist of supported Solar Knowledge collections
SUPPORTED_SOLAR_COLLECTIONS = [
    "manufacturers",
    "inverter_models",
    "inverter_parameters",
    "oem_alarm_codes",
    "oem_troubleshooting_procedures",
    "modbus_registers",
    "fault_differential",
    "diagnostic_steps",
    "scada_tags",
    "engineering_calculations",
    "safety_rules",
    "historical_incidents",
    "firmware_revisions",
    "source_documents",
    "pdf_manifest",
    "vision_fault_patterns",
    "response_templates",
    "training_cases",
    "knowledge_chunks",
    "structured_knowledge",
    "ai_knowledge_rules"
]

# Logical unique key definitions per collection for duplicate detection & upsert
COLLECTION_UNIQUE_KEYS = {
    "oem_alarm_codes": ["manufacturer", "model", "alarm_code", "document_revision"],
    "modbus_registers": ["manufacturer", "model", "register", "document_revision"],
    "inverter_models": ["manufacturer", "model"],
    "inverter_parameters": ["manufacturer", "model", "parameter", "document_revision"],
    "oem_troubleshooting_procedures": ["manufacturer", "model", "fault", "fault_code"],
    "fault_differential": ["manufacturer", "model", "fault"],
    "diagnostic_steps": ["manufacturer", "model", "symptom"],
    "scada_tags": ["manufacturer", "model", "tag_name"],
    "engineering_calculations": ["calculation_name", "formula_key"],
    "safety_rules": ["rule_key", "equipment_type"],
    "historical_incidents": ["plant", "equipment", "incident_date", "incident_reference"],
    "firmware_revisions": ["manufacturer", "model", "firmware_version"],
    "source_documents": ["manufacturer", "model", "document_name", "document_revision"],
    "pdf_manifest": ["filename", "checksum"],
    "vision_fault_patterns": ["pattern_key", "equipment_type"],
    "response_templates": ["template_key"],
    "training_cases": ["case_code"],
    "knowledge_chunks": ["chunk_id"],
    "structured_knowledge": ["manufacturer", "model", "parameter", "alarm"]
}

# Filename pattern heuristics for collection auto-detection
FILENAME_COLLECTION_MAP = {
    "alarm": "oem_alarm_codes",
    "modbus": "modbus_registers",
    "register": "modbus_registers",
    "inverter_model": "inverter_models",
    "model": "inverter_models",
    "parameter": "inverter_parameters",
    "spec": "inverter_parameters",
    "troubleshoot": "oem_troubleshooting_procedures",
    "procedure": "oem_troubleshooting_procedures",
    "differential": "fault_differential",
    "diagnostic": "diagnostic_steps",
    "scada": "scada_tags",
    "calculation": "engineering_calculations",
    "safety": "safety_rules",
    "incident": "historical_incidents",
    "rca": "historical_incidents",
    "case": "training_cases",
    "firmware": "firmware_revisions",
    "document": "source_documents",
    "manual": "source_documents",
    "manifest": "pdf_manifest",
    "vision": "vision_fault_patterns",
    "template": "response_templates",
    "rule": "ai_knowledge_rules",
    "chunk": "knowledge_chunks"
}


def serialize_doc(doc: Any) -> Any:
    """Recursively serializes ObjectIds and datetimes for JSON outputs."""
    if isinstance(doc, dict):
        return {k: serialize_doc(v) for k, v in doc.items()}
    elif isinstance(doc, list):
        return [serialize_doc(i) for i in doc]
    elif isinstance(doc, ObjectId):
        return str(doc)
    elif isinstance(doc, datetime):
        return doc.isoformat()
    return doc


def generate_knowledge_id(collection: str, record: Dict[str, Any]) -> str:
    """Generates a stable, human-readable knowledge ID if not present."""
    if record.get("knowledge_id"):
        return str(record["knowledge_id"])

    mfr = (record.get("manufacturer") or "GEN").replace(" ", "").upper()[:4]
    mdl = (record.get("model") or "ALL").replace(" ", "").replace("-", "").upper()[:6]
    code = (
        record.get("alarm_code") or
        record.get("register") or
        record.get("parameter") or
        record.get("rule_key") or
        record.get("fault_code") or
        record.get("case_code") or
        uuid.uuid4().hex[:6]
    ).replace(" ", "").upper()[:10]

    prefix = collection.split("_")[0].upper()[:4]
    return f"SOL-{prefix}-{mfr}-{mdl}-{code}"


def auto_detect_collection(filename: str, json_content: Any) -> str:
    """Determines target collection from JSON structure, explicit fields, or filename."""
    # 1. Explicit package field
    if isinstance(json_content, dict) and json_content.get("collection"):
        coll = json_content["collection"].lower().strip()
        if coll in SUPPORTED_SOLAR_COLLECTIONS:
            return coll

    # 2. Filename heuristic
    clean_fn = os.path.splitext(os.path.basename(filename))[0].lower()
    for pattern, coll in FILENAME_COLLECTION_MAP.items():
        if pattern in clean_fn:
            return coll

    # 3. Content signature inspection
    sample = {}
    if isinstance(json_content, list) and json_content:
        sample = json_content[0] if isinstance(json_content[0], dict) else {}
    elif isinstance(json_content, dict):
        records = json_content.get("records") or json_content.get("data")
        if isinstance(records, list) and records:
            sample = records[0]
        else:
            sample = json_content

    if sample:
        keys = set(sample.keys())
        if "register" in keys or "modbus_address" in keys:
            return "modbus_registers"
        if "alarm_code" in keys and ("action" in keys or "procedure" in keys):
            return "oem_troubleshooting_procedures"
        if "alarm_code" in keys:
            return "oem_alarm_codes"
        if "rated_power_kw" in keys or "max_dc_voltage" in keys or "mppt_count" in keys:
            return "inverter_models"
        if "parameter" in keys and "value" in keys:
            return "inverter_parameters"
        if "actual_cause" in keys or "incident_date" in keys:
            return "historical_incidents"
        if "rule_key" in keys or "rule_type" in keys:
            return "ai_knowledge_rules"
        if "diagnostic_steps" in keys or "symptom" in keys:
            return "diagnostic_steps"

    return "knowledge_chunks"


def parse_json_payload(raw_bytes: bytes, filename: str) -> List[Tuple[str, List[Dict[str, Any]]]]:
    """
    Parses JSON bytes or ZIP archive containing JSONs.
    Returns list of (target_collection, records_list).
    """
    results = []

    # Check if ZIP file
    if filename.lower().endswith(".zip"):
        import io
        with zipfile.ZipFile(io.BytesIO(raw_bytes)) as z:
            for zip_fn in z.namelist():
                if zip_fn.lower().endswith(".json") and not zip_fn.startswith("__MACOSX"):
                    try:
                        content = json.loads(z.read(zip_fn).decode("utf-8"))
                        coll, recs = _extract_records_from_obj(content, zip_fn)
                        if recs:
                            results.append((coll, recs))
                    except Exception as e:
                        logger.error(f"Failed to parse {zip_fn} inside zip: {e}")
    else:
        # Standard JSON file
        content = json.loads(raw_bytes.decode("utf-8"))
        coll, recs = _extract_records_from_obj(content, filename)
        if recs:
            results.append((coll, recs))

    return results


def _extract_records_from_obj(content: Any, filename: str) -> Tuple[str, List[Dict[str, Any]]]:
    """Helper to extract normalized records list and collection name from parsed JSON."""
    detected_coll = auto_detect_collection(filename, content)

    if isinstance(content, list):
        recs = [r for r in content if isinstance(r, dict)]
        return detected_coll, recs
    elif isinstance(content, dict):
        if "records" in content and isinstance(content["records"], list):
            coll = content.get("collection") or detected_coll
            return coll, [r for r in content["records"] if isinstance(r, dict)]
        elif "data" in content and isinstance(content["data"], list):
            coll = content.get("collection") or detected_coll
            return coll, [r for r in content["data"] if isinstance(r, dict)]
        else:
            # Single object
            coll = content.get("collection") or detected_coll
            clean_obj = {k: v for k, v in content.items() if k != "collection"}
            return coll, [clean_obj]
    return detected_coll, []


def build_unique_query(collection: str, record: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Builds MongoDB query dict for logical unique key match."""
    # 1. Match by knowledge_id if provided
    if record.get("knowledge_id"):
        return {"knowledge_id": str(record["knowledge_id"])}

    # 2. Match by defined unique keys for collection
    unique_fields = COLLECTION_UNIQUE_KEYS.get(collection)
    if unique_fields:
        query = {}
        for f in unique_fields:
            val = record.get(f)
            if val is not None and val != "":
                query[f] = val
        if len(query) >= 2:  # Need at least 2 fields for a reliable compound match
            return query

    # 3. Match by manufacturer + model + name/code
    mfr = record.get("manufacturer")
    mdl = record.get("model")
    code = record.get("alarm_code") or record.get("register") or record.get("parameter") or record.get("fault")
    if mfr and mdl and code:
        return {"manufacturer": mfr, "model": mdl}

    return None


class KnowledgeManager:
    """Handles execution of bulk knowledge validation, upserts, merges, rollback, and export."""

    def __init__(self, db):
        self.db = db

    async def validate_batch(
        self,
        collection: str,
        records: List[Dict[str, Any]],
        mode: str = "UPSERT"
    ) -> Dict[str, Any]:
        """Validates records before committing, detecting new vs existing duplicates."""
        new_count = 0
        update_count = 0
        duplicate_count = 0
        invalid_count = 0
        errors = []
        sample_preview = []

        for idx, rec in enumerate(records):
            if not isinstance(rec, dict) or len(rec) == 0:
                invalid_count += 1
                errors.append(f"Record #{idx+1}: Empty or invalid object")
                continue

            query = build_unique_query(collection, rec)
            is_existing = False
            if query:
                try:
                    exists = await self.db[collection].find_one(query)
                    is_existing = bool(exists)
                except Exception:
                    pass

            if is_existing:
                if mode == "INSERT_ONLY":
                    duplicate_count += 1
                else:
                    update_count += 1
            else:
                new_count += 1

            if len(sample_preview) < 5:
                sample_preview.append(serialize_doc(rec))

        return {
            "collection": collection,
            "mode": mode,
            "total_records": len(records),
            "new_records": new_count,
            "update_records": update_count,
            "duplicate_records": duplicate_count,
            "invalid_records": invalid_count,
            "errors": errors[:10],
            "sample_records": sample_preview
        }

    async def execute_bulk_import(
        self,
        collection: str,
        records: List[Dict[str, Any]],
        mode: str = "UPSERT",
        filename: str = "upload.json",
        user_email: str = "admin@solar.local",
        source_type: str = "OEM_MANUAL",
        source_doc_override: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Executes bulk import with full provenance tracking, batch history, and rollback backup.
        """
        batch_id = f"BATCH-{datetime.utcnow().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
        now = datetime.utcnow()

        inserted_count = 0
        updated_count = 0
        skipped_count = 0
        failed_count = 0
        inserted_ids = []
        backup_log = []
        errors = []

        # Handle REPLACE_COLLECTION mode
        if mode == "REPLACE_COLLECTION":
            try:
                # Backup all existing records before clearing
                existing_all = await self.db[collection].find({}).to_list(length=None)
                backup_log = [serialize_doc(e) for e in existing_all]
                await self.db[collection].delete_many({})
            except Exception as e:
                return {
                    "success": False,
                    "message": f"Failed to clear collection {collection}: {str(e)}",
                    "batch_id": batch_id
                }

        for idx, rec in enumerate(records):
            if not isinstance(rec, dict) or not rec:
                skipped_count += 1
                continue

            try:
                # 1. Provenance & Metadata enrichment
                doc_to_save = dict(rec)
                doc_to_save["knowledge_id"] = generate_knowledge_id(collection, doc_to_save)
                doc_to_save["import_batch_id"] = batch_id
                doc_to_save["source_type"] = doc_to_save.get("source_type") or source_type
                if source_doc_override and not doc_to_save.get("source_document"):
                    doc_to_save["source_document"] = source_doc_override
                doc_to_save["verification_status"] = doc_to_save.get("verification_status") or "NOT_VERIFIED"
                doc_to_save["updated_at"] = now

                # 2. Duplicate Check
                query = build_unique_query(collection, doc_to_save)
                existing_doc = await self.db[collection].find_one(query) if query else None

                if existing_doc:
                    if mode == "INSERT_ONLY":
                        skipped_count += 1
                        continue

                    # Record previous state for rollback
                    backup_log.append({
                        "_id": str(existing_doc["_id"]),
                        "prev_data": serialize_doc(existing_doc)
                    })

                    if mode == "MERGE":
                        # Merge: update only non-null supplied fields
                        update_fields = {k: v for k, v in doc_to_save.items() if k not in ("_id", "created_at") and v is not None}
                        await self.db[collection].update_one({"_id": existing_doc["_id"]}, {"$set": update_fields})
                    else:
                        # UPSERT: overwrite full document preserving _id and created_at
                        doc_to_save["created_at"] = existing_doc.get("created_at", now)
                        await self.db[collection].replace_one({"_id": existing_doc["_id"]}, doc_to_save)

                    updated_count += 1
                else:
                    # New Insert
                    doc_to_save["created_at"] = now
                    res = await self.db[collection].insert_one(doc_to_save)
                    inserted_ids.append(str(res.inserted_id))
                    inserted_count += 1

            except Exception as ex:
                logger.error(f"Error processing record #{idx+1}: {ex}")
                errors.append(f"Record #{idx+1}: {str(ex)[:120]}")
                failed_count += 1

        # Record Batch History in knowledge_import_batches
        batch_record = {
            "batch_id": batch_id,
            "filename": filename,
            "collection": collection,
            "mode": mode,
            "uploaded_by": user_email,
            "upload_date": now,
            "record_count": len(records),
            "inserted_count": inserted_count,
            "updated_count": updated_count,
            "skipped_count": skipped_count,
            "failed_count": failed_count,
            "inserted_ids": inserted_ids,
            "backup_log": backup_log,
            "errors": errors[:20],
            "status": "COMPLETED" if failed_count == 0 else "PARTIAL_SUCCESS",
            "created_at": now
        }
        await self.db.knowledge_import_batches.insert_one(batch_record)

        return {
            "success": True,
            "batch_id": batch_id,
            "collection": collection,
            "mode": mode,
            "inserted": inserted_count,
            "updated": updated_count,
            "skipped": skipped_count,
            "failed": failed_count,
            "errors": errors[:5],
            "message": f"Successfully processed {len(records)} records for '{collection}'. Inserted: {inserted_count}, Updated: {updated_count}, Skipped: {skipped_count}."
        }

    async def rollback_batch(self, batch_id: str, user_email: str = "admin@solar.local") -> Dict[str, Any]:
        """Rollback records modified or inserted by a specific batch."""
        batch = await self.db.knowledge_import_batches.find_one({"batch_id": batch_id})
        if not batch:
            return {"success": False, "message": f"Batch {batch_id} not found."}

        if batch.get("status") == "ROLLED_BACK":
            return {"success": False, "message": f"Batch {batch_id} has already been rolled back."}

        collection = batch["collection"]
        inserted_ids = batch.get("inserted_ids", [])
        backup_log = batch.get("backup_log", [])

        deleted_count = 0
        restored_count = 0

        # 1. Delete all records inserted in this batch
        if inserted_ids:
            obj_ids = []
            for i in inserted_ids:
                try:
                    obj_ids.append(ObjectId(i))
                except Exception:
                    pass
            if obj_ids:
                res = await self.db[collection].delete_many({"_id": {"$in": obj_ids}})
                deleted_count = res.deleted_count

        # 2. Restore previous states for updated/replaced documents
        if backup_log:
            for item in backup_log:
                try:
                    prev = item.get("prev_data") or item
                    doc_id = ObjectId(item["_id"]) if "_id" in item else None
                    if doc_id and prev:
                        # Restore previous doc
                        clean_prev = dict(prev)
                        clean_prev["_id"] = doc_id
                        await self.db[collection].replace_one({"_id": doc_id}, clean_prev, upsert=True)
                        restored_count += 1
                except Exception as e:
                    logger.error(f"Rollback restore failed for item: {e}")

        # Update batch status
        await self.db.knowledge_import_batches.update_one(
            {"batch_id": batch_id},
            {
                "$set": {
                    "status": "ROLLED_BACK",
                    "rolled_back_at": datetime.utcnow(),
                    "rolled_back_by": user_email,
                    "rollback_summary": f"Deleted {deleted_count} inserted records, restored {restored_count} previous records."
                }
            }
        )

        return {
            "success": True,
            "batch_id": batch_id,
            "deleted_inserted": deleted_count,
            "restored_updated": restored_count,
            "message": f"Batch {batch_id} rolled back successfully. Removed {deleted_count} records and restored {restored_count} updated records."
        }

    async def export_knowledge(
        self,
        collection: Optional[str] = None,
        batch_id: Optional[str] = None,
        limit: int = 1000
    ) -> Dict[str, Any]:
        """Exports records from a collection or batch as sanitized JSON."""
        query = {}
        if batch_id:
            query["import_batch_id"] = batch_id

        target_colls = [collection] if collection else SUPPORTED_SOLAR_COLLECTIONS

        export_data = {}
        total_exported = 0

        for coll in target_colls:
            try:
                cursor = self.db[coll].find(query).limit(limit)
                docs = await cursor.to_list(length=limit)
                clean_docs = [serialize_doc(d) for d in docs]
                if clean_docs:
                    export_data[coll] = clean_docs
                    total_exported += len(clean_docs)
            except Exception as e:
                logger.error(f"Export error on {coll}: {e}")

        return {
            "total_records": total_exported,
            "collections": list(export_data.keys()),
            "data": export_data if not collection else export_data.get(collection, [])
        }
