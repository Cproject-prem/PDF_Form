import asyncio
import os
import sys

sys.path.append(os.path.join(os.getcwd(), 'backend'))
from backend.server import db
from backend.vendor_routes import _manpower_coll

async def main():
    coll = _manpower_coll(db)
    doc = await coll.find_one()
    if doc:
        print(type(doc.get('medical_expiry_date')), doc.get('medical_expiry_date'))
    else:
        print("No document found")

asyncio.run(main())
