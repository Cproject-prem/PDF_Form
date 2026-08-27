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

import io
import os
import re
import shutil
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import (
    APIRouter, Depends, File, HTTPException, UploadFile,
)
from fastapi.responses import FileResponse, StreamingResponse


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
    if not re.match(r"^[A-Za-z0-9 _.()&+-]+$", name):
        raise HTTPException(400, "Name may only contain letters, digits, spaces and _-.()&+")
    return name


def _safe_subfolder(subfolder: str) -> str:
    """Validate a subfolder name — same rules as _safe_name but called
    separately so callers can clearly distinguish root-folder from subfolder."""
    return _safe_name(subfolder)


def _resolve_dir(site_id: str, folder: str, subfolder: str = "") -> Path:
    """Return the absolute Path for a (folder, optional subfolder) pair.
    Raises HTTPException 400 on invalid names."""
    base = _plant_root(site_id) / _safe_name(folder)
    if subfolder:
        return base / _safe_subfolder(subfolder)
    return base


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
    # `access_override` promotes any admin/user to super-admin-level rights
    # across the app, so honour it here too for consistency.
    if user.role in ("super_admin", "admin"):
        return
    if getattr(user, "access_override", False):
        return
    raise HTTPException(403, "Only admin / super_admin can manage plant documents")


async def _require_super_admin(user) -> None:
    if user.role == "super_admin" or getattr(user, "access_override", False):
        return
    raise HTTPException(403, "Only super_admin can edit the folder template")


def _plant_root(site_id: str) -> Path:
    root = Path(os.environ.get("LOCAL_PLANT_DOCS_ROOT", PLANT_DOCS_ROOT_DEFAULT))
    root.mkdir(parents=True, exist_ok=True)
    return root / site_id


def save_internal_plant_doc(
    site_id: str,
    folder_name: str,
    file_name: str,
    content: bytes,
    subfolder_name: str = "",
) -> str:
    """Programmatically push a file to the plant's document vault.
    Returns the path where the file was saved.
    Accepts an optional subfolder_name for one level of nesting.
    """
    if not site_id:
        return ""

    f_name = _safe_name(folder_name)
    target_dir = _plant_root(site_id) / f_name
    if subfolder_name:
        sf_name = _safe_name(subfolder_name)
        target_dir = target_dir / sf_name
    target_dir.mkdir(parents=True, exist_ok=True)

    safe_file_name = _sanitize_filename(file_name)
    target_path = target_dir / safe_file_name
    target_path.write_bytes(content)
    return str(target_path)


def parse_vault_path(path: str):
    """Split '/Folder/Subfolder' into (folder, subfolder). Returns (folder, '') for root paths."""
    parts = (path or "").strip().lstrip("/").split("/", 1)
    folder = parts[0].strip() if parts else ""
    subfolder = parts[1].strip() if len(parts) > 1 else ""
    return folder, subfolder


