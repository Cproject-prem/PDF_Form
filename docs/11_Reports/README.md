# 11 — Reports

## In-app reports

### 11.1 · Submission Excel export
- **Where**: `/submissions` → "Export to Excel" button
- **API**: `GET /api/submissions/export?form_id=<id>&from=<iso>&to=<iso>`
- **Output**: `.xlsx` with one row per submission
  - Columns: `submission_id`, `submitted_at`, `submitter_email`, `status`, then one column per form field
- **Library**: `openpyxl`

### 11.2 · Dashboard stats
- **Endpoint**: `GET /api/dashboard/stats`
- **Content**:
  ```json
  {
    "total_forms": 12,
    "total_submissions": 483,
    "today_submissions": 17,
    "pending_approvals": 4,
    "users_count": 22,
    "storage": { "files": 128, "mb": 45.2 }
  }
  ```
- **RLS-scoped** — each role sees a filtered view.

### 11.3 · Workflow executions
- **Page**: `/workflow-executions`
- **Filters**: workflow, status (`success | failed | in_progress`), date range
- **Utility**: debugging why an email didn't go out, why an approval didn't create

### 11.4 · Audit log
- **Page**: `/audit` (super_admin)
- **Sources**: `db.audit_logs`
- **Events tracked**: user CRUD, role changes, form publish/unpublish, workflow enable/disable, SMTP config change, backup runs
- **Export**: CSV via `?export=csv`

### 11.5 · Plant edit history
- **Page**: `/plants/{code}`
- **API**: `GET /api/sites/by-code/{code}/history`
- **Format**: per-version diff (field-by-field: from → to, with editor name/email + timestamp)

## Roadmap reports (see `14_Future_Features`)

- Vendor scorecard (submission volume, approval-rate, SLA breaches per vendor)
- Region heatmap (submission density per site)
- Compliance summary (% forms with a signature, % approved on-time)
- Delta reports (week-over-week / month-over-month)

## Report file locations

All exported files are streamed as HTTP responses with `Content-Disposition: attachment` — no server-side files are stored for reports (avoids stale data).
