"""
Backup & Restore
================

Full-stack snapshot of the FormForge deployment (MongoDB dump + all upload
folders) into a single `.tar.gz` file under `$BACKUP_ROOT`.  A rolling
retention window (default 3 days) auto-deletes older snapshots.

Endpoints (all `super_admin` only):
    GET    /api/backups              — list snapshots
    POST   /api/backups              — create manual snapshot now
    GET    /api/backups/{name}/download — download the .tar.gz
    POST   /api/backups/{name}/restore  — restore this snapshot (destructive)
    DELETE /api/backups/{name}          — delete a snapshot
    GET    /api/backup-config        — { enabled, hour_utc, minute_utc,
                                         retention_days, last_run_at }
    PUT    /api/backup-config        — update auto-backup schedule

Layout of a snapshot tar.gz:
    manifest.json
    mongo/               ← output of `mongodump --archive` (single file)
    uploads/             ← full copy of `LOCAL_UPLOAD_ROOT` (recursive)
"""
from __future__ import annotations

import asyncio
import json
import os
import shutil
import subprocess
import tarfile
import tempfile
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse


BACKUP_ROOT = Path(os.environ.get("BACKUP_ROOT", "/app/backend/uploads/backups"))
UPLOAD_ROOT = Path(os.environ.get("LOCAL_UPLOAD_ROOT", "/app/backend/uploads/local"))
DEFAULT_RETENTION_DAYS = int(os.environ.get("BACKUP_RETENTION_DAYS", "3"))

# Every upload root that must live inside a migration-complete snapshot.
# Each pair is (destination-name-inside-tar, source-path).  Missing paths
# are silently skipped so a partially-set-up environment still snapshots.
def _upload_roots():
    return [
        ("local",     UPLOAD_ROOT),
        ("pdf",       Path(os.environ.get("LOCAL_PDF_TEMPLATES_ROOT", "/app/backend/uploads/pdf"))),
        ("completed", Path(os.environ.get("LOCAL_COMPLETED_PDF_ROOT", "/app/backend/uploads/completed"))),
        ("assets",    Path(os.environ.get("LOCAL_ASSETS_ROOT",         "/app/backend/uploads/assets"))),
    ]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_backup_root() -> None:
    BACKUP_ROOT.mkdir(parents=True, exist_ok=True)


async def _require_super(user) -> None:
    if user.role != "super_admin" and not getattr(user, "access_override", False):
        raise HTTPException(403, "Only super_admin can manage backups")


# ---------------------------------------------------------------------------
# Core create / restore
# ---------------------------------------------------------------------------
def _mongo_uri() -> str:
    # `.env` values sometimes come in quoted; strip them so the command-line
    # tools (mongodump/mongorestore) receive a clean URI.
    return (os.environ.get("MONGO_URL", "mongodb://localhost:27017") or "").strip().strip('"').strip("'")


def _db_name() -> str:
    return (os.environ.get("DB_NAME", "formforge") or "").strip().strip('"').strip("'")


def _create_snapshot_sync(reason: str = "manual") -> Dict[str, Any]:
    """Blocking snapshot creation — invoked via `asyncio.to_thread()` so it
    doesn't stall the event loop.  Uses `mongodump` (must be on PATH).
    """
    _ensure_backup_root()
    ts = _now().strftime("%Y-%m-%d_%H%M%S")
    name = f"formforge-{ts}.tar.gz"
    out_path = BACKUP_ROOT / name

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        mongo_dir = tmp_dir / "mongo"
        mongo_dir.mkdir()
        # 1) mongodump — one archive file for portability.
        try:
            _cmd = ["mongodump",
                    "--uri=" + _mongo_uri(),
                    "--db=" + _db_name(),
                    "--archive=" + str(mongo_dir / "dump.archive"),
                    "--gzip"]
            subprocess.run(_cmd, check=True, capture_output=True, timeout=600)
        except FileNotFoundError:
            raise HTTPException(500, "mongodump not installed on this server")
        except subprocess.CalledProcessError as e:
            raise HTTPException(500, f"mongodump failed: {e.stderr.decode(errors='ignore')[:400]}")
        except subprocess.TimeoutExpired:
            raise HTTPException(500, "mongodump timed out (>10min)")

        # 2) uploads/ — copy every configured upload root as its own
        # subdirectory so the snapshot is a true migration bundle (Mongo +
        # `local/`, `pdf/`, `completed/`, `assets/`).
        uploads_dst = tmp_dir / "uploads"
        uploads_dst.mkdir()
        for _sub, _src in _upload_roots():
            if _src.exists():
                try:
                    shutil.copytree(_src, uploads_dst / _sub)
                except Exception as e:  # noqa: BLE001
                    raise HTTPException(500, f"failed to copy {_sub}: {e}")

        # 3) manifest
        manifest = {
            "version": 1,
            "created_at": _now().isoformat(),
            "reason": reason,
            "db_name": _db_name(),
            "upload_root_source": str(UPLOAD_ROOT),
            "uploads_size_bytes": _dir_size(uploads_dst),
        }
        (tmp_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))

        # 4) tar.gz
        with tarfile.open(out_path, "w:gz") as tar:
            for entry in tmp_dir.iterdir():
                tar.add(entry, arcname=entry.name)

    size = out_path.stat().st_size
    return {"name": name, "size_bytes": size, "created_at": manifest["created_at"],
            "reason": reason}


