"""Manpower Portal integration (READ-ONLY).

Pulls manpower records from a separate MongoDB database (default
`cmes_mp_db`) that lives on the SAME MongoDB instance.  Photos are
served by streaming the file from disk — the doc stores a relative
`file_path` (e.g. `Bluedart\\2026\\07\\MP-2026-000006\\photo_....png`)
that is joined onto `MANPOWER_PHOTO_ROOT` (env-configurable).

Environment variables (add to backend/.env):

    MANPOWER_ENABLED=true
    MANPOWER_DB_NAME=cmes_mp_db
    MANPOWER_COLLECTION=manpower
    MANPOWER_PHOTO_ROOT=/mnt/manpower_uploads       # Linux
    # or on Windows:
    # MANPOWER_PHOTO_ROOT=D:/manpower_uploads

The upstream portal is the sole editor — this module only reads.
"""
from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse


# ---------------------------------------------------------------------------
def _env(key: str, default: str = "") -> str:
    v = os.environ.get(key, default) or default
    return (v.strip().strip('"').strip("'")).strip()


def _enabled() -> bool:
    return _env("MANPOWER_ENABLED", "true").lower() not in ("0", "false", "no", "off")


def _photo_root() -> Optional[Path]:
    raw = _env("MANPOWER_PHOTO_ROOT", "")
    return Path(raw) if raw else None


def _normalize_path(p: str) -> str:
    """The upstream portal stores Windows-style backslashes even on Linux.
    Normalise to forward slashes so `Path` joins cleanly on either OS."""
    return p.replace("\\", "/").lstrip("/")


