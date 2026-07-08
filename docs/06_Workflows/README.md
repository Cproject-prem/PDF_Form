# 06 — Workflows

## Business flows

### Flow A · Standard-form submission
```
Submitter (anonymous or logged-in)
   │  POST /api/public/forms/{slug}/submit
   ▼
Backend
   ├─ validate required fields
   ├─ insert into db.submissions (RLS-tagged)
   ├─ move any file_id refs → uploads/local/submissions/{sid}/
   ├─ generate download_token (JWT, 24h, kind="form", sid)
   ├─ fire workflow trigger "form_submitted"
   │      └─ workflow engine walks nodes
   └─ return submission + download_token
   ▼
Submitter sees "Download filled PDF" button (public token URL)
   │  GET /api/public/submissions/{sid}/filled.pdf?token=...
   ▼
Backend
   ├─ verify_download_token(token, sid, "form")
   ├─ read submission + form
   └─ generate PDF via reportlab (tick icons via ZapfDingbats)
   ▼
Filled PDF returned (application/pdf attachment)
```

### Flow B · PDF-form submission
Identical to Flow A but hits `/api/public/pdf-forms/{slug}/submit` and later `/api/public/pdf-submissions/{sid}/completed?token=...`. The completed PDF is generated with PyMuPDF stamping onto the original template.

### Flow C · Approval magic link
```
Workflow node "assign_approver"
   ├─ insert into db.approvals with random approval_token
   └─ send_email with body containing /approve/{approval_token}

Approver clicks link
   ▼
Frontend /approve/{token} → POST /api/approvals/decision {token, decision}
   ▼
Backend
   ├─ verify token exists + not expired
   ├─ update submission.status = "approved" | "rejected"
   ├─ fire workflow trigger "approval_completed"
   └─ WebSocket broadcast → owning admin's Bell icon
```

### Flow D · Plant edit (with version snapshot)
```
Admin edits plant fields → PATCH /api/sites/by-code/{code} {fields}
   ▼
Backend
   ├─ read current row from db.sites
   ├─ INSERT snapshot into db.site_versions (row-before-change)
   ├─ apply patch to db.sites
   └─ increment version counter

Anyone viewing /plants/{code}
   ├─ GET /api/sites/by-code/{code}/history
   └─ renders reverse-chronological timeline with per-field diff pills
```

## Workflow node types

Defined in `frontend/src/lib/workflowNodes.js`:

### Triggers
- `form_submitted` — any submission on any form
- `pdf_submitted` — any PDF-form submission
- `field_changed` — a specific field value transitions
- `approval_completed`
- `scheduled` — cron-style (roadmap)

### Conditions
- `equals`, `contains`, `regex_match`
- `field_value_in_list`
- `submission_status_is`

### Actions
- `send_email` — templated, supports attachments (Excel row, filled PDF, custom CSV)
- `set_status` — mutate submission.status
- `assign_approver` — creates approval token + emails link
- `webhook_post` — outbound HTTP call (roadmap)

## Section 9 — Workflow Email Attachments

The email action node accepts:
- `attach_filled_pdf: true` → attaches the freshly-generated filled PDF
- `attach_excel_row: true` → attaches a one-row xlsx of this submission
- `attach_csv: true` → CSV of the submission values
- `custom_attachments: [{file_id, filename}]` → any file uploaded during authoring

Emails are sent via SMTP (config in `/smtp`). Failed sends are retried up to 3× with exponential backoff and logged to `db.workflow_executions`.

## Retry & error handling
- All workflow triggers fire in a background task (`asyncio.create_task`) so the API response is never blocked.
- Errors are captured to `db.workflow_executions` with stack trace.
- `/workflow-executions` UI shows a live list with filters.
