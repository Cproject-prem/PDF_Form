import os
from pathlib import Path
from pymongo import MongoClient

ROOT = Path("uploads")
LOC  = ROOT / "local"
(LOC / "tmp").mkdir(parents=True, exist_ok=True)
(LOC / "submissions").mkdir(parents=True, exist_ok=True)

db  = MongoClient("mongodb://localhost:27017")["formforge"]
idx = {p.name: p for p in ROOT.rglob("*") if p.is_file()}
print("files on disk:", len(idx))

fixed = missing = ok = 0
ops = []

for r in db.files.find({}):
    sp   = r.get("storage_path") or ""
    full = LOC / sp
    if sp and full.exists():
        ok += 1
        continue

    orig = r.get("original_filename") or ""
    sid  = r.get("submission_id")
    fid  = r.get("file_id") or ""

    hit = None
    tries = [os.path.basename(sp), orig]
    for e in ["png", "jpg", "jpeg", "pdf", "txt", "csv", "docx", "xlsx"]:
        tries.append(f"{fid}.{e}")
    for name in tries:
        if name and name in idx:
            hit = idx[name]
            break

    if not hit:
        missing += 1
        print("MISSING", fid, sp)
        continue

    if sid:
        dest = LOC / "submissions" / sid / (orig or hit.name)
    else:
        dest = LOC / "tmp" / hit.name
    dest.parent.mkdir(parents=True, exist_ok=True)

    if hit.resolve() != dest.resolve():
        try:
            hit.rename(dest)
        except OSError:
            dest.write_bytes(hit.read_bytes())
            hit.unlink(missing_ok=True)

    new_rel = str(dest.relative_to(LOC))
    ops.append((r["_id"], new_rel))
    print("FIXED", fid, "->", new_rel)
    fixed += 1

for _id, rel in ops:
    db.files.update_one({"_id": _id}, {"$set": {"storage_path": rel}})

print("===", ok, "ok |", fixed, "fixed |", missing, "missing ===")
