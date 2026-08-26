import asyncio
import re
from server import app, db

async def main():
    # 1. Fetch all admin users
    admins = await db.users.find({"role": {"$in": ["admin", "super_admin"]}}).to_list(None)
    
    by_name = {}
    for u in admins:
        n = u.get("name")
        if n:
            # We want exact lower-case match
            by_name[str(n).strip().lower()] = u.get("email")
            
    cursor = db.sites.find({})
    updated = 0
    async for s in cursor:
        cname = (s.get("cluster_manager_name") or "").strip().lower()
        if cname and cname in by_name:
            correct_email = by_name[cname]
            current_email = s.get("approver_email")
            
            if current_email != correct_email:
                await db.sites.update_one(
                    {"_id": s["_id"]}, 
                    {"$set": {"approver_email": correct_email}}
                )
                updated += 1
                print(f"Updated site {s.get('site_code')} Approver Email to {correct_email}")
                
    print(f"Updated {updated} sites with correct Cluster Manager emails.")

if __name__ == "__main__":
    asyncio.run(main())
