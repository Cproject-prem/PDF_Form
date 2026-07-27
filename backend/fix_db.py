
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio
import uuid

async def run():
    client = AsyncIOMotorClient('mongodb://localhost:27017')
    db = client.formforge
    
    # 1. Update existing ACM2026 to 'Sun Ops'
    await db.vendors.update_one({'vendor_id': 'ACM2026'}, {'$set': {'name': 'Sun Ops'}})
    
    # 2. Check if Razone vendor exists already
    raz_vendor = await db.vendors.find_one({'name': 'Razone'})
    if not raz_vendor:
        new_vid = 'ven_05c8dbc7cf81'  # I saw this in the previous DB print!
        # wait, I already saw it existed: ven_05c8dbc7cf81 Razone razone@example.com
        raz_vendor = await db.vendors.find_one({'vendor_id': new_vid})
    
    # 3. Update Charlie Hybrid 25MW to point to Razone
    await db.sites.update_one({'site_name': 'Charlie Hybrid 25MW'}, {'$set': {'vendor_id': raz_vendor['vendor_id']}})
    
    print('Data corrected!')
    
asyncio.run(run())

