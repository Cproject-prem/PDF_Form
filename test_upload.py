import asyncio
import os
import sys
import requests

sys.path.append(os.path.join(os.getcwd(), 'backend'))
from backend.server import db, make_token

async def main():
    user = await db.users.find_one({'role': 'super_admin'})
    if not user:
        print("No super_admin found")
        return
    token = make_token(user['user_id'], user['role'])
    r = requests.post(
        'http://localhost:8001/api/ai/documents',
        files={'file': ('test.txt', b'hello world')},
        headers={'Authorization': f'Bearer {token}'}
    )
    print('Status:', r.status_code)
    print('Response:', r.text)

if __name__ == '__main__':
    asyncio.run(main())
