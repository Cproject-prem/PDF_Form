"""
Backup & Restore (RAR Format & Password Protected)
===================================================

Full-stack snapshot of the FormForge deployment (MongoDB dump + all upload
folders) into a single encrypted `.rar` backup archive under `$BACKUP_ROOT`.
A rolling retention window (default 3 days) auto-deletes older snapshots.

Security & Password Protection Architecture:
--------------------------------------------
- **RAR Format**: Native `.rar` file created via WinRAR / Rar tool with header & data encryption (`-hp<password>`).
- **Manual Backups**: Super Admin can specify a custom password or leave it blank
  to use the system default backup password from `BACKUP_PASSWORD` in `.env`.
- **Automatic / Scheduled Backups**: Automatically encrypted into `.rar` format using `BACKUP_PASSWORD` defined in `.env`.
- **Restoration (Server / File Upload)**: Requires entering the decryption password.
  If the password does not match, restoration aborts with HTTP 400.
"""
from __future__ import annotations

import asyncio
import base64
import json
import os
import shutil
import subprocess
import tarfile
import tempfile
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC


BACKUP_ROOT = Path(os.environ.get("BACKUP_ROOT", "D:/Website/PDF Form/backend/uploads/backups"))
UPLOAD_ROOT = Path(os.environ.get("LOCAL_UPLOAD_ROOT", "D:/Website/PDF Form/backend/uploads/local"))
DEFAULT_RETENTION_DAYS = int(os.environ.get("BACKUP_RETENTION_DAYS", "3"))


def _upload_roots():
    return [
        ("local",     UPLOAD_ROOT),
        ("pdf",       Path(os.environ.get("LOCAL_PDF_TEMPLATES_ROOT", "D:/Website/PDF Form/backend/uploads/pdf"))),
        ("completed", Path(os.environ.get("LOCAL_COMPLETED_PDF_ROOT", "D:/Website/PDF Form/backend/uploads/completed"))),
        ("assets",    Path(os.environ.get("LOCAL_ASSETS_ROOT",         "D:/Website/PDF Form/backend/uploads/assets"))),
    ]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_backup_root() -> None:
    BACKUP_ROOT.mkdir(parents=True, exist_ok=True)


async def _require_super(user) -> None:
    role = getattr(user, "role", "") if not isinstance(user, dict) else user.get("role", "")
    override = getattr(user, "access_override", False) if not isinstance(user, dict) else bool(user.get("access_override", False))
    if role != "super_admin" and not override:
        raise HTTPException(403, "Only super_admin can manage backups")


def _rar_bin() -> Optional[str]:
    """Locate WinRAR / Rar CLI executable."""
    override = (os.environ.get("RAR_BIN") or "").strip().strip('"').strip("'")
    if override and os.path.exists(override):
        return override
    found = shutil.which("rar") or shutil.which("rar.exe") or shutil.which("WinRAR") or shutil.which("WinRAR.exe")
    if found:
        return found
    winrar = r"C:\Program Files\WinRAR\Rar.exe"
    if os.path.exists(winrar):
        return winrar
    return None


# ---------------------------------------------------------------------------
# Encryption / Decryption Helpers (Fallback)
# ---------------------------------------------------------------------------
def _derive_key(password: str, salt: bytes) -> bytes:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=100_000,
    )
    return base64.urlsafe_b64encode(kdf.derive(password.encode("utf-8")))


def _encrypt_bytes(data: bytes, password: str) -> bytes:
    salt = os.urandom(16)
    key = _derive_key(password, salt)
    fernet = Fernet(key)
    return salt + fernet.encrypt(data)


def _decrypt_bytes(encrypted_blob: bytes, password: str) -> bytes:
    if len(encrypted_blob) < 16:
        raise ValueError("Payload too short")
    salt = encrypted_blob[:16]
    cipher_text = encrypted_blob[16:]
    key = _derive_key(password, salt)
    fernet = Fernet(key)
    return fernet.decrypt(cipher_text)


# ---------------------------------------------------------------------------
# Core create / restore
# ---------------------------------------------------------------------------
def _mongo_uri() -> str:
    return (os.environ.get("MONGO_URL", "mongodb://localhost:27017") or "").strip().strip('"').strip("'")


