import asyncio
import os
import sys
sys.path.append(os.path.join(os.getcwd(), 'backend'))
from backend.server import db
async def main():
    print(await db.sites.index_information())
asyncio.run(main())
