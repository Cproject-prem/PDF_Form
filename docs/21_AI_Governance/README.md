# 21. AI Governance, Safety & Privacy Policy

This document outlines the corporate AI governance framework, privacy controls, data classification, and audit standards enforced in FormForge.

---

## 1. Local AI Privacy Policy

- All AI inference occurs strictly on-premise inside the local `ollama` container using open-weights models (e.g. Gemma).
- **Zero company data** or document contents leave the corporate perimeter.

---

## 2. Global AI Kill Switch

Administrators can disable all AI features system-wide at any time:

```env
AI_ENABLED=false
```

When set to `false`:
- Frontend displays "AI Features Disabled by Administrator".
- Backend returns immediate controlled fallback responses.
- No network connections are initiated to `formforge-ai` or `ollama`.
- **Core FormForge functionality operates with zero disruption.**

---

## 3. Data Redaction & AI Audit Logging

All AI interactions generate non-sensitive audit logs stored in `db.audit_logs`:

Recorded fields:
- `event`: `"ai_request"`
- `action`: `"ai_chat"` | `"ai_summarize"` | `"ai_analyze"`
- `performed_by`: User email
- `request_id`: UUID4 string
- `provider`: `"ollama"`

- `model`: Model name and version
- `rag_used`: Boolean
- `retrieved_doc_ids`: List of document IDs
- `status`: `"success"` | `"failed"`
- `latency_ms`: Execution duration

**STRICTLY REDACTED / NEVER LOGGED**:
- User passwords, JWT secrets, auth tokens, API keys, raw prompt payload text containing PII/PHI.

---

## 4. Human Validation & Hallucination Mitigation

AI responses in FormForge are advisory only.
- Form approvals, submission validations, and PDF generation are strictly governed by human operators and explicit workflow rules.
- AI cannot automatically approve submissions or modify database records without explicit user interaction.