def _db_name() -> str:
    return (os.environ.get("DB_NAME", "formforge") or "").strip().strip('"').strip("'")


def _tool_path(exe: str, env_var: str) -> str:
    override = (os.environ.get(env_var) or "").strip().strip('"').strip("'")
    if override:
        return override
    found = shutil.which(exe) or shutil.which(exe + ".exe")
    if found:
        return found
    if os.name == "nt":
        candidates = []
        for root in (r"C:\Program Files\MongoDB\Tools",
                     r"C:\Program Files\MongoDB",
                     r"C:\Program Files (x86)\MongoDB\Tools"):
            if not os.path.isdir(root):
                continue
            for dirpath, _dirs, files in os.walk(root):
                if exe + ".exe" in files:
                    candidates.append(os.path.join(dirpath, exe + ".exe"))
        if candidates:
            return sorted(candidates)[-1]
    return exe


def _create_snapshot_sync(reason: str = "manual", custom_password: Optional[str] = None) -> Dict[str, Any]:
    """Blocking snapshot creation — creates native .rar password-protected archive."""
    _ensure_backup_root()
    ts = _now().strftime("%Y-%m-%d_%H%M%S")
    name = f"formforge-{ts}.rar"
    out_path = BACKUP_ROOT / name

    env_pass = (os.environ.get("BACKUP_PASSWORD") or "").strip() or "FormForgeBackup@2026"
    pass_to_use = (custom_password or "").strip() or env_pass

    rar_exe = _rar_bin()

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        mongo_dir = tmp_dir / "mongo"
        mongo_dir.mkdir()

        # 1) mongodump
        try:
            _cmd = [_tool_path("mongodump", "MONGODUMP_BIN"),
                    "--uri=" + _mongo_uri(),
                    "--db=" + _db_name(),
                    "--archive=" + str(mongo_dir / "dump.archive"),
                    "--gzip"]
            subprocess.run(_cmd, check=True, capture_output=True, timeout=600)
        except FileNotFoundError:
            raise HTTPException(500,
                "mongodump not found. Install MongoDB Database Tools or set MONGODUMP_BIN in backend/.env.")
        except subprocess.CalledProcessError as e:
            raise HTTPException(500, f"mongodump failed: {e.stderr.decode(errors='ignore')[:400]}")
        except subprocess.TimeoutExpired:
            raise HTTPException(500, "mongodump timed out (>10min)")

        # 2) uploads/
        uploads_dst = tmp_dir / "uploads"
        uploads_dst.mkdir()
        for _sub, _src in _upload_roots():
            if _src.exists():
                try:
                    shutil.copytree(_src, uploads_dst / _sub)
                except Exception as e:
                    raise HTTPException(500, f"failed to copy {_sub}: {e}")

        # 3) manifest
        manifest = {
            "version": 1,
            "created_at": _now().isoformat(),
            "reason": reason,
            "db_name": _db_name(),
            "upload_root_source": str(UPLOAD_ROOT),
            "uploads_size_bytes": _dir_size(uploads_dst),
            "format": "rar",
            "encrypted": True,
            "custom_password_used": bool(custom_password and custom_password.strip())
        }
        (tmp_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))

        # 4) Package into RAR format with password protection
        if rar_exe:
            # -hp<password> encrypts data + headers
            cmd = [
                rar_exe, 'a', f'-hp{pass_to_use}', '-r', '-ep1', str(out_path),
                str(tmp_dir / "manifest.json"),
                str(tmp_dir / "mongo"),
                str(tmp_dir / "uploads")
            ]
            res = subprocess.run(cmd, capture_output=True, text=True)
            if res.returncode != 0:
                raise HTTPException(500, f"WinRAR backup failed: {res.stderr[:400]}")
        else:
            # Fallback if WinRAR is missing
            raw_tar_path = tmp_dir / "backup_raw.tar.gz"
            with tarfile.open(raw_tar_path, "w:gz") as tar:
                for entry in tmp_dir.iterdir():
                    if entry.name != "backup_raw.tar.gz":
                        tar.add(entry, arcname=entry.name)
            raw_bytes = raw_tar_path.read_bytes()
            encrypted_blob = _encrypt_bytes(raw_bytes, pass_to_use)
            out_path.write_bytes(encrypted_blob)

    size = out_path.stat().st_size
    return {
        "name": name,
        "size_bytes": size,
        "created_at": manifest["created_at"],
        "reason": reason,
        "format": "rar",
        "encrypted": True
    }


