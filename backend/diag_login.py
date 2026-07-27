import asyncio
import bcrypt
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import os

load_dotenv('.env')

async def main():
    db = AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
    user = await db.users.find_one({'email': 'admin@example.com'})
    if not user:
        print('USER NOT FOUND in DB')
        return
    print("Found user: email=%s role=%s is_active=%s" % (user['email'], user['role'], user.get('is_active')))
    pw_hash = user.get('password_hash')
    print("Has password_hash: %s" % bool(pw_hash))
    if pw_hash:
        ok = bcrypt.checkpw(b'Admin@12345', pw_hash.encode())
        print("Password check for Admin@12345: %s" % ok)
    else:
        print("No password hash stored — resetting now...")
        new_hash = bcrypt.hashpw(b'Admin@12345', bcrypt.gensalt()).decode()
        res = await db.users.update_one({'email': 'admin@example.com'}, {'$set': {'password_hash': new_hash}})
        print("Updated: matched=%d modified=%d" % (res.matched_count, res.modified_count))

asyncio.run(main())