def build_router(db, get_current_user):
    router = APIRouter(prefix="/plant-docs", tags=["plant-docs"])
    plants = APIRouter(prefix="/plants", tags=["plant-docs"])

    async def _get_template_data() -> Dict[str, Any]:
        row = await db.plant_doc_template.find_one({"_id": "default"}, {"_id": 0})
        if not row:
            return {"folders": list(DEFAULT_TEMPLATE_FOLDERS), "subfolders": {}, "permissions": {}}
        return {
            "folders": list(row.get("folders") or []),
            "subfolders": row.get("subfolders") or {},
            "permissions": row.get("permissions") or {}
        }

    async def _load_template() -> List[str]:
        data = await _get_template_data()
        if not data.get("folders"):
            return list(DEFAULT_TEMPLATE_FOLDERS)
        return data["folders"]

    async def _has_folder_access(user, folder_name: str, action: str = "view") -> bool:
        """Check if user has access to a folder based on template permissions.
        action can be "view" or "edit".
        """
        if user.role in ("super_admin", "admin") or getattr(user, "access_override", False):
            return True

        data = await _get_template_data()
        perms = data.get("permissions", {}).get(folder_name, {})
        
        # If permissions are explicitly set for this action, check them.
        if action in perms:
            return user.role in perms[action]
            
        # Default fallback:
        # Everyone can view, but only admin/super_admin can edit.
        if action == "view":
            return True
        return False

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
        return await _get_template_data()

    @router.put("/template")
    async def set_template(body: Dict[str, Any], user=Depends(get_current_user)) -> Dict[str, Any]:
        await _require_super_admin(user)
        folders_raw = body.get("folders") or []
        subfolders_raw = body.get("subfolders") or {}
        permissions = body.get("permissions") or {}
        if not isinstance(folders_raw, list):
            raise HTTPException(400, "`folders` must be a list of strings")
        if not isinstance(permissions, dict):
            raise HTTPException(400, "`permissions` must be a dictionary")
        if not isinstance(subfolders_raw, dict):
            raise HTTPException(400, "`subfolders` must be a dictionary")
            
        folders = []
        seen: set = set()
        for f in folders_raw:
            n = _safe_name(str(f))
            if n.lower() in seen:
                continue
            seen.add(n.lower())
            folders.append(n)

        cleaned_subfolders: Dict[str, List[str]] = {}
        for f in folders:
            sf_list = subfolders_raw.get(f) or []
            if isinstance(sf_list, list):
                sf_cleaned = []
                sf_seen = set()
                for sf in sf_list:
                    try:
                        sfn = _safe_name(str(sf))
                        if sfn.lower() not in sf_seen:
                            sf_seen.add(sfn.lower())
                            sf_cleaned.append(sfn)
                    except Exception:
                        pass
                if sf_cleaned:
                    cleaned_subfolders[f] = sf_cleaned
            
        # Clean up permissions to only include valid roles and valid folders
        valid_roles = {"super_admin", "admin", "vendor_admin", "user", "vendor_user"}
        cleaned_perms = {}
        for f in folders:
            if f in permissions:
                p = permissions[f]
                c = {}
                if "view" in p and isinstance(p["view"], list):
                    c["view"] = [r for r in p["view"] if r in valid_roles]
                if "edit" in p and isinstance(p["edit"], list):
                    c["edit"] = [r for r in p["edit"] if r in valid_roles]
                if c:
                    cleaned_perms[f] = c
            
        await db.plant_doc_template.update_one(
            {"_id": "default"},
            {"$set": {
                "folders": folders,
                "subfolders": cleaned_subfolders,
                "permissions": cleaned_perms,
                "updated_at": _now(),
                "updated_by": user.user_id
            }},
            upsert=True,
        )
        # Propagate to every existing plant: create any *new* template
        # folders & subfolders on disk (idempotent)
        propagated = 0
        try:
            async for site in db.sites.find({}, {"_id": 0, "site_id": 1}):
                sid = site.get("site_id")
                if not sid:
                    continue
                root = _plant_root(sid)
                for f in folders:
                    (root / f).mkdir(parents=True, exist_ok=True)
                    for sf in cleaned_subfolders.get(f, []):
                        (root / f / sf).mkdir(parents=True, exist_ok=True)
                propagated += 1
        except Exception:  # noqa: BLE001
            pass
        return {"folders": folders, "subfolders": cleaned_subfolders, "propagated_to_plants": propagated}

    # ---------- Init template folders for a plant ----------
    async def _init_folders(site_id: str) -> List[str]:
        data = await _get_template_data()
        folders = data.get("folders") or list(DEFAULT_TEMPLATE_FOLDERS)
        subfolders = data.get("subfolders") or {}
        root = _plant_root(site_id)
        for f in folders:
            (root / f).mkdir(parents=True, exist_ok=True)
            for sf in subfolders.get(f, []):
                (root / f / sf).mkdir(parents=True, exist_ok=True)
        return folders

    @plants.post("/{site_id}/init-doc-folders")
    async def init_folders(site_id: str, user=Depends(get_current_user)):
        await _require_doc_editor(user)
        await _assert_plant_visible(site_id, user)
        return {"folders": await _init_folders(site_id)}

    # ---------- Vault path helpers (used by form settings) ----------
    @plants.get("/check-vault-path")
    async def check_vault_path(path: str = "", user=Depends(get_current_user)):
        """Check if a vault path exists in the folder template.
        If it doesn't exist, auto-creates it so users never encounter an error.
        Returns {exists: bool, folder, subfolder}.
        """
        folder, subfolder = parse_vault_path(path)
        if not folder:
            return {"exists": True, "folder": "", "subfolder": "", "path": path}
        try:
            f_safe = _safe_name(folder)
            sf_safe = _safe_name(subfolder) if subfolder else ""
        except HTTPException:
            return {"exists": True, "folder": folder, "subfolder": subfolder, "path": path}

        # Auto-add folder to template and plant disks if missing
        template = await _load_template()
        if f_safe not in template:
            template.append(f_safe)
            await db.plant_doc_template.update_one(
                {"_id": "default"},
                {"$addToSet": {"folders": f_safe}},
                upsert=True,
            )
            # Create across all plant vaults
            sites = await db.sites.find({}, {"site_id": 1}).to_list(2000)
            for site in sites:
                sid = site.get("site_id")
                if not sid:
                    continue
                folder_path = _plant_root(sid) / f_safe
                folder_path.mkdir(parents=True, exist_ok=True)
                if sf_safe:
                    (folder_path / sf_safe).mkdir(parents=True, exist_ok=True)

        return {"exists": True, "folder": f_safe, "subfolder": sf_safe, "path": path}

    @plants.post("/ensure-vault-path")
    async def ensure_vault_path(body: Dict[str, Any], user=Depends(get_current_user)):
        """Create a vault folder/subfolder path across ALL plants and add to template.
        Body: { path: "/Reports/TBT" }
        """
        path = (body.get("path") or "").strip()
        folder, subfolder = parse_vault_path(path)
        if not folder:
            return {"ok": True, "folder": "", "subfolder": "", "path": path, "plants_updated": 0}
        # Validate names
        try:
            f_safe = _safe_name(folder)
            sf_safe = _safe_name(subfolder) if subfolder else ""
        except HTTPException as exc:
            f_safe = re.sub(r"[^\w.\- ]+", "_", folder).strip() or "Reports"
            sf_safe = re.sub(r"[^\w.\- ]+", "_", subfolder).strip() if subfolder else ""

        # Add folder to template if missing
        template = await _load_template()
        if f_safe not in template:
            template.append(f_safe)
            await db.plant_doc_template.update_one(
                {"_id": "default"},
                {"$addToSet": {"folders": f_safe}},
                upsert=True,
            )

        # Create across all plant vaults
        sites = await db.sites.find({}, {"site_id": 1}).to_list(2000)
        created = 0
        for site in sites:
            sid = site.get("site_id")
            if not sid:
                continue
            folder_path = _plant_root(sid) / f_safe
            folder_path.mkdir(parents=True, exist_ok=True)
            if sf_safe:
                (folder_path / sf_safe).mkdir(parents=True, exist_ok=True)
            created += 1

        return {"ok": True, "folder": f_safe, "subfolder": sf_safe,
                "path": f"/{f_safe}/{sf_safe}" if sf_safe else f"/{f_safe}",
                "plants_updated": created}


    # ---------- Folder CRUD ----------
    @plants.get("/{site_id}/folders")
    async def list_folders(site_id: str, user=Depends(get_current_user)):
        await _assert_plant_visible(site_id, user)
        root = _plant_root(site_id)
        if user.role in ("super_admin", "admin"):
            try:
                template = await _load_template()
                root.mkdir(parents=True, exist_ok=True)
                for f in template:
                    (root / f).mkdir(parents=True, exist_ok=True)
            except Exception:  # noqa: BLE001
                pass

        def _folder_node(entry: Path) -> dict:
            """Recursively build a folder node with children."""
            try:
                direct_files = [f for f in entry.iterdir() if f.is_file()]
                subdirs = sorted([d for d in entry.iterdir() if d.is_dir()], key=lambda p: p.name.lower())
            except OSError:
                direct_files, subdirs = [], []
            return {
                "name": entry.name,
                "file_count": len(direct_files),
                "size_bytes": sum(f.stat().st_size for f in direct_files),
                "children": [_folder_node(d) for d in subdirs],
            }

        out = []
        if root.exists():
            for entry in sorted(root.iterdir(), key=lambda p: p.name.lower()):
                if entry.is_dir():
                    if not await _has_folder_access(user, entry.name, "view"):
                        continue
                    node = _folder_node(entry)
                    node["can_edit"] = await _has_folder_access(user, entry.name, "edit")
                    out.append(node)
        return {"site_id": site_id, "folders": out,
                "can_edit": user.role in ("super_admin", "admin")}

    @plants.get("/{site_id}/tree")
    async def get_folder_tree(site_id: str, path: str = "", user=Depends(get_current_user)):
        """Returns a recursive tree structure of folders and files.
        
        Args:
            site_id: Plant ID
            path: Optional path to a specific folder (e.g., "Contracts/Reports")
        
        Returns:
            Tree structure with folders and files, supporting nested folders
        """
        await _assert_plant_visible(site_id, user)
        root = _plant_root(site_id)
        
        # Navigate to the target path if provided
        if path:
            parts = path.split("/")
            current = root
            for part in parts:
                if not part:
                    continue
                # Sanitize the path component
                sanitized = _safe_name(part)
                current = current / sanitized
                if not current.exists():
                    raise HTTPException(404, f"Folder '{path}' not found")
            if not await _has_folder_access(user, parts[0], "view"):
                raise HTTPException(404, f"Folder '{path}' not found")
        
        result = []
        if not path and root.exists():
            target = root
        else:
            target = current if current.exists() else root
        
        if target.exists():
            # Process entries in sorted order
            for entry in sorted(target.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
                if entry.is_dir():
                    # Check top-level folder access
                    folder_name = entry.name if not path else parts[0]
                    if not await _has_folder_access(user, folder_name, "view"):
                        continue
                    try:
                        # Recursively get files in this folder
                        files = []
                        for f in sorted(entry.iterdir(), key=lambda p: p.name.lower()):
                            if f.is_file():
                                st = f.stat()
                                files.append({
                                    "name": f.name,
                                    "size_bytes": st.st_size,
                                    "modified_at": datetime.fromtimestamp(st.st_mtime, timezone.utc).isoformat(),
                                })

                        # Build the relative path for this entry
                        entry_path = f"{path}/{entry.name}" if path else entry.name

                        # Recursively get subfolders
                        subfolders = await get_folder_tree_recursive(
                            entry, user, root, entry_path
                        )

                        result.append({
                            "name": entry.name,
                            "type": "folder",
                            "path": entry_path,
                            "file_count": len(files),
                            "size_bytes": sum(f["size_bytes"] for f in files),
                            "files": files,
                            "subfolders": subfolders,
                        })
                    except OSError:
                        continue
                else:
                    st = entry.stat()
                    result.append({
                        "name": entry.name,
                        "type": "file",
                        "path": f"{path}/{entry.name}" if path else entry.name,
                        "size_bytes": st.st_size,
                        "modified_at": datetime.fromtimestamp(st.st_mtime, timezone.utc).isoformat(),
                    })
        
        return {"site_id": site_id, "path": path, "tree": result}

    async def get_folder_tree_recursive(current: Path, user, root_path: Path, parent_path: str) -> List[Dict[str, Any]]:
        """Recursively build folder tree structure.
        
        Args:
            current: Current path being processed
            user: Current user for permissions
            root_path: Root path of the plant documents
            parent_path: Parent path for building relative paths
        
        Returns:
            List of folder objects with their contents
        """
        result = []
        try:
            for entry in sorted(current.iterdir(), key=lambda p: p.name.lower()):
                if entry.is_dir():
                    # Recursively get files in this folder
                    files = []
                    for f in sorted(entry.iterdir(), key=lambda p: p.name.lower()):
                        if f.is_file():
                            st = f.stat()
                            files.append({
                                "name": f.name,
                                "size_bytes": st.st_size,
                                "modified_at": datetime.fromtimestamp(st.st_mtime, timezone.utc).isoformat(),
                            })
                    
                    # Recursively get subfolders
                    subfolders = await get_folder_tree_recursive(
                        entry, user, root_path, f"{parent_path}/{entry.name}"
                    )
                    
                    result.append({
                        "name": entry.name,
                        "type": "folder",
                        "path": f"{parent_path}/{entry.name}",
                        "file_count": len(files),
                        "size_bytes": sum(f["size_bytes"] for f in files),
                        "files": files,
                        "subfolders": subfolders,
                    })
                else:
                    st = entry.stat()
                    result.append({
                        "name": entry.name,
                        "type": "file",
                        "path": f"{parent_path}/{entry.name}",
                        "size_bytes": st.st_size,
                        "modified_at": datetime.fromtimestamp(st.st_mtime, timezone.utc).isoformat(),
                    })
        except OSError:
            pass
        
        return result

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

    # ---------- Subfolder CRUD ----------
    @plants.post("/{site_id}/folders/{folder}/subfolders")
    async def create_subfolder(site_id: str, folder: str, body: Dict[str, Any],
                               user=Depends(get_current_user)):
        """Create a subfolder inside a root folder."""
        if not await _has_folder_access(user, folder, "edit"):
            raise HTTPException(403, "Access denied")
        await _assert_plant_visible(site_id, user)
        parent = _safe_name(folder)
        name = _safe_name(body.get("name") or "")
        target = _plant_root(site_id) / parent / name
        if target.exists():
            raise HTTPException(400, "Subfolder already exists")
        target.mkdir(parents=True, exist_ok=True)
        return {"name": name, "folder": parent}

    @plants.delete("/{site_id}/folders/{folder}/subfolders/{subfolder}")
    async def delete_subfolder(site_id: str, folder: str, subfolder: str,
                               user=Depends(get_current_user)):
        """Delete a subfolder and all its contents."""
        if not await _has_folder_access(user, folder, "edit"):
            raise HTTPException(403, "Access denied")
        await _assert_plant_visible(site_id, user)
        target = _plant_root(site_id) / _safe_name(folder) / _safe_name(subfolder)
        if not target.exists():
            raise HTTPException(404, "Subfolder not found")
        shutil.rmtree(target)
        return {"ok": True}

    @plants.patch("/{site_id}/folders/{folder}")
    async def rename_folder(site_id: str, folder: str,
                            body: Dict[str, Any],
                            user=Depends(get_current_user)):
        """Rename a folder in place.  Fails if the destination already
        exists so a rename never silently overwrites another folder."""
        await _require_doc_editor(user)
        await _assert_plant_visible(site_id, user)
        old = _safe_name(folder)
        new = _safe_name(str(body.get("name") or ""))
        if old == new:
            return {"name": new}
        src = _plant_root(site_id) / old
        dst = _plant_root(site_id) / new
        if not src.exists() or not src.is_dir():
            raise HTTPException(404, "Folder not found")
        if dst.exists():
            raise HTTPException(400, "A folder with that name already exists")
        src.rename(dst)
        return {"name": new, "previous": old}

    @plants.get("/{site_id}/folders/{folder}/download")
    async def download_folder_zip(site_id: str, folder: str,
                                  user=Depends(get_current_user)):
        """Streams a `.zip` containing every file inside a folder.  Empty
        folders return a valid empty zip so the client always gets a file."""
        await _assert_plant_visible(site_id, user)
        if not await _has_folder_access(user, folder, "view"):
            raise HTTPException(403, "Access denied")
        folder = _safe_name(folder)
        target = _plant_root(site_id) / folder
        if not target.exists() or not target.is_dir():
            raise HTTPException(404, "Folder not found")
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for entry in target.rglob("*"):
                if entry.is_file():
                    zf.write(entry, arcname=entry.relative_to(target).as_posix())
        buf.seek(0)
        zip_name = f"{folder}.zip"
        return StreamingResponse(
            iter([buf.getvalue()]),
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{zip_name}"'},
        )

    # ---------- Files ----------
    @plants.get("/{site_id}/folders/{folder}/files")
    async def list_files(site_id: str, folder: str,
                         subfolder: str = "",
                         user=Depends(get_current_user)):
        """List files (and sub-subfolders) inside a folder or subfolder."""
        await _assert_plant_visible(site_id, user)
        if not await _has_folder_access(user, folder, "view"):
            raise HTTPException(403, "Access denied")
        target = _resolve_dir(site_id, folder, subfolder)
        can_edit = await _has_folder_access(user, folder, "edit")
        if not target.exists():
            return {"files": [], "subfolders": [], "can_edit": can_edit}
        files = []
        subfolders_out = []
        for entry in sorted(target.iterdir(), key=lambda p: p.name.lower()):
            if entry.is_file():
                st = entry.stat()
                files.append({
                    "name": entry.name,
                    "size_bytes": st.st_size,
                    "modified_at": datetime.fromtimestamp(st.st_mtime,
                                                         timezone.utc).isoformat(),
                })
            elif entry.is_dir():
                try:
                    fc = len([f for f in entry.iterdir() if f.is_file()])
                except OSError:
                    fc = 0
                subfolders_out.append({"name": entry.name, "file_count": fc})
        return {
            "files": files,
            "subfolders": subfolders_out,
            "can_edit": can_edit,
        }

    @plants.post("/{site_id}/folders/{folder}/upload")
    async def upload_file(site_id: str, folder: str,
                          subfolder: Optional[str] = None,
                          file: UploadFile = File(...),
                          user=Depends(get_current_user)):
        if not await _has_folder_access(user, folder, "edit"):
            raise HTTPException(403, "Access denied")
        await _assert_plant_visible(site_id, user)
        folder = _safe_name(folder)

        # Check if this is a folder upload (has webkitRelativePath)
        # webkitRelativePath will be set when a folder is uploaded
        is_folder_upload = hasattr(file, 'webkitRelativePath') and file.webkitRelativePath

        if is_folder_upload:
            # This is a folder upload
            # webkitRelativePath looks like: "FolderName/SubFolder/File.txt"
            full_path = file.webkitRelativePath.split("/")  # ["FolderName", "SubFolder", "File.txt"]

            # The first part is the folder name we're uploading to
            # The rest is the relative path within that folder
            target_dir = _plant_root(site_id) / folder
            target_dir.mkdir(parents=True, exist_ok=True)

            # Create all subdirectories (except the last part which is the filename)
            if len(full_path) > 1:
                for part in full_path[:-1]:  # Process all parts except the last one
                    target_dir = target_dir / _safe_name(part)
                    target_dir.mkdir(parents=True, exist_ok=True)

            # The last part is the actual filename
            fname = _sanitize_filename(full_path[-1])

            # For folder uploads, subfolder should be empty
            target_dir = _resolve_dir(site_id, folder, "")
        else:
            # This is a standard single file upload
            fname = _sanitize_filename(file.filename or "upload.bin")
            target_dir = _resolve_dir(site_id, folder, subfolder)

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
                            subfolder: str = "",
                            user=Depends(get_current_user)):
        await _assert_plant_visible(site_id, user)
        if not await _has_folder_access(user, folder, "view"):
            raise HTTPException(403, "Access denied")
        filename = _sanitize_filename(filename)
        target = _resolve_dir(site_id, folder, subfolder) / filename
        if not target.exists() or not target.is_file():
            raise HTTPException(404, "File not found")
        return FileResponse(target, filename=filename)

    @plants.delete("/{site_id}/folders/{folder}/files/{filename}")
    async def delete_file(site_id: str, folder: str, filename: str,
                          subfolder: str = "",
                          user=Depends(get_current_user)):
        if not await _has_folder_access(user, folder, "edit"):
            raise HTTPException(403, "Access denied")
        await _assert_plant_visible(site_id, user)
        filename = _sanitize_filename(filename)
        target = _resolve_dir(site_id, folder, subfolder) / filename
        if not target.exists():
            raise HTTPException(404, "File not found")
        target.unlink()
        return {"ok": True}

    router.include_router(plants)
    return router, plants


async def bootstrap_new_plant(db, site_id: str) -> None:
    """Called from `_upsert_site` right after a new plant row is inserted —
    auto-provisions the template folders and subfolders on disk so admins land on a
    pre-organised vault the first time they open the Documents tab.
    Never raises so a folder failure never blocks site creation."""
    try:
        row = await db.plant_doc_template.find_one({"_id": "default"}, {"_id": 0})
        folders = list(row["folders"]) if row and row.get("folders") else list(DEFAULT_TEMPLATE_FOLDERS)
        subfolders = row.get("subfolders", {}) if row else {}
        root = Path(os.environ.get("LOCAL_PLANT_DOCS_ROOT", PLANT_DOCS_ROOT_DEFAULT)) / site_id
        for f in folders:
            (root / f).mkdir(parents=True, exist_ok=True)
            for sf in subfolders.get(f, []):
                (root / f / sf).mkdir(parents=True, exist_ok=True)
    except Exception:
        # Bootstrapping is best-effort — never crash site creation.
        pass
