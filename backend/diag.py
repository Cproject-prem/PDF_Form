from pymongo import MongoClient
from pathlib import Path

db = MongoClient("mongodb://localhost:27017")["formforge"]

print("=== MongoDB collections ===")
for name in ["files", "pdf_templates", "pdf_submissions", "submissions", "forms", "users"]:
    print(f"  {name:25s}  {db[name].count_documents({}):5d} docs")

print("\n=== Files on disk ===")
for sub in ["uploads/pdf", "uploads/completed", "uploads/local/tmp", "uploads/local/submissions"]:
    p = Path(sub)
    if p.exists():
        n = sum(1 for f in p.rglob("*") if f.is_file())
        print(f"  {sub:30s}  {n} files")
    else:
        print(f"  {sub:30s}  (folder does not exist)")

print("\n=== First 3 PDF templates ===")
for tpl in db.pdf_templates.find({"is_deleted": {"$ne": True}}).limit(3):
    sf = tpl.get("storage_filename", "(none)")
    exists = Path("uploads/pdf") / sf
    print(f"  '{tpl.get('title')}' -> {sf}  {'OK' if exists.exists() else 'MISSING ON DISK'}")

print("\n=== First 3 submissions (with file refs) ===")
for s in db.submissions.find({}).limit(3):
    vals = s.get("values") or {}
    file_refs = {k: v for k, v in vals.items() if isinstance(v, dict) and v.get("file_id")}
    print(f"  sub {s.get('submission_id')}  file_refs: {list(file_refs.keys())}")
