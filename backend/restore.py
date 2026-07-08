"""
FormForge - Restore
===================

Restores a MongoDB + files backup created by `backup.py`.

Usage:
    python restore.py backups\\formforge_20260707_143022.zip           # dry-run
    python restore.py backups\\formforge_20260707_143022.zip --apply   # actually restore

Options:
    --wipe        Drop each restored collection before inserting (recommended
                  for a clean restore). Without --wipe, existing docs are
                  preserved and only missing ones get inserted (by _id).
    --db NAME     Override target database name (defaults to $DB_NAME or
                  'formforge')
    --skip-files  Only restore the DB, don't touch the uploads/ folder
    --skip-db     Only restore the uploads/ folder, don't touch MongoDB

Safe to run repeatedly. Nothing is deleted from disk without --wipe.
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

MONGO_URL_DEFAULT = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME_DEFAULT   = os.environ.get("DB_NAME",   "formforge")

BACKEND_ROOT = Path(__file__).resolve().parent
UPLOADS_DIR  = BACKEND_ROOT / "uploads"


def json_object_hook(o):
    """Reverse of backup.py's json_default — rehydrates BSON types."""
    if "__oid__" in o:
        return ObjectId(o["__oid__"])
    if "__dt__" in o:
        return datetime.fromisoformat(o["__dt__"])
    if "__bin__" in o:
        return bytes.fromhex(o["__bin__"])
    return o


def restore_db(zf: zipfile.ZipFile, db, wipe: bool, dry: bool) -> None:
    coll_files = [n for n in zf.namelist() if n.startswith("db/") and n.endswith(".json")]
    if not coll_files:
        print("  (no db/*.json in backup — skipping DB restore)")
        return
    for cf in sorted(coll_files):
        name = cf[len("db/"):-len(".json")]
        raw = zf.read(cf).decode("utf-8")
        docs = json.loads(raw, object_hook=json_object_hook)
        coll = db[name]

        if wipe:
            action = f"DROP + insert {len(docs)}"
            if not dry:
                coll.drop()
                if docs:
                    coll.insert_many(docs, ordered=False)
        else:
            # upsert by _id, only inserting missing docs
            inserted = 0
            for d in docs:
                _id = d.get("_id")
                if _id is None:
                    if not dry:
                        coll.insert_one(d)
                    inserted += 1
                elif coll.count_documents({"_id": _id}, limit=1) == 0:
                    if not dry:
                        coll.insert_one(d)
                    inserted += 1
            action = f"insert {inserted}/{len(docs)} new (kept existing)"

        print(f"  {name:25s}  {action}")


def restore_uploads(zf: zipfile.ZipFile, dest: Path, dry: bool) -> None:
    uploads_entries = [n for n in zf.namelist() if n.startswith("uploads/") and not n.endswith("/")]
    if not uploads_entries:
        print("  (no uploads/ in backup)")
        return
    n_restored = n_skipped = 0
    for entry in uploads_entries:
        rel = entry[len("uploads/"):]
        target = dest / rel
        if target.exists() and target.stat().st_size == zf.getinfo(entry).file_size:
            n_skipped += 1
            continue
        if not dry:
            target.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(entry) as src, open(target, "wb") as out:
                shutil.copyfileobj(src, out)
        n_restored += 1
    print(f"  restored {n_restored} files, skipped {n_skipped} already-present")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("archive", help="Path to a formforge_*.zip backup")
    ap.add_argument("--apply", action="store_true", help="Actually restore (default is dry-run)")
    ap.add_argument("--wipe", action="store_true", help="Drop collections before inserting")
    ap.add_argument("--db", default=DB_NAME_DEFAULT, help="Target DB name")
    ap.add_argument("--mongo-url", default=MONGO_URL_DEFAULT, help="Target Mongo URL")
    ap.add_argument("--skip-files", action="store_true", help="Do not restore uploads/")
    ap.add_argument("--skip-db",    action="store_true", help="Do not restore MongoDB")
    args = ap.parse_args()

    archive = Path(args.archive)
    if not archive.exists():
        print(f"ERROR: archive not found: {archive}")
        return 2

    dry = not args.apply

    print("=" * 70)
    print("FormForge Restore")
    print(f"  Archive:   {archive}  ({archive.stat().st_size / (1024*1024):.2f} MB)")
    print(f"  Mongo:     {args.mongo_url} / {args.db}")
    print(f"  Wipe:      {args.wipe}")
    print(f"  Mode:      {'DRY-RUN (no changes)' if dry else 'APPLY'}")
    print("=" * 70)

    with zipfile.ZipFile(archive, "r") as zf:
        # Sanity check
        try:
            meta = json.loads(zf.read("backup_meta.json"))
            print(f"  Backup taken: {meta.get('created_at')} on {meta.get('hostname')}")
        except KeyError:
            print("  (no backup_meta.json — legacy backup?)")

        if not args.skip_db:
            print("\n--- Restoring MongoDB ---")
            client = MongoClient(args.mongo_url, serverSelectionTimeoutMS=5000)
            client.admin.command("ping")
            db = client[args.db]
            restore_db(zf, db, args.wipe, dry)

        if not args.skip_files:
            print("\n--- Restoring uploads/ ---")
            restore_uploads(zf, UPLOADS_DIR, dry)

    print("\n" + "=" * 70)
    if dry:
        print("Dry-run complete. Re-run with --apply to actually restore.")
    else:
        print("Restore complete. Restart the backend: Ctrl-C then re-run uvicorn.")
    print("=" * 70)
    return 0


if __name__ == "__main__":
    sys.exit(main())