def _photo_doc(doc: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Pick the most recent `photo` document from the record's `documents`
    array, if any.  Returns the raw sub-document or None."""
    photos = [
        d for d in (doc.get("documents") or [])
        if isinstance(d, dict) and (d.get("doc_type") or "").lower() == "photo"
        and d.get("file_path")
    ]
    if not photos:
        return None
    photos.sort(key=lambda d: d.get("uploaded_at") or "", reverse=True)
    return photos[0]


def _row(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Trim & rename fields for the table row payload."""
    p = _photo_doc(doc)
    return {
        "id": doc.get("id"),
        "manpower_id": doc.get("manpower_id"),
        "full_name": doc.get("full_name") or "",
        "designation": doc.get("designation") or "",
        "status": doc.get("status") or "",
        "company_name": doc.get("company_name") or "",
        "work_state": doc.get("work_state") or "",
        "location": doc.get("location") or "",
        "city": doc.get("city") or "",
        "phone": doc.get("phone") or "",
        "blood_group": doc.get("blood_group") or "",
        "has_photo": bool(p),
        "photo_filename": p.get("file_name") if p else None,
        "medical_expiry_date": doc.get("medical_expiry_date"),
        "safety_belt_expiry_date": doc.get("safety_belt_expiry_date"),
        "height_work_expiry_date": doc.get("height_work_expiry_date"),
    }


# ---------------------------------------------------------------------------
def build_manpower_router(main_db, get_current_user):
    """Attach the manpower routes.  `main_db` is the FormForge motor DB;
    we open a sibling handle to the manpower DB via the same client.  If
    the integration is disabled the router still returns cleanly-shaped
    "empty" payloads so the frontend can render without crashing."""
    router = APIRouter(prefix="/manpower", tags=["manpower"])

    # Get a handle to the manpower DB (same client, different name).
    mp_db_name = _env("MANPOWER_DB_NAME", "cmes_mp_db")
    mp_coll_name = _env("MANPOWER_COLLECTION", "manpower")
    # motor Database has .client → AsyncIOMotorClient
    _client = getattr(main_db, "client", None)
    mp_db = _client[mp_db_name] if _client is not None else None
    coll = mp_db[mp_coll_name] if mp_db is not None else None

    @router.get("")
    async def list_manpower(
        search: Optional[str] = Query(None, description="Match on ID, name, designation, company, state, or location"),
        state: Optional[str] = None,
        location: Optional[str] = None,
        company: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = Query(200, ge=1, le=1000),
        user: Any = Depends(get_current_user),
    ):
        if not _enabled() or coll is None:
            return {"items": [], "total": 0, "enabled": False}

        q: Dict[str, Any] = {}
        vid = getattr(user, "vendor_id", None)
        if vid:
            q["vendor_id"] = vid

        if state:    q["work_state"] = state
        if location: q["location"]   = location
        if company:  q["company_name"] = company
        if status:   q["status"] = status
        if search:
            rx = re.escape(search.strip())
            q["$or"] = [
                {"manpower_id":  {"$regex": rx, "$options": "i"}},
                {"full_name":    {"$regex": rx, "$options": "i"}},
                {"designation":  {"$regex": rx, "$options": "i"}},
                {"company_name": {"$regex": rx, "$options": "i"}},
                {"work_state":   {"$regex": rx, "$options": "i"}},
                {"location":     {"$regex": rx, "$options": "i"}},
                {"city":         {"$regex": rx, "$options": "i"}},
            ]

        cursor = coll.find(q, {
            "_id": 0,
            "id": 1, "manpower_id": 1, "full_name": 1, "designation": 1, "status": 1,
            "company_name": 1, "work_state": 1, "location": 1, "city": 1,
            "phone": 1, "blood_group": 1, "documents": 1, "vendor_id": 1,
        }).sort("manpower_id", 1).limit(limit)

        rows = [_row(d) async for d in cursor]
        return {"items": rows, "total": len(rows), "enabled": True}

    @router.get("/filters")
    async def filters(user: Any = Depends(get_current_user)):
        """Distinct values for the state / location / company dropdowns."""
        if not _enabled() or coll is None:
            return {"states": [], "locations": [], "companies": []}
            
        q = {}
        vid = getattr(user, "vendor_id", None)
        if vid:
            q["vendor_id"] = vid
            
        states    = [v for v in await coll.distinct("work_state", q)   if v]
        locations = [v for v in await coll.distinct("location", q)     if v]
        companies = [v for v in await coll.distinct("company_name", q) if v]
        return {
            "states": sorted(states),
            "locations": sorted(locations),
            "companies": sorted(companies),
        }

    @router.get("/{manpower_id}")
    async def get_one(manpower_id: str, user: Any = Depends(get_current_user)):
        if not _enabled() or coll is None:
            raise HTTPException(503, "Manpower integration is disabled")
            
        q = {"manpower_id": manpower_id}
        vid = getattr(user, "vendor_id", None)
        if vid:
            q["vendor_id"] = vid
            
        doc = await coll.find_one(q, {"_id": 0})
        if not doc:
            raise HTTPException(404, f"Manpower {manpower_id} not found")
        # Add convenient photo metadata alongside the raw record.
        doc["_photo"] = _photo_doc(doc)
        return doc

    @router.get("/{manpower_id}/photo")
    async def photo(manpower_id: str, user: Any = Depends(get_current_user)):
        """Streams the person's most recent `photo`-type document from the
        configured upload root.  Returns 404 if the photo record is missing
        OR if the file isn't found on disk (misconfigured photo root)."""
        if not _enabled() or coll is None:
            raise HTTPException(503, "Manpower integration is disabled")
            
        q = {"manpower_id": manpower_id}
        vid = getattr(user, "vendor_id", None)
        if vid:
            q["vendor_id"] = vid
            
        doc = await coll.find_one(q, {"_id": 0, "documents": 1})
        if not doc:
            raise HTTPException(404, "Manpower not found")
        p = _photo_doc(doc)
        if not p:
            raise HTTPException(404, "No photo on this record")
        root = _photo_root()
        if not root:
            raise HTTPException(500,
                "MANPOWER_PHOTO_ROOT is not configured. Set it in backend/.env "
                "to the folder that contains the file_path values from the manpower portal "
                "(e.g. Bluedart/2026/07/MP-2026-000006/photo_xxx.png).")
        rel = _normalize_path(p["file_path"])
        target = (root / rel).resolve()
        # Path traversal guard — must remain inside the configured root.
        try:
            target.relative_to(root.resolve())
        except ValueError:
            raise HTTPException(400, "Invalid photo path")
        if not target.is_file():
            raise HTTPException(404, f"Photo file missing on disk: {rel}")
        # Guess mimetype from extension.
        ext = target.suffix.lower().lstrip(".")
        mime = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
                "gif": "image/gif", "webp": "image/webp"}.get(ext, "application/octet-stream")
        return FileResponse(target, media_type=mime, filename=p.get("file_name") or target.name)

    return router
