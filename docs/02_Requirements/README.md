# 02 — Requirements

## Functional Requirements (FR)

### FR-1 · Standard Form Builder
- Drag-and-drop palette of 17 field types (text, number, email, date, dropdown, checkbox, radio, **tick**, signature, file, image, rating, heading, paragraph, divider, url, phone).
- Split-pane editor: left = palette, center = canvas, right = properties.
- Autosave every 500 ms of inactivity.
- Publish → unlisted public URL `/f/{slug}`.

### FR-2 · PDF-Template Builder
- Upload a PDF, overlay draggable/resizable fillable fields.
- 22 field types including `signature`, `initial`, `qr_code`, `barcode`, `calculation`, `tick`.
- Two public-view modes: **Form view** (mobile-friendly card fields) OR **PDF view** (original PDF with overlaid inputs).
- Publish → `/pdf/{slug}`.

### FR-3 · Data sources & lookups
- Any dropdown can be backed by a Master-Data collection (`sites`, `vendors`, custom).
- Field-to-field lookups: e.g. picking Site auto-fills Approver, Region.

### FR-4 · Formula engine
- Excel-like syntax (`=SUM(a1, a2)`, `=IF(x>10, "OK", "FAIL")`).
- Live-evaluated during form fill; result rendered into `calculation` fields.

### FR-5 · Submissions
- Filled-PDF download (both public via short-lived token, and authenticated).
- Excel export of all submissions per form.
- Per-submission folder on disk `uploads/local/submissions/{sid}/`.
- 24 h JWT-signed download link for anonymous submitters.

### FR-6 · Workflow Engine
- Trigger nodes: `form_submitted`, `pdf_submitted`, `field_changed`.
- Action nodes: `send_email` (with attachments), `set_status`, `assign_approver`.
- Approval nodes with signed magic-link tokens.

### FR-7 · Real-time Notifications
- WebSocket channel `/ws/notifications`.
- Bell icon in top bar with unread badge.
- Trigger events: submission, approval, comment.

### FR-8 · Master Data (Plants, Vendors, Regions)
- CSV import for sites (`site_code`, `site_name`, `region`, `approver_email`, etc.).
- Editable Plant View at `/plants/{code}` with version history.
- Regions API for cascading dropdowns.

### FR-9 · RBAC + Row-Level Security
- Four roles: `super_admin`, `admin`, `vendor_admin`, `vendor_user`.
- `region` on admin users → auto-scopes submissions.
- `vendor_id` on vendor users → hides other vendors' data.

### FR-10 · Backup & Restore
- CLI script `backup.py` → single zip (DB + files).
- CLI script `restore.py` with dry-run + `--wipe` modes.

## Non-Functional Requirements (NFR)

| Ref | Requirement |
|-----|-------------|
| NFR-1 | P95 API latency < 400 ms for CRUD, < 2 s for PDF generation |
| NFR-2 | Support 500 concurrent submissions/hour on a 2-vCPU box |
| NFR-3 | File uploads up to `MAX_UPLOAD_MB=25` (configurable) |
| NFR-4 | HTTPS-only when deployed (via nginx/caddy in front) |
| NFR-5 | Passwords stored as bcrypt hashes (never plaintext) |
| NFR-6 | JWT TTL 7 days (auth), 24 h (download tokens) |
| NFR-7 | Zero-downtime hot-reload for form/settings changes |
| NFR-8 | Full offline / air-gapped install possible (no external SaaS deps for core features) |
| NFR-9 | Time-zone: UTC in DB; client renders in local TZ |
| NFR-10 | All state changes on `sites`, `forms` → snapshot into `*_versions` for audit |
| NFR-11 | **AI Isolation**: Failure of any AI component (Ollama down, AI service crashed, model load error, RAG vector DB offline, embedding failure, AI timeout) **MUST NOT** prevent or crash core FormForge functionality. |
| NFR-12 | **AI Optionality**: AI must be a 100% optional auxiliary service. System must start and operate normally when `AI_ENABLED=false` or when AI microservice is stopped. |
| NFR-13 | **AI Timeout Isolation**: AI timeouts (`AI_REQUEST_TIMEOUT=30`, `AI_CONNECT_TIMEOUT=5`) must return controlled responses and never block core FastAPI request threads indefinitely. |
| NFR-14 | **AI Resource Bounding**: AI service resource consumption (RAM/CPU) must be bounded (`deploy.resources.limits`) so that AI load cannot starve core FormForge application services. |

