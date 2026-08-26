import asyncio
import re
from server import app, db

async def main():
    vendors_rows = await db.vendors.find({}).to_list(None)
    by_name = {}
    for v in vendors_rows:
        for n in (v.get("name"), v.get("vendor_name")):
            if n:
                by_name[str(n).strip().lower()] = v["vendor_id"]
                
    cursor = db.sites.find({})
    updated = 0
    async for s in cursor:
        n = (s.get("vendor_name") or "").strip().lower()
        if n and n in by_name:
            vid = by_name[n]
            if s.get("vendor_id") != vid:
                await db.sites.update_one({"_id": s["_id"]}, {"$set": {"vendor_id": vid}})
                updated += 1
                print(f"Linked site {s.get('site_code')} to vendor {vid}")
    print(f"Updated {updated} sites.")

if __name__ == "__main__":
    asyncio.run(main())
