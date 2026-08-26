# FormForge — Portal Security Architecture & Security Center

FormForge implements an enterprise-grade **Portal Security Center** and security control framework covering all 38 platform categories across frontend, backend, API, authentication, RBAC, row-level security, AI service isolation, backups, and network infrastructure.

---

## 1. Portal Security Center Overview

The **Security & Compliance Center** (`/security`) provides Super-Admin-restricted auditing, live vulnerability monitoring, automated security scanning, control verification, and compliance reporting.

### Key API Endpoints
All endpoints are strictly protected by `require_role("super_admin")`:

- `POST /api/security/scan`: Triggers an on-demand security scan (`mode`: `"quick"` | `"full"` | `"component"`).
- `GET /api/security/status`: Returns overall Security Score (0-100%), status badge (`Secure`, `Attention Required`, `Critical Risk`), issue counts by severity, and category breakdown.
- `GET /api/security/findings`: Returns filtered control findings by category, severity (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, `INFO`), or status (`PASS`, `FAIL`, `PARTIAL`, `MANUAL REVIEW REQUIRED`).
- `GET /api/security/report`: Downloads complete security audit report (`format`: `"json"` | `"markdown"`).
- `GET /api/security/settings`: Displays safe operational status flags for core platform security mechanisms without exposing secrets.

---

## 2. 38 Security Dashboard Categories

1. **Authentication**: Bcrypt hashing (cost 12), min 10 chars, 3/4 character classes, common password deny-list, sliding-window brute-force lockout (8 attempts / 15 mins).
2. **Session Management**: JWT token expiration (`exp`), instant invalidation for disabled users (`is_active=false`).
3. **Authorization**: Server-side `require_role()` guards on all sensitive endpoints.
4. **RBAC**: Centralized role capability matrix in `permissions.py` (Super Admin, Admin, Vendor Admin, Vendor User, User).
5. **Row-Level Security (RLS)**: Mandatory `site_filter` and `submission_filter` restricting queries by region, cluster manager, or `vendor_id`.
6. **API Security**: Route validation, HTTP method enforcement, rate limiting, and IDOR prevention.
7. **Form Security**: Form builder definition validation, field type checking, and formula safety controls.
8. **PDF Security**: PDF parser validation, stamping isolation, and submission-bound short-lived download tokens.
9. **Submission Security**: Submission ownership scoping, IDOR protection, and export authorization.
10. **Approval Security**: Token signature validation, 24h expiration, single-use approval magic links, and replay protection.
11. **Workflow Security**: Trigger event scoping, isolated node execution, and configuration change auditing.
12. **File Security**: Magic byte binary signature validation (`_MAGIC_BYTES`), extension allow-list, size caps (25 MB), and path traversal prevention.
13. **Public Endpoint Security**: Sliding-window rate limiters on public submission (`/f/{slug}`, `/p/{slug}`) and rate-limited uploads.
14. **WebSocket Security**: Authenticated connection lifecycle, scoped event channels (`/ws/notifications`), and disconnect cleanup.
15. **Database Security**: MongoDB indexed collections (`created_at` on audit logs), least-privilege DB user, localhost binding.
16. **Data Protection**: PII handling, structured data masking, and retention rules.
17. **Encryption**: TLS 1.3 in transit, HSTS headers when `SECURITY_HTTPS=true`, sensitive field protection.
18. **Configuration Security**: `SECURITY_STRICT=true` startup safety assertions blocking weak secrets or permissive CORS.
19. **Secrets Security**: No secrets in frontend JS bundles, redacted keys (`password`, `token`, `secret`, `cookie`) in audit logs.
20. **CORS**: Explicit origin restrictions in `CORS_ORIGINS` (rejecting `*` in strict mode).
21. **HTTP Security Headers**: `SecurityHeadersMiddleware` injecting `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, and `Content-Security-Policy`.
22. **HTTPS/TLS**: TLS enforcement, HSTS max-age 1 year, secure cookie flags.
23. **Network Security**: Database, AI microservice, and Ollama listening exclusively on internal localhost/docker network.
24. **Firewall / Reverse Proxy**: NGINX ingress TLS termination, client IP (`X-Forwarded-For`) validation, request size limits.
25. **Dependency Security**: Dependency audit checks for Python requirements and Node package dependencies.
26. **Logging & Auditing**: Immutable audit trail in `db.audit_logs` tracking user, action, timestamp, object, and result with sensitive data redaction.
27. **Backup Security**: Snapshot directory permissions, archive integrity checks, and backup manifest tracking.
28. **Disaster Recovery**: Documented RPO/RTO targets, restore verification scripts, and isolated snapshot extraction.
29. **AI Service Isolation**: `formforge-ai` and Ollama executing in separate unprivileged processes with circuit-breaker timeouts (`AI_REQUEST_TIMEOUT=30`).
30. **RAG Security**: Permission-aware vector retrieval ensuring semantic relevance never overrides user permission scopes.
31. **Vector Database Security**: Qdrant/FAISS indexing with metadata filter enforcement (`vendor_id`, role scope).
32. **AI Prompt Injection**: Untrusted document framing treating all RAG content as passive data; system instruction protection.
33. **Resource Protection**: Max payload size limits, request timeout caps, and sliding-window rate limiters.
34. **Monitoring & Alerts**: `/health` probe checking API, MongoDB, and AI service health.
35. **Browser / Client Security**: Safe React DOM rendering preventing XSS, no raw secrets in `localStorage`, CSP frame ancestors `none`.
36. **Privacy & Data Retention**: Automated cleanup guidelines for expired download tokens and temporary files.
37. **Security Testing**: Automated security scan engine (`security_center.py`) and Playwright E2E security test suite.
38. **Deployment Security**: Non-root container execution, environment integrity assertions, and production deployment checklists.

---

## 3. Core Availability Requirement

**Requirement 51**: Failure of optional services, including AI, RAG, embedding, vector database, or external integrations, **MUST NOT** cause failure of core FormForge functionality.

Core functionality includes:
- Authentication & Login
- Forms & Form Builder
- PDF Forms & Generation
- Submissions & Submissions Hub
- Approvals & Workflow Execution
- Reports & Analytics
- Users & Vendor Management
- Master Data & Site Master
- File Uploads & Downloads
- Audit Logging

---

## 4. Security Score & Status Formula

- **90–100%**: `Secure` (Green)
- **75–89%**: `Attention Required` (Amber)
- **50–74%**: `High Risk` (Orange)
- **0–49%**: `Critical Risk` (Red)

Any unresolved **CRITICAL** failure forces the status badge to `Critical Risk` regardless of total score percentage.

---

## 5. Reporting & Remediation

Security findings report evidence, affected components, remediation steps, and documentation references. Reports can be exported directly from the Security Center as structured JSON or Markdown reports.
