"""
Plant Document Vault
====================

Per-plant document folders backed by the local disk.  Every plant gets its
own root at `uploads/local/plants/{site_id}/`, with sub-folders for logical
grouping (e.g. "Contracts", "Reports").  A global folder template — editable
by super_admin — defines which sub-folders are auto-provisioned when a new
plant is created.

Access model (matches the wider RBAC):
  • super_admin + admin  →  full CRUD on folders and files
  • vendor_admin / vendor / regular users →  read-only for plants they can
    already see via `permissions.site_filter()`.  They cannot create /
    delete folders and cannot upload.
"""
from __future__ import annotations

import os
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import (
    APIRouter, Depends, File, HTTPException, UploadFile,
)
from fastapi.responses import FileResponse


PLANT_DOCS_ROOT_DEFAULT = "/app/backend/uploads/local/plants"

# Sub-folders that get created for every new plant unless the super_admin
# overrides the template via `PUT /api/plant-docs/template`.
DEFAULT_TEMPLATE_FOLDERS = [
    "Contracts",
    "Certifications",
    "Reports",
    "As-Built Drawings",
    "Photos",
    "Warranties",
]


def _safe_name(name: str) -> str:
    """Reject path-traversal and normalise a folder name (strict).

    Used ONLY for folder names — file names are sanitised instead of
    rejected via `_sanitize_filename` so real-world filenames (spaces,
    commas, accents, apostrophes …) still upload successfully.
    """
    name = (name or "").strip()
    if not name or name in (".", "..") or "/" in name or "\\" in name:
        raise HTTPException(400, "Invalid name")
    if not re.match(r"^[A-Za-z0-9 _.\-()&+]+$", name):
        raise HTTPException(400, "Name may only contain letters, digits, spaces and _-.()&+")
    return name


def _sanitize_filename(name: str) -> str:
    """Best-effort sanitisation for uploaded filenames — replace unsafe
    characters with `_` instead of 400-ing. Still blocks path-traversal.
    """
    name = os.path.basename((name or "").strip()) or "upload.bin"
    if name in (".", ".."):
        name = "upload.bin"
    # Replace anything outside a permissive whitelist (also strips control chars).
    cleaned = re.sub(r"[^A-Za-z0-9 _.\-()&+,'!@#\[\]{}=]", "_", name)
    # Collapse consecutive underscores + strip leading/trailing dots so the
    # file always has a valid name on all OSes (Windows especially).
    cleaned = re.sub(r"_+", "_", cleaned).strip("._ ")
    return cleaned or "upload.bin"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _require_doc_editor(user) -> None:
    if user.role not in ("super_admin", "admin"):
        raise HTTPException(403, "Only admin / super_admin can manage plant documents")


async def _require_super_admin(user) -> None:
    if user.role != "super_admin":
        raise HTTPException(403, "Only super_admin can edit the folder template")


def _plant_root(site_id: str) -> Path:
    root = Path(os.environ.get("LOCAL_PLANT_DOCS_ROOT", PLANT_DOCS_ROOT_DEFAULT))
    root.mkdir(parents=True, exist_ok=True)
    return root / site_id


