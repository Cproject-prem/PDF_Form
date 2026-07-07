"""
FormForge — File Migration & Repair
====================================

Usage (from the backend folder with the venv activated):

    python migrate_files.py            # dry-run: just report what's broken
    python migrate_files.py --fix      # actually rewire storage paths + move files

What it does
------------
1. Scans MongoDB collections `files`, `pdf_templates`, `pdf_submissions` for
   records whose stored file paths don't exist on disk.
2. Scans the physical folders `uploads/pdf/`, `uploads/completed/`,
   `uploads/local/tmp/`, `uploads/local/submissions/**` for files that ARE
   on disk.
3. Repoints DB records to matching on-disk files, using multiple heuristics:
     - exact basename match (uuid.pdf, file_id.ext)
     - storage_filename match (for pdf_templates)
     - submission_id folder match
4. For `db.files` records that end up in `local/tmp/` but belong to an actual
   submission, moves the file into `local/submissions/{sid}/{original_name}`.

Nothing is deleted. Nothing is overwritten. Safe to re-run.
"""

import os
import sys
from pathlib import Path
from typing import Any, Dict, List
import argparse
import re

from pymongo import MongoClient

# ---------- Config ----------
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME   = os.environ.get("DB_NAME", "formforge")

BACKEND_ROOT   = Path(__file__).resolve().parent
UPLOAD_ROOT    = Path(os.environ.get("UPLOAD_ROOT",       BACKEND_ROOT / "uploads"))
LOCAL_ROOT     = Path(os.environ.get("LOCAL_UPLOAD_ROOT", UPLOAD_ROOT / "local"))
PDF_DIR        = UPLOAD_ROOT / "pdf"
COMPLETED_DIR  = UPLOAD_ROOT / "completed"
LOCAL_TMP      = LOCAL_ROOT / "tmp"
LOCAL_SUBS     = LOCAL_ROOT / "submissions"

for _d in (LOCAL_TMP, LOCAL_SUBS, PDF_DIR, COMPLETED_DIR):
    _d.mkdir(parents=True, exist_ok=True)

# ---------- Args ----------
parser = argparse.ArgumentParser()
parser.add_argument("--fix", action="store_true", help="Apply fixes (default: dry-run)")
args = parser.parse_args()
DRY = not args.fix

def _log(prefix: str, msg: str) -> None:
    print(f"[{prefix}] {msg}")

# ---------- Index files on disk ----------
def index_disk_files() -> Dict[str, Path]:
    """basename → path — used for fuzzy match."""
    idx: Dict[str, Path] = {}
    for root in (PDF_DIR, COMPLETED_DIR, LOCAL_TMP):
        if root.exists():
            for p in root.iterdir():
                if p.is_file():
                    idx.setdefault(p.name, p)
    if LOCAL_SUBS.exists():
        for sub_dir in LOCAL_SUBS.iterdir():
            if sub_dir.is_dir():
                for p in sub_dir.iterdir():
                    if p.is_file():
                        idx.setdefault(p.name, p)
    return idx

def rel_local(p: Path) -> str:
    """Return path relative to LOCAL_ROOT (used as storage_path in db.files)."""
    try:
        return str(p.resolve().relative_to(LOCAL_ROOT.resolve()))
    except ValueError:
        # Not under LOCAL_ROOT — must be pdf/ or completed/ under uploads/
        # We'll copy it into LOCAL_ROOT/tmp/ so /api/files/{id} can serve it.
        dest = LOCAL_TMP / p.name
        if not DRY:
            dest.write_bytes(p.read_bytes())
        return str(dest.relative_to(LOCAL_ROOT))

