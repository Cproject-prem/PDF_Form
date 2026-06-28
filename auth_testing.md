# Auth Testing — Solaris Forms

## API test
```bash
API=http://localhost:8001/api

# Login admin
curl -s -X POST $API/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@solarisview.com","password":"Admin@123"}'

# Login vendor
curl -s -X POST $API/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"vendor@solarisview.com","password":"Vendor@123"}'
```

## Mongo verify
```
mongosh
use solaris_forms
db.users.find({}, {email:1, role:1}).pretty()
db.sites.countDocuments()   # should be 10
db.forms.countDocuments()   # should be 1
```

## Auth UI selectors
- `data-testid="login-email"` / `data-testid="login-password"` / `data-testid="login-submit"`
- `data-testid="login-error"` for errors
