"""
FormForge - Backup
==================

Creates a single timestamped .zip file containing:
  1. A full MongoDB dump (all collections as JSON)
  2. The complete uploads/ folder (pdf, completed, local/tmp, local/submissions)

Usage:
    python backup.py                       # writes ./backups/formforge_YYYYMMDD_HHMMSS.zip
    python backup.py --out D:\\my-backups   # custom output folder
    python backup.py --keep 7              # only keep the 7 newest backups
"""
import argparse
import json
import os
import shutil
import sys
import zipfile
from datetime import datetime
from pathlib import Path

from bson import ObjectId
from pymongo import MongoClient

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME   = os.environ.get("DB_NAME",   "formforge")

BACKEND_ROOT = Path(__file__).resolve().parent
UPLOADS_DIR  = BACKEND_ROOT / "uploads"


def json_default(o):
    """Make BSON types JSON-serialisable."""
    if isinstance(o, ObjectId):
        return {"__oid__": str(o)}
    if isinstance(o, datetime):
        return {"__dt__": o.isoformat()}
    if isinstance(o, bytes):
        return {"__bin__": o.hex()}
    raise TypeError(f"Not serialisable: {type(o).__name__}")


def dump_db_to_zip(zf: zipfile.ZipFile) -> dict:
    client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=5000)
    client.admin.command("ping")
    db = client[DB_NAME]
    stats = {}
    for name in sorted(db.list_collection_names()):
        docs = list(db[name].find({}))
        stats[name] = len(docs)
        # Write inside the zip under db/<collection>.json
        zf.writestr(
            f"db/{name}.json",
            json.dumps(docs, default=json_default, indent=1),
        )
        print(f"  db/{name}.json  ({len(docs)} docs)")
    return stats


def add_uploads_to_zip(zf: zipfile.ZipFile) -> int:
    if not UPLOADS_DIR.exists():
        print("  (no uploads/ folder — skipping)")
        return 0
    count = 0
    for p in UPLOADS_DIR.rglob("*"):
        if p.is_file():
            arc = "uploads/" + str(p.relative_to(UPLOADS_DIR)).replace("\\", "/")
            zf.write(p, arc)
            count += 1
    print(f"  uploads/  ({count} files)")
    return count


def prune_old_backups(out_dir: Path, keep: int) -> None:
    backups = sorted(out_dir.glob("formforge_*.zip"), key=lambda p: p.stat().st_mtime)
    to_delete = backups[:-keep] if keep > 0 else []
    for p in to_delete:
        print(f"  pruning old: {p.name}")
        p.unlink()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(BACKEND_ROOT / "backups"),
                    help="Output folder for the backup zip")
    ap.add_argument("--keep", type=int, default=0,
                    help="If >0, keep only this many newest backups")
    args = ap.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    zip_path = out_dir / f"formforge_{stamp}.zip"

    print(f"Backing up  ->  {zip_path}")
    print(f"  Mongo:    {MONGO_URL} / {DB_NAME}")
    print(f"  Uploads:  {UPLOADS_DIR}")

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        # Metadata sidecar
        zf.writestr("backup_meta.json", json.dumps({
            "created_at": datetime.now().isoformat(),
            "mongo_url": MONGO_URL,
            "db_name":   DB_NAME,
            "hostname":  os.environ.get("COMPUTERNAME") or os.uname().nodename,
            "version":   1,
        }, indent=2))
        print("\n--- Collections ---")
        stats = dump_db_to_zip(zf)
        print("\n--- Uploaded files ---")
        n_files = add_uploads_to_zip(zf)

    size_mb = zip_path.stat().st_size / (1024 * 1024)
    total_docs = sum(stats.values())
    print(f"\nDone.  {total_docs} docs across {len(stats)} collections + {n_files} files")
    print(f"       {zip_path.name}  ({size_mb:.2f} MB)")

    if args.keep > 0:
        print("\n--- Rotating ---")
        prune_old_backups(out_dir, args.keep)

    return 0


if __name__ == "__main__":
    sys.exit(main())