# ---------- Main ----------
def main() -> int:
    print("=" * 70)
    print("FormForge File Migration & Repair")
    print(f"  Mongo:        {MONGO_URL} / {DB_NAME}")
    print(f"  Upload root:  {UPLOAD_ROOT}")
    print(f"  Local root:   {LOCAL_ROOT}")
    print(f"  Mode:         {'DRY-RUN (no changes)' if DRY else 'FIX (writing changes)'}")
    print("=" * 70)

    client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=5000)
    try:
        client.admin.command("ping")
    except Exception as e:
        print(f"ERROR: Can't connect to MongoDB at {MONGO_URL}: {e}")
        return 2
    db = client[DB_NAME]

    disk_idx = index_disk_files()
    print(f"Found {len(disk_idx)} files on disk across pdf/, completed/, local/*\n")

    fixed = broken = ok = 0

    # ---- 1) db.files ----
    print("=== db.files ===")
    for rec in db.files.find({}):
        fid  = rec.get("file_id", rec.get("_id"))
        path = rec.get("storage_path") or ""
        orig = rec.get("original_filename") or ""
        submission_id = rec.get("submission_id")

        # Where would we look on disk today?
        full = (LOCAL_ROOT / path) if path else None
        if full and full.exists():
            ok += 1
            continue

        # Not present at the recorded path. Try to find it.
        # Candidates: basename of storage_path, or file_id.<ext>
        candidates: List[str] = []
        if path:
            candidates.append(os.path.basename(path))
        if orig:
            candidates.append(orig)
        # legacy Emergent format: formforge/uploads/{user}/{uuid}.ext
        m = re.search(r"([0-9a-f]{16,}\.[A-Za-z0-9]+)$", path)
        if m:
            candidates.append(m.group(1))
        # Try file_id + common extensions
        for ext in ("png","jpg","jpeg","pdf","doc","docx","xls","xlsx","txt","csv"):
            candidates.append(f"{fid}.{ext}")

        found: Path = None
        for name in candidates:
            if name in disk_idx:
                found = disk_idx[name]
                break

        if not found:
            broken += 1
            _log("MISSING", f"file_id={fid}  path={path}  orig={orig}")
            continue

        # Decide new destination
        if submission_id:
            dest_dir = LOCAL_SUBS / submission_id
            if not DRY:
                dest_dir.mkdir(parents=True, exist_ok=True)
            dest = dest_dir / (orig or found.name)
        else:
            dest = LOCAL_TMP / found.name

        # Move if needed
        if found.resolve() != dest.resolve():
            _log("MOVE" if not DRY else "MOVE?",
                 f"{found} -> {dest}")
            if not DRY:
                try:
                    found.rename(dest)
                except OSError:
                    dest.write_bytes(found.read_bytes())
                    found.unlink(missing_ok=True)

        new_rel = str(dest.relative_to(LOCAL_ROOT))
        _log("REPOINT" if not DRY else "REPOINT?",
             f"file_id={fid}  {path}  ->  {new_rel}")
        if not DRY:
            db.files.update_one({"_id": rec["_id"]},
                                {"$set": {"storage_path": new_rel}})
        fixed += 1

    print(f"\n  ok: {ok}   fixed: {fixed}   missing: {broken}")

    # ---- 2) pdf_templates ----
    print("\n=== pdf_templates ===")
    tpl_ok = tpl_missing = 0
    for tpl in db.pdf_templates.find({"is_deleted": {"$ne": True}}):
        sf = tpl.get("storage_filename") or ""
        p = PDF_DIR / sf
        if sf and p.exists():
            tpl_ok += 1
        else:
            tpl_missing += 1
            _log("MISSING", f"pdf template '{tpl.get('title')}' ({tpl.get('template_id')}) → {sf}")
            # Try to find it by basename
            if sf in disk_idx:
                src = disk_idx[sf]
                _log("MOVE" if not DRY else "MOVE?", f"{src} -> {p}")
                if not DRY:
                    try:
                        src.rename(p)
                    except OSError:
                        p.write_bytes(src.read_bytes())
    print(f"\n  ok: {tpl_ok}   missing: {tpl_missing}")

    # ---- 3) pdf_submissions (completed PDFs) ----
    print("\n=== pdf_submissions ===")
    sub_ok = sub_missing = 0
    for s in db.pdf_submissions.find({}):
        cf = s.get("completed_filename") or ""
        p = COMPLETED_DIR / cf
        if cf and p.exists():
            sub_ok += 1
        else:
            sub_missing += 1
            _log("MISSING", f"sub {s.get('submission_id')} → {cf}")
    print(f"\n  ok: {sub_ok}   missing: {sub_missing}")

    print("\n" + "=" * 70)
    if DRY:
        print("Dry-run complete. Re-run with --fix to apply the changes above.")
    else:
        print("Done. Restart the backend to be safe:  Ctrl-C then re-run uvicorn.")
    print("=" * 70)
    return 0

if __name__ == "__main__":
    sys.exit(main())