def _restore_from_path_sync(src: Path, password: Optional[str] = None) -> Dict[str, Any]:
    """Extract & restore password-protected `.rar` snapshot."""
    if not src.exists() or not src.is_file():
        raise HTTPException(404, "Backup file not found")

    env_pass = (os.environ.get("BACKUP_PASSWORD") or "").strip() or "FormForgeBackup@2026"
    custom_pass = (password or "").strip()

    passwords_to_try = []
    if custom_pass:
        passwords_to_try.append(custom_pass)
    if env_pass and env_pass not in passwords_to_try:
        passwords_to_try.append(env_pass)

    rar_exe = _rar_bin()

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        extracted_ok = False

        # 1. Attempt WinRAR extraction using passwords_to_try
        if rar_exe:
            for p in passwords_to_try:
                cmd = [rar_exe, 'x', f'-hp{p}', '-y', str(src), str(tmp_dir) + os.sep]
                res = subprocess.run(cmd, capture_output=True, text=True)
                if res.returncode == 0 and (tmp_dir / "mongo").exists():
                    extracted_ok = True
                    break

        # 2. Fallback extraction for fallback encrypted files or legacy archives
        if not extracted_ok:
            raw_bytes = src.read_bytes()
            decrypted_bytes = None
            for p in passwords_to_try:
                try:
                    decrypted_bytes = _decrypt_bytes(raw_bytes, p)
                    break
                except Exception:
                    pass

            if decrypted_bytes is None and raw_bytes.startswith(b"\x1f\x8b"):
                decrypted_bytes = raw_bytes

            if decrypted_bytes:
                raw_tar_path = tmp_dir / "restoring.tar.gz"
                raw_tar_path.write_bytes(decrypted_bytes)
                try:
                    with tarfile.open(raw_tar_path, "r:gz") as tar:
                        tar.extractall(tmp_dir)
                    extracted_ok = True
                except Exception:
                    pass

        if not extracted_ok:
            raise HTTPException(
                400,
                "Invalid backup decryption password. Please enter the correct password used when this RAR backup was created."
            )

        # 3. Restore Mongo (drop-existing)
        archive = tmp_dir / "mongo" / "dump.archive"
        if not archive.exists():
            raise HTTPException(400, "Snapshot missing Mongo archive")
        try:
            subprocess.run(
                [_tool_path("mongorestore", "MONGORESTORE_BIN"),
                 "--uri=" + _mongo_uri(),
                 "--nsInclude", f"{_db_name()}.*",
                 "--drop",
                 "--gzip",
                 "--archive=" + str(archive)],
                check=True, capture_output=True, timeout=600,
            )
        except FileNotFoundError:
            raise HTTPException(500,
                "mongorestore not found. Install MongoDB Database Tools or set MONGORESTORE_BIN in backend/.env.")
        except subprocess.CalledProcessError as e:
            raise HTTPException(500, f"mongorestore failed: {e.stderr.decode(errors='ignore')[:400]}")

        # 4. Restore uploads
        uploads_src = tmp_dir / "uploads"
        if uploads_src.exists():
            for _sub, _dst in _upload_roots():
                _src = uploads_src / _sub
                if not _src.exists():
                    continue
                if _dst.exists():
                    shutil.rmtree(_dst)
                _dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copytree(_src, _dst)

    return {"restored_at": _now().isoformat(), "source": src.name}


def _restore_snapshot_sync(name: str, password: Optional[str] = None) -> Dict[str, Any]:
    _ensure_backup_root()
    src = BACKUP_ROOT / name
    if not src.exists():
        raise HTTPException(404, "Backup not found")
    info = _restore_from_path_sync(src, password)
    info["name"] = name
    return info


def _dir_size(p: Path) -> int:
    if not p.exists():
        return 0
    total = 0
    for f in p.rglob("*"):
        if f.is_file():
            try:
                total += f.stat().st_size
            except OSError:
                pass
    return total


