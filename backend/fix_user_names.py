import asyncio
import os
from pathlib import Path
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']

async def run_backfill():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    print(f"Connected to DB: {DB_NAME}")

    # Build user lookup map: user_id -> {name, email}
    users = {}
    async for u in db.users.find({}, {"_id": 0, "user_id": 1, "name": 1, "email": 1}):
        uid = u.get("user_id")
        if uid:
            users[uid] = {
                "name": u.get("name") or u.get("email") or "Unknown User",
                "email": u.get("email") or ""
            }
    print(f"Loaded {len(users)} users from db.users")

    # 1. Backfill db.audit_logs
    updated_audit = 0
    async for log in db.audit_logs.find({}):
        aid = log.get("audit_id")
        actor_id = log.get("actor_id")
        u = users.get(actor_id)
        
        upd = {}
        if u:
            if not log.get("actor_name") or log.get("actor_name") == actor_id or str(log.get("actor_name")).startswith("usr_"):
                upd["actor_name"] = u["name"]
            if not log.get("actor_email"):
                upd["actor_email"] = u["email"]
        elif not log.get("actor_name") or str(log.get("actor_name")).startswith("usr_"):
            upd["actor_name"] = log.get("actor_email") or "System"

        if upd:
            await db.audit_logs.update_one({"audit_id": aid}, {"$set": upd})
            updated_audit += 1

    print(f"Updated {updated_audit} audit log entries.")

    # 2. Backfill db.pdf_submissions
    updated_pdf_subs = 0
    async for sub in db.pdf_submissions.find({}):
        sid = sub.get("submission_id")
        sub_by = sub.get("submitted_by")
        u = users.get(sub_by)
        if u:
            upd = {}
            if not sub.get("submitted_by_name") or sub.get("submitted_by_name") == sub_by or str(sub.get("submitted_by_name")).startswith("usr_"):
                upd["submitted_by_name"] = u["name"]
            if not sub.get("submitted_by_email"):
                upd["submitted_by_email"] = u["email"]
            if upd:
                await db.pdf_submissions.update_one({"submission_id": sid}, {"$set": upd})
                updated_pdf_subs += 1

    print(f"Updated {updated_pdf_subs} PDF submission entries.")

    # 3. Backfill db.submissions (standard forms)
    updated_subs = 0
    async for sub in db.submissions.find({}):
        sid = sub.get("submission_id")
        sub_by = sub.get("submitted_by") or sub.get("user_id")
        u = users.get(sub_by)
        if u:
            upd = {}
            if not sub.get("submitted_by_name") or sub.get("submitted_by_name") == sub_by or str(sub.get("submitted_by_name")).startswith("usr_"):
                upd["submitted_by_name"] = u["name"]
            if not sub.get("submitted_by_email"):
                upd["submitted_by_email"] = u["email"]
            if upd:
                await db.submissions.update_one({"submission_id": sid}, {"$set": upd})
                updated_subs += 1

    print(f"Updated {updated_subs} standard form submission entries.")

    # 4. Backfill db.site_versions
    updated_site_ver = 0
    async for ver in db.site_versions.find({}):
        snid = ver.get("snapshot_id")
        saved_by = ver.get("saved_by")
        u = users.get(saved_by)
        if u:
            upd = {}
            if not ver.get("saved_by_name") or ver.get("saved_by_name") == saved_by or str(ver.get("saved_by_name")).startswith("usr_"):
                upd["saved_by_name"] = u["name"]
            if not ver.get("saved_by_email"):
                upd["saved_by_email"] = u["email"]
            if upd:
                await db.site_versions.update_one({"snapshot_id": snid}, {"$set": upd})
                updated_site_ver += 1

    print(f"Updated {updated_site_ver} site version snapshot entries.")
    print("Backfill complete!")

if __name__ == "__main__":
    asyncio.run(run_backfill())
