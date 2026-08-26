# 23. Security Test Plan & Verification Suite

This document defines the security test cases, automated test suites, Security Center scanner drills, and manual verification steps required for enterprise compliance and release verification.

---

## 1. Portal Security Center Automated Scan Engine

The **Security Center** (`/security`) provides continuous automated control auditing across 38 security categories via `POST /api/security/scan`.

### Core Automated Test Matrix

| Test ID | Security Control Area | Target Endpoint / Component | Test Procedure | Expected Result | Test Script |
|---------|-----------------------|-----------------------------|----------------|-----------------|-------------|
| **SEC-01** | Authentication | `POST /api/auth/login` | Attempt login with wrong password 10x | Returns HTTP 429 lockout | `tests/test_security.py` |
| **SEC-02** | JWT Token Security | `GET /api/forms` | Pass expired / tampered JWT token | Returns HTTP 401 Unauthorized | `tests/test_auth.py` |
| **SEC-03** | Row-Level Security (RLS) | `GET /api/submissions` | Authenticate as `vendor_admin`, request all submissions | Returns ONLY records for assigned `vendor_id` | `tests/test_rbac.py` |
| **SEC-04** | File Upload Validation | `POST /api/upload` | Upload `.png` file containing executable PHP code | Returns HTTP 400 (Magic-byte validation failure) | `tests/test_upload.py` |
| **SEC-05** | Download Token Isolation| `GET /api/files/{id}` | Access submission A file using download token issued for submission B | Returns HTTP 403 Forbidden | `tests/test_security.py` |
| **SEC-06** | CORS Enforcement | All `/api/*` routes | Send `Origin: https://malicious.com` header | Access-Control-Allow-Origin header omitted/rejected | `tests/test_security.py` |
| **SEC-07** | Rate Limiting | `POST /api/public/forms/{slug}/submit` | Send 25 rapid submissions in 1 minute from single IP | HTTP 429 rate limit error after 20th request | `tests/test_security.py` |
| **SEC-08** | AI API Isolation | `http://localhost:9000/ai/chat` | Attempt direct connection to AI microservice port from external network | Connection refused (port not published) | Network scan test |
| **SEC-09** | AI Circuit Breaker | `POST /api/ai/chat` | Stop `formforge-ai` container, send AI request | Returns HTTP 200 with clean fallback message without core crash | `ai-service/tests/test_ai_service.py` |
| **SEC-10** | RAG Document Scoping | `POST /api/ai/chat` | Ask AI about document restricted to `super_admin` while logged in as `user` | AI responds with knowledge unavailable | `ai-service/tests/test_ai_service.py` |
| **SEC-11** | Security Center Access | `GET /api/security/status` | Attempt access as `admin` or `vendor_admin` | Returns HTTP 403 Forbidden (Super Admin only) | `tests/test_rbac.py` |
| **SEC-12** | Core Availability | All Core APIs | Disconnect Ollama/AI container | Core login, forms, pdf, submissions, workflows remain 100% operational | `tests/test_resilience.py` |

---

## 2. Security Center Execution & Verification

### Executing Security Center Audits via API
```bash
# Trigger Full Security Center Scan (Super Admin token required)
curl -X POST "http://localhost:8001/api/security/scan" \
     -H "Authorization: Bearer <SUPER_ADMIN_JWT>" \
     -H "Content-Type: application/json" \
     -d '{"mode": "full"}'

# Fetch Findings Summary
curl "http://localhost:8001/api/security/status" \
     -H "Authorization: Bearer <SUPER_ADMIN_JWT>"

# Download Audit Markdown Report
curl "http://localhost:8001/api/security/report?format=markdown" \
     -H "Authorization: Bearer <SUPER_ADMIN_JWT>" \
     -o formforge-security-report.md
```

### Executing Pytest Verification Suites
```bash
# Execute core security unit test suite
pytest tests/test_security.py tests/test_rbac.py tests/test_auth.py -v

# Execute AI service fault-tolerance test suite
pytest ai-service/tests/test_ai_service.py -v
```