def _prune_old(retention_days: int) -> int:
    _ensure_backup_root()
    cutoff = _now() - timedelta(days=max(1, retention_days))
    removed = 0
    for f in BACKUP_ROOT.iterdir():
        if not f.is_file() or not (f.name.endswith(".rar") or f.name.endswith(".tar.gz") or f.name.endswith(".enc") or f.name.endswith(".tgz")):
            continue
        mtime = datetime.fromtimestamp(f.stat().st_mtime, timezone.utc)
        if mtime < cutoff:
            try:
                f.unlink()
                removed += 1
            except OSError:
                pass
    return removed


# ---------------------------------------------------------------------------
# Scheduler task (runs inside the FastAPI event loop)
# ---------------------------------------------------------------------------
async def _scheduler_loop(db) -> None:
    """Automatic background backup task producing RAR archives."""
    while True:
        try:
            cfg = await db.backup_config.find_one({"_id": "default"}, {"_id": 0}) or {}
            if cfg.get("enabled"):
                hh = int(cfg.get("hour_utc", 3))
                mm = int(cfg.get("minute_utc", 0))
                now = _now()
                if now.hour == hh and now.minute == mm:
                    last = cfg.get("last_run_at")
                    do_run = True
                    if last:
                        try:
                            last_dt = datetime.fromisoformat(last)
                            if (now - last_dt).total_seconds() < 55:
                                do_run = False
                        except Exception:
                            pass
                    if do_run:
                        try:
                            info = await asyncio.to_thread(_create_snapshot_sync, "auto", None)
                            retention = int(cfg.get("retention_days", DEFAULT_RETENTION_DAYS))
                            _prune_old(retention)
                            await db.backup_config.update_one(
                                {"_id": "default"},
                                {"$set": {"last_run_at": now.isoformat(),
                                          "last_run_name": info["name"]}},
                                upsert=True,
                            )
                        except Exception:
                            pass
        except Exception:
            pass
        await asyncio.sleep(30)


# ---------------------------------------------------------------------------
# API router
# ---------------------------------------------------------------------------
class BackupCreateIn(BaseModel):
    password: Optional[str] = None

class BackupRestoreIn(BaseModel):
    password: Optional[str] = None


