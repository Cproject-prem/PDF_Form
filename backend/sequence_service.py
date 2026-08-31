"""Auto-number / Sequence Generator Service for FormForge & PDF Forms.

Supports:
- mode: "continuous" -> 1, 2, 3, 4, 5, 6... (or 001, 002... with custom padding)
- mode: "year_continuous" -> YYYY/NNN e.g. 2026/001, 2026/002, 2026/006 (matches regex \\b\\d{4}/\\d{3}\\b)
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from pymongo import ReturnDocument


def format_sequence(seq_num: int, mode: str, year: int, padding: int) -> str:
    if mode == "year_continuous":
        pad = max(padding, 3)
        return f"{year}/{str(seq_num).zfill(pad)}"
    # Continuous mode
    if padding > 1:
        return str(seq_num).zfill(padding)
    return str(seq_num)


async def get_next_sequence(
    db,
    parent_id: str,
    field_id: str,
    auto_number_cfg: Dict[str, Any],
    preview: bool = False,
) -> str:
    """Generate or preview the next sequence for a form/template field."""
    mode = auto_number_cfg.get("mode") or "continuous"
    padding = int(auto_number_cfg.get("padding") or (3 if mode == "year_continuous" else 1))
    start_from = int(auto_number_cfg.get("start_from") or 1)
    current_year = datetime.now(timezone.utc).year

    seq_key = f"{parent_id}:{field_id}:{current_year}" if mode == "year_continuous" else f"{parent_id}:{field_id}"

    if preview:
        existing = await db.auto_sequences.find_one({"key": seq_key})
        if existing and "seq" in existing:
            next_val = int(existing["seq"]) + 1
        else:
            max_existing = await _find_max_existing_seq(db, parent_id, field_id, mode, current_year)
            next_val = max(max_existing + 1, start_from)
        return format_sequence(next_val, mode, current_year, padding)

    # Atomic increment for actual submission
    existing = await db.auto_sequences.find_one({"key": seq_key})
    if not existing:
        max_existing = await _find_max_existing_seq(db, parent_id, field_id, mode, current_year)
        initial_seq = max(max_existing, start_from - 1)
        await db.auto_sequences.update_one(
            {"key": seq_key},
            {"$setOnInsert": {
                "key": seq_key,
                "parent_id": parent_id,
                "field_id": field_id,
                "year": current_year,
                "seq": initial_seq,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }},
            upsert=True
        )

    res = await db.auto_sequences.find_one_and_update(
        {"key": seq_key},
        {
            "$inc": {"seq": 1},
            "$set": {"updated_at": datetime.now(timezone.utc).isoformat()},
        },
        return_document=ReturnDocument.AFTER,
    )
    seq_num = res["seq"] if res and "seq" in res else start_from
    return format_sequence(seq_num, mode, current_year, padding)


async def _find_max_existing_seq(db, parent_id: str, field_id: str, mode: str, year: int) -> int:
    """Scan existing submissions to find the current highest sequence number for a field."""
    max_num = 0
    for coll in (db.submissions, db.pdf_submissions):
        cursor = coll.find(
            {"$or": [{"form_id": parent_id}, {"template_id": parent_id}]},
            {"values": 1}
        ).sort("created_at", -1).limit(500)
        
        async for doc in cursor:
            vals = doc.get("values") or {}
            v = vals.get(field_id)
            if v is None:
                continue
            v_str = str(v).strip()
            if mode == "year_continuous":
                m = re.match(r"^(\d{4})/(\d+)$", v_str)
                if m:
                    doc_year, doc_seq = int(m.group(1)), int(m.group(2))
                    if doc_year == year and doc_seq > max_num:
                        max_num = doc_seq
            else:
                m = re.match(r"^(\d+)$", v_str)
                if m:
                    doc_seq = int(m.group(1))
                    if doc_seq > max_num:
                        max_num = doc_seq

    return max_num


async def resolve_auto_numbers_for_submission(db, parent_id: str, fields: list, values: dict) -> dict:
    """Inspects form/template fields, generates next sequence for any auto_number field, and returns updated values dict."""
    updated_values = dict(values)
    for f in (fields or []):
        auto_cfg = f.get("auto_number")
        if auto_cfg and (isinstance(auto_cfg, dict) and auto_cfg.get("enabled")):
            fid = f.get("id")
            if fid:
                next_seq = await get_next_sequence(db, parent_id, fid, auto_cfg, preview=False)
                updated_values[fid] = next_seq
    return updated_values


async def get_auto_number_previews(db, parent_id: str, fields: list) -> dict:
    """Returns a dictionary of { [field_id]: preview_sequence_string } for all auto_number fields."""
    previews = {}
    for f in (fields or []):
        auto_cfg = f.get("auto_number")
        if auto_cfg and (isinstance(auto_cfg, dict) and auto_cfg.get("enabled")):
            fid = f.get("id")
            if fid:
                seq_preview = await get_next_sequence(db, parent_id, fid, auto_cfg, preview=True)
                previews[fid] = seq_preview
    return previews