def build_router(db, get_current_user):
    router = APIRouter(prefix="/plant-docs", tags=["plant-docs"])
    plants = APIRouter(prefix="/plants", tags=["plant-docs"])

    async def _load_template() -> List[str]:
        row = await db.plant_doc_template.find_one({"_id": "default"}, {"_id": 0})
        if not row or not row.get("folders"):
            return list(DEFAULT_TEMPLATE_FOLDERS)
        return list(row["folders"])

    async def _assert_plant_visible(site_id: str, user) -> Dict[str, Any]:
        """Confirm the caller is allowed to see this plant at all."""
        from permissions import site_filter
        flt = site_filter(user)
        # Layer in the site_id filter and query.
        query = {"$and": [{"site_id": site_id}, flt]} if flt else {"site_id": site_id}
        site = await db.sites.find_one(query, {"_id": 0, "site_id": 1, "site_name": 1})
        if not site:
            raise HTTPException(404, "Plant not found or not accessible")
        return site

    # ---------- Template CRUD (super_admin) ----------
    @router.get("/template")
    async def get_template(user=Depends(get_current_user)) -> Dict[str, Any]:
        await _require_doc_editor(user)
        return {"folders": await _load_template()}

    @router.put("/template")
    async def set_template(body: Dict[str, Any], user=Depends(get_current_user)) -> Dict[str, Any]:
        await _require_super_admin(user)
        folders_raw = body.get("folders") or []
        if not isinstance(folders_raw, list):
            raise HTTPException(400, "`folders` must be a list of strings")
        folders = []
        seen: set = set()
        for f in folders_raw:
            n = _safe_name(str(f))
            if n.lower() in seen:
                continue
            seen.add(n.lower())
            folders.append(n)
        await db.plant_doc_template.update_one(
            {"_id": "default"},
            {"$set": {"folders": folders, "updated_at": _now(),
                      "updated_by": user.user_id}},
            upsert=True,
        )
        return {"folders": folders}

    # ---------- Init template folders for a plant ----------
    async def _init_folders(site_id: str) -> List[str]:
        template = await _load_template()
        root = _plant_root(site_id)
        for f in template:
            (root / f).mkdir(parents=True, exist_ok=True)
        return template

    @plants.post("/{site_id}/init-doc-folders")
    async def init_folders(site_id: str, user=Depends(get_current_user)):
        await _require_doc_editor(user)
        await _assert_plant_visible(site_id, user)
        return {"folders": await _init_folders(site_id)}

    # ---------- Folder CRUD ----------
    @plants.get("/{site_id}/folders")
    async def list_folders(site_id: str, user=Depends(get_current_user)):
        await _assert_plant_visible(site_id, user)
        root = _plant_root(site_id)
        # Auto-provision on first visit if root is empty and template exists.
        if not root.exists() or not any(root.iterdir()):
            if user.role in ("super_admin", "admin"):
                await _init_folders(site_id)
        out = []
        if root.exists():
            for entry in sorted(root.iterdir(), key=lambda p: p.name.lower()):
                if entry.is_dir():
                    try:
                        files = [f for f in entry.iterdir() if f.is_file()]
                    except OSError:
                        files = []
                    out.append({
                        "name": entry.name,
                        "file_count": len(files),
                        "size_bytes": sum(f.stat().st_size for f in files),
                    })
        return {"site_id": site_id, "folders": out,
                "can_edit": user.role in ("super_admin", "admin")}

    @plants.post("/{site_id}/folders")
    async def create_folder(site_id: str, body: Dict[str, Any],
                            user=Depends(get_current_user)):
        await _require_doc_editor(user)
        await _assert_plant_visible(site_id, user)
        name = _safe_name(body.get("name") or "")
        target = _plant_root(site_id) / name
        if target.exists():
            raise HTTPException(400, "Folder already exists")
        target.mkdir(parents=True, exist_ok=True)
        return {"name": name}

    @plants.delete("/{site_id}/folders/{folder}")
    async def delete_folder(site_id: str, folder: str,
                            user=Depends(get_current_user)):
        await _require_doc_editor(user)
        await _assert_plant_visible(site_id, user)
        folder = _safe_name(folder)
        target = _plant_root(site_id) / folder
        if not target.exists():
            raise HTTPException(404, "Folder not found")
        shutil.rmtree(target)
        return {"ok": True}

    # ---------- Files ----------
    @plants.get("/{site_id}/folders/{folder}/files")
    async def list_files(site_id: str, folder: str,
                         user=Depends(get_current_user)):
        await _assert_plant_visible(site_id, user)
        folder = _safe_name(folder)
        target = _plant_root(site_id) / folder
        if not target.exists():
            return {"files": []}
        files = []
        for f in sorted(target.iterdir(), key=lambda p: p.name.lower()):
            if f.is_file():
                st = f.stat()
                files.append({
                    "name": f.name,
                    "size_bytes": st.st_size,
                    "modified_at": datetime.fromtimestamp(st.st_mtime,
                                                         timezone.utc).isoformat(),
                })
        return {"files": files, "can_edit": user.role in ("super_admin", "admin")}

    @plants.post("/{site_id}/folders/{folder}/upload")
    async def upload_file(site_id: str, folder: str,
                          file: UploadFile = File(...),
                          user=Depends(get_current_user)):
        await _require_doc_editor(user)
        await _assert_plant_visible(site_id, user)
        folder = _safe_name(folder)
        fname = _sanitize_filename(file.filename or "upload.bin")
        target_dir = _plant_root(site_id) / folder
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / fname
        # If a file with the same name already exists, append a numeric suffix.
        if target.exists():
            stem = target.stem
            suffix = target.suffix
            i = 1
            while (target_dir / f"{stem} ({i}){suffix}").exists():
                i += 1
            target = target_dir / f"{stem} ({i}){suffix}"
        data = await file.read()
        target.write_bytes(data)
        return {"name": target.name, "size_bytes": len(data)}

    @plants.get("/{site_id}/folders/{folder}/files/{filename}")
    async def download_file(site_id: str, folder: str, filename: str,
                            user=Depends(get_current_user)):
        await _assert_plant_visible(site_id, user)
        folder = _safe_name(folder)
        filename = _sanitize_filename(filename)
        target = _plant_root(site_id) / folder / filename
        if not target.exists() or not target.is_file():
            raise HTTPException(404, "File not found")
        return FileResponse(target, filename=filename)

    @plants.delete("/{site_id}/folders/{folder}/files/{filename}")
    async def delete_file(site_id: str, folder: str, filename: str,
                          user=Depends(get_current_user)):
        await _require_doc_editor(user)
        await _assert_plant_visible(site_id, user)
        folder = _safe_name(folder)
        filename = _sanitize_filename(filename)
        target = _plant_root(site_id) / folder / filename
        if not target.exists():
            raise HTTPException(404, "File not found")
        target.unlink()
        return {"ok": True}

    return router, plants


async def bootstrap_new_plant(db, site_id: str) -> None:
    """Called from `_upsert_site` right after a new plant row is inserted —
    auto-provisions the template folders on disk so admins land on a
    pre-organised vault the first time they open the Documents tab.
    Never raises so a folder failure never blocks site creation."""
    try:
        row = await db.plant_doc_template.find_one({"_id": "default"}, {"_id": 0})
        folders = list(row["folders"]) if row and row.get("folders") else list(DEFAULT_TEMPLATE_FOLDERS)
        root = Path(os.environ.get("LOCAL_PLANT_DOCS_ROOT", PLANT_DOCS_ROOT_DEFAULT)) / site_id
        for f in folders:
            (root / f).mkdir(parents=True, exist_ok=True)
    except Exception:
        # Bootstrapping is best-effort — never crash site creation.
        pass
