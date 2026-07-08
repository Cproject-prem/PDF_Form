# Security Hardening

FormForge holds confidential data (form submissions, personal info, PDF documents, RBAC scopes). This doc catalogues every hardening measure currently in place, plus how to configure them.

---

## 1. Authentication

- **Passwords** are hashed with **bcrypt** (cost 12) — plain-text passwords never touch the DB or the logs.
- **JWTs** are HS256-signed with a secret from `JWT_SECRET`. Auth tokens TTL = 7 days (configurable), download tokens TTL = 24 h.
- **Sessions** are stateless — invalidation is by changing `JWT_SECRET` (all tokens invalidated) or by disabling the user (`is_active=false`).

### Startup safety check
If `SECURITY_STRICT=true` (default), the backend **refuses to start** when:
- `JWT_SECRET` is missing, is `dev-secret`, or shorter than 32 chars
- `CORS_ORIGINS` is `*`
- `SEED_ADMIN_PASSWORD` is a well-known demo value

Generate a strong secret:
```bash
python -c "import secrets; print(secrets.token_hex(48))"
```

---

## 2. Brute-force protection

Every failed login is tracked per IP **and** per email. After **8 failures in 15 minutes** the endpoint returns HTTP **429** with a `Retry-After` header. A successful login **resets** that email's counter so legit users aren't punished for their own typos.

Tunable via env:
```
LOGIN_MAX_ATTEMPTS=8
LOGIN_WINDOW_SECONDS=900
```

## 3. Rate limits (other endpoints)

| Endpoint | Default limit |
|----------|---------------|
| `POST /api/public/forms/{slug}/submit` | 20/min per IP |
| `POST /api/upload` | 30/min per user |
| `POST /api/public/upload` | 30/min per IP |

Tunable via `SUBMIT_MAX_PER_MIN` and `UPLOAD_MAX_PER_MIN`.

**Note (multi-worker)**: today's limiter is in-memory per-process. For >1 uvicorn worker use nginx `limit_req` in front, or migrate to Redis (roadmap).

## 4. Password policy

Server-side enforced when a user supplies their own password on account creation. Requires:

- ≥ 10 characters (≤ 128)
- ≥ 3 of the 4 classes: lowercase, uppercase, digit, symbol
- Not one of a common-passwords deny-list

Auto-generated temp passwords already meet the policy.

## 5. File-upload validation

- **Size cap**: `MAX_UPLOAD_MB` (default 25 MB).
- **Extension allow-list**: png/jpg/gif/webp/pdf/txt/csv/xlsx/docx/doc/xls/zip.
- **Magic-byte check**: bytes on disk must match the claimed extension. A `.png` that's actually PHP or a script is rejected with HTTP 400.
- **Storage**: local disk under `uploads/local/`, organised per submission at submit time. No untrusted files leave the server.

## 6. HTTP response headers

Applied globally by `SecurityHeadersMiddleware`:

| Header | Value |
|--------|-------|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` (blocks clickjacking) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `geolocation=(), microphone=(), camera=()` |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Content-Security-Policy` | see below |
| `Strict-Transport-Security` | 1 year, `includeSubDomains` — only when `SECURITY_HTTPS=true` |

Default CSP (safe for the current SPA):
```
default-src 'self';
img-src 'self' data: blob:;
media-src 'self' blob:;
connect-src 'self' ws: wss:;
style-src 'self' 'unsafe-inline';
script-src 'self' 'unsafe-inline' 'unsafe-eval';
font-src 'self' data:;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
```

## 7. Row-Level Security (RLS)

Enforced in `backend/permissions.py::submission_filter`. Every list/read that touches `db.submissions` must pass through it — direct `db.submissions.find({})` is forbidden by convention and caught by review.

Filter logic:
- `super_admin` → no filter
- `admin` with `region` set → only records in that region
- `vendor_admin` → only records for their `vendor_id`
- `vendor_user` → only records they submitted

## 8. Audit logging

- Login successes AND failures are logged with structured payload (`email`, `ip`, `role`).
- User CRUD, role changes, workflow enable/disable, SMTP changes, backup runs → `db.audit_logs`.
- All timestamps in UTC ISO-8601.
- `redact_for_log()` scrubs `password`, `token`, `secret`, `authorization`, `cookie` from any dict before printing.

## 9. CORS

Set `CORS_ORIGINS="https://app.company.com,https://admin.company.com"` in prod. Wildcards are rejected by the strict startup check.

## 10. Download tokens

Public filled-PDF download uses a JWT with:
- `scope="download"`
- `kind="form"` or `"pdf"`
- `sid` = submission id
- 24 h TTL

`verify_download_token()` rejects if scope, kind, or sid don't match — so a token issued for submission A cannot fetch submission B.

## 11. Local-disk storage

- Files are outside the web root — served only via `/api/files/{file_id}` with DB-record auth checks.
- Directory traversal is prevented by using `Path` joins and stripping leading `/`.

## 12. Backup encryption (roadmap)

Today `backup.py` produces a plain zip. Roadmap adds `--encrypt PASSWORD` producing an AES-256 zip via `pyzipper`. Track: `docs/14_Future_Features`.

---

## Deployment checklist

Before flipping the app live:

- [ ] `JWT_SECRET` = 48+ random hex bytes
- [ ] `CORS_ORIGINS` = explicit list, no wildcards
- [ ] `SECURITY_STRICT` unset (defaults to `true` → hard fail on weak config)
- [ ] `SECURITY_HTTPS=true` (behind an HTTPS terminator)
- [ ] `SEED_ADMIN_PASSWORD` changed OR the demo admin deleted after first login
- [ ] All demo vendor users deleted or their passwords rotated
- [ ] SMTP creds set — otherwise workflow emails silently fail
- [ ] Backup cron enabled + first restore drill completed
- [ ] Reverse proxy (nginx/caddy) enforces HTTPS + terminates TLS
- [ ] Firewall exposes only 443 (nothing directly on 8001 or 27017)
- [ ] MongoDB bound to `127.0.0.1` (never `0.0.0.0`) unless you have auth + TLS on it
- [ ] Regular Mongo user account (not `root`) with least-privilege on the `formforge` DB

---

## Reporting a vulnerability

Email `security@yourdomain.example` (please redact this in the docs before publishing).