def _restore_snapshot_sync(name: str) -> Dict[str, Any]:
    _ensure_backup_root()
    src = BACKUP_ROOT / name
    if not src.exists():
        raise HTTPException(404, "Backup not found")

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        # 1) extract
        with tarfile.open(src, "r:gz") as tar:
            tar.extractall(tmp_dir)  # trusted source (super_admin only)
        # 2) restore Mongo (drop-existing)
        archive = tmp_dir / "mongo" / "dump.archive"
        if not archive.exists():
            raise HTTPException(400, "Snapshot missing Mongo archive")
        try:
            subprocess.run(
                ["mongorestore",
                 "--uri=" + _mongo_uri(),
                 "--nsInclude", f"{_db_name()}.*",
                 "--drop",
                 "--gzip",
                 "--archive=" + str(archive)],
                check=True, capture_output=True, timeout=600,
            )
        except FileNotFoundError:
            raise HTTPException(500, "mongorestore not installed on this server")
        except subprocess.CalledProcessError as e:
            raise HTTPException(500, f"mongorestore failed: {e.stderr.decode(errors='ignore')[:400]}")

        # 3) restore uploads — each configured root gets re-populated from
        # its matching sub-folder inside the bundle.  Existing content is
        # replaced.  Missing sub-folders are ignored so partial bundles
        # still restore whatever they carry.
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
    return {"restored_at": _now().isoformat(), "name": name}


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
        if not f.is_file() or not f.name.endswith(".tar.gz"):
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
    """Wake every minute; when local wall-clock matches the configured
    `hour_utc:minute_utc`, run a snapshot.  Persists `last_run_at` in
    `backup_config` so we don't double-run within the same minute."""
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
                            info = await asyncio.to_thread(_create_snapshot_sync, "auto")
                            retention = int(cfg.get("retention_days", DEFAULT_RETENTION_DAYS))
                            _prune_old(retention)
                            await db.backup_config.update_one(
                                {"_id": "default"},
                                {"$set": {"last_run_at": now.isoformat(),
                                          "last_run_name": info["name"]}},
                                upsert=True,
                            )
                        except Exception:  # noqa: BLE001
                            pass
        except Exception:  # noqa: BLE001
            pass
        await asyncio.sleep(30)


# ---------------------------------------------------------------------------
# API router
# ---------------------------------------------------------------------------
def build_router(db, get_current_user):
    router = APIRouter(prefix="/backups", tags=["backups"])
    cfg_router = APIRouter(prefix="/backup-config", tags=["backups"])

    def _list_snapshots() -> List[Dict[str, Any]]:
        _ensure_backup_root()
        out = []
        for f in sorted(BACKUP_ROOT.iterdir(),
                        key=lambda p: p.stat().st_mtime if p.exists() else 0,
                        reverse=True):
            if not f.is_file() or not f.name.endswith(".tar.gz"):
                continue
            st = f.stat()
            out.append({
                "name": f.name,
                "size_bytes": st.st_size,
                "created_at": datetime.fromtimestamp(st.st_mtime, timezone.utc).isoformat(),
            })
        return out

    @router.get("")
    async def list_backups(user=Depends(get_current_user)):
        await _require_super(user)
        cfg = await db.backup_config.find_one({"_id": "default"}, {"_id": 0}) or {}
        return {"snapshots": _list_snapshots(),
                "retention_days": int(cfg.get("retention_days", DEFAULT_RETENTION_DAYS))}

    @router.post("")
    async def create_backup(user=Depends(get_current_user)):
        await _require_super(user)
        info = await asyncio.to_thread(_create_snapshot_sync, "manual")
        cfg = await db.backup_config.find_one({"_id": "default"}, {"_id": 0}) or {}
        retention = int(cfg.get("retention_days", DEFAULT_RETENTION_DAYS))
        _prune_old(retention)
        return info

    @router.get("/{name}/download")
    async def download_backup(name: str, user=Depends(get_current_user)):
        await _require_super(user)
        # basic name safety
        if "/" in name or ".." in name or not name.endswith(".tar.gz"):
            raise HTTPException(400, "Invalid backup name")
        path = BACKUP_ROOT / name
        if not path.exists():
            raise HTTPException(404, "Backup not found")
        return FileResponse(path, filename=name, media_type="application/gzip")

    @router.post("/{name}/restore")
    async def restore_backup(name: str, user=Depends(get_current_user)):
        await _require_super(user)
        if "/" in name or ".." in name or not name.endswith(".tar.gz"):
            raise HTTPException(400, "Invalid backup name")
        info = await asyncio.to_thread(_restore_snapshot_sync, name)
        return info

    @router.delete("/{name}")
    async def delete_backup(name: str, user=Depends(get_current_user)):
        await _require_super(user)
        if "/" in name or ".." in name or not name.endswith(".tar.gz"):
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
    """Called once from `@app.on_event('startup')`."""
    return asyncio.create_task(_scheduler_loop(db))