def build_router(db, get_current_user):
    router = APIRouter(prefix="/backups", tags=["backups"])
    cfg_router = APIRouter(prefix="/backup-config", tags=["backups"])

    def _list_snapshots() -> List[Dict[str, Any]]:
        _ensure_backup_root()
        out = []
        for f in sorted(BACKUP_ROOT.iterdir(),
                        key=lambda p: p.stat().st_mtime if p.exists() else 0,
                        reverse=True):
            if not f.is_file() or not (f.name.endswith(".rar") or f.name.endswith(".tar.gz") or f.name.endswith(".enc") or f.name.endswith(".tgz")):
                continue
            st = f.stat()
            out.append({
                "name": f.name,
                "size_bytes": st.st_size,
                "created_at": datetime.fromtimestamp(st.st_mtime, timezone.utc).isoformat(),
                "format": "rar" if f.name.endswith(".rar") else "tar.gz",
                "encrypted": True,
            })
        return out

    @router.get("")
    async def list_backups(user=Depends(get_current_user)):
        await _require_super(user)
        cfg = await db.backup_config.find_one({"_id": "default"}, {"_id": 0}) or {}
        return {"snapshots": _list_snapshots(),
                "retention_days": int(cfg.get("retention_days", DEFAULT_RETENTION_DAYS))}

    @router.post("")
    async def create_backup(payload: Optional[BackupCreateIn] = None, user=Depends(get_current_user)):
        await _require_super(user)
        pass_arg = payload.password if payload else None
        info = await asyncio.to_thread(_create_snapshot_sync, "manual", pass_arg)
        cfg = await db.backup_config.find_one({"_id": "default"}, {"_id": 0}) or {}
        retention = int(cfg.get("retention_days", DEFAULT_RETENTION_DAYS))
        _prune_old(retention)
        return info

    @router.get("/{name}/download")
    async def download_backup(name: str, user=Depends(get_current_user)):
        await _require_super(user)
        if "/" in name or ".." in name or not (name.endswith(".rar") or name.endswith(".tar.gz") or name.endswith(".enc") or name.endswith(".tgz")):
            raise HTTPException(400, "Invalid backup name")
        path = BACKUP_ROOT / name
        if not path.exists():
            raise HTTPException(404, "Backup not found")
        media_type = "application/x-rar-compressed" if name.endswith(".rar") else "application/octet-stream"
        return FileResponse(path, filename=name, media_type=media_type)

    @router.post("/{name}/restore")
    async def restore_backup(name: str, payload: Optional[BackupRestoreIn] = None, user=Depends(get_current_user)):
        await _require_super(user)
        if "/" in name or ".." in name or not (name.endswith(".rar") or name.endswith(".tar.gz") or name.endswith(".enc") or name.endswith(".tgz")):
            raise HTTPException(400, "Invalid backup name")
        pass_arg = payload.password if payload else None
        info = await asyncio.to_thread(_restore_snapshot_sync, name, pass_arg)
        return info

    @router.post("/upload-restore")
    async def upload_restore(
        file: UploadFile = File(...),
        password: Optional[str] = Form(None),
        user=Depends(get_current_user)
    ):
        await _require_super(user)
        _ensure_backup_root()
        fname = os.path.basename(file.filename or "").strip()
        if not fname or not (fname.endswith(".rar") or fname.endswith(".tar.gz") or fname.endswith(".tgz") or fname.endswith(".enc")):
            raise HTTPException(400, "File must be a backup bundle (.rar / .tar.gz / .enc)")
        ts = _now().strftime("%Y-%m-%d_%H%M%S")
        safe_stem = fname.replace("/", "_").replace("\\", "_")
        dest = BACKUP_ROOT / f"uploaded-{ts}-{safe_stem}"
        try:
            with open(dest, "wb") as fh:
                while True:
                    chunk = await file.read(1024 * 1024)
                    if not chunk:
                        break
                    fh.write(chunk)
        except Exception as e:
            dest.unlink(missing_ok=True)
            raise HTTPException(500, f"Failed to save uploaded file: {e}")

        try:
            info = await asyncio.to_thread(_restore_from_path_sync, dest, password)
        except HTTPException:
            dest.unlink(missing_ok=True)
            raise
        info["name"] = dest.name
        return info

    @router.delete("/{name}")
    async def delete_backup(name: str, user=Depends(get_current_user)):
        await _require_super(user)
        if "/" in name or ".." in name or not (name.endswith(".rar") or name.endswith(".tar.gz") or name.endswith(".enc") or name.endswith(".tgz")):
            raise HTTPException(400, "Invalid backup name")
        path = BACKUP_ROOT / name
        if path.exists():
            path.unlink()
        return {"ok": True}

    @cfg_router.get("")
    async def get_config(user=Depends(get_current_user)):
        await _require_super(user)
        cfg = await db.backup_config.find_one({"_id": "default"}, {"_id": 0}) or {}
        return {
            "enabled": bool(cfg.get("enabled", False)),
            "hour_utc": int(cfg.get("hour_utc", 3)),
            "minute_utc": int(cfg.get("minute_utc", 0)),
            "retention_days": int(cfg.get("retention_days", DEFAULT_RETENTION_DAYS)),
            "last_run_at": cfg.get("last_run_at"),
            "last_run_name": cfg.get("last_run_name"),
        }

    @cfg_router.put("")
    async def set_config(body: Dict[str, Any], user=Depends(get_current_user)):
        await _require_super(user)
        patch: Dict[str, Any] = {}
        if "enabled" in body:
            patch["enabled"] = bool(body["enabled"])
        if "hour_utc" in body:
            patch["hour_utc"] = max(0, min(23, int(body["hour_utc"])))
        if "minute_utc" in body:
            patch["minute_utc"] = max(0, min(59, int(body["minute_utc"])))
        if "retention_days" in body:
            patch["retention_days"] = max(1, min(30, int(body["retention_days"])))
        if patch:
            await db.backup_config.update_one(
                {"_id": "default"}, {"$set": patch}, upsert=True,
            )
        return await get_config(user)

    return router, cfg_router


def start_scheduler(db) -> asyncio.Task:
    return asyncio.create_task(_scheduler_loop(db))
