# 05 — Page Details

Per-page specification. Each entry lists: purpose · key components · API calls · behaviour.

---

## `/login` — Sign in
- **Purpose**: Email + password authentication (JWT, 7-day TTL).
- **Components**: shadcn Card, Input, Button. Sonner toast on error.
- **API**: `POST /api/auth/login {email, password}` → `{token, user}`.
- **Behaviour**: Persist token in localStorage → redirect to `/`.

---

## `/` — Dashboard
- **Purpose**: One-glance operational snapshot.
- **Widgets**:
  - Stat cards: total forms · total submissions · today's submissions · pending approvals.
  - Recent activity feed (last 10 submissions).
  - Storage utilization (files count + MB).
- **API**: `GET /api/dashboard/stats`.

---

## `/forms` — Forms list
- **Purpose**: Browse and manage standard forms.
- **Components**: Table, filter bar (owner, status), "New Form" CTA.
- **API**: `GET /api/forms` (RLS-scoped).
- **Actions**: Duplicate, archive, share URL.

---

## `/forms/{id}` — Split-pane Builder
- **Purpose**: Design forms.
- **Layout**: 3 columns — palette (240 px) · canvas (flex) · properties (320 px).
- **Behaviour**:
  - Drag from palette → drops onto canvas.
  - Autosave via `PATCH /api/forms/{id}` on 500 ms debounce.
  - Field-level properties updated live.
- **API**: `GET /api/forms/{id}`, `PATCH /api/forms/{id}`.

---

## `/pdf-forms/{id}` — PDF Overlay Builder
- **Purpose**: Add fillable widgets on top of an uploaded PDF.
- **Components**: `PdfCanvas` (react-pdf) + `react-rnd` for drag/resize.
- **Special**: "Public view mode" toggle → `settings.public_view_mode = "form" | "pdf"`.

---

## `/f/{slug}` — Public standard form
- **Purpose**: Anonymous form fill.
- **Behaviour**: Renders using shared `FieldRenderer`. On submit, shows success screen with "Download filled PDF" button (24 h JWT).

---

## `/pdf/{slug}` — Public PDF form
- **Purpose**: Anonymous PDF fill.
- **Two modes**:
  - **Form view**: identical to standard form UX.
  - **PDF view**: `PdfOverlayFill` renders original PDF pages with absolutely-positioned inputs.

---

## `/submissions` — Consolidated hub
- **Purpose**: Merged list of standard-form + PDF-form submissions.
- **Filters**: form, vendor, site, region, date range.
- **Bulk actions**: Export to Excel (`GET /api/submissions/export`).
- **RLS**: applied via `submission_filter(user)`.

---

## `/submissions/{id}`  — Submission detail
- **Purpose**: Full record of a submitted form + attachments + audit history.
- **Sections**:
  - Header (form title, submitter, timestamp, IP)
  - Values table (label / value pairs)
  - Attachments (from `uploads/local/submissions/{sid}/`)
  - Workflow execution log
  - Download buttons: filled PDF, Excel row

---

## `/approvals` — Enriched approval cards
- **Purpose**: Approve/reject pending submissions.
- **Card content**: form badge, site badge, vendor badge, region chip, submitter avatar, time-ago.
- **API**: `GET /api/approvals`, `POST /api/approvals/{id}/decision`.

---

## `/plants` — Plant list
- **Columns**: site_code, site_name, region, approver_email.
- **RLS**: admins see only their region.

---

## `/plants/{code}` — Plant detail (editable)
- **Sections**:
  - Header: site_code, region, edit button
  - Dynamic fields (whatever columns exist in `site_columns`)
  - Recent submissions on this plant
  - **Edit History timeline** — collapsible, red-strikethrough → green diff pills
- **API**: `GET /api/sites/by-code/{code}`, `PATCH /api/sites/by-code/{code}`, `GET /api/sites/by-code/{code}/history`.

---

## `/users` — User management
- Create / edit / disable users.
- Assign role, region (for admins), vendor_id (for vendor users).
- "Send welcome email" toggle + configurable template.

---

## `/workflows/{id}` — Workflow canvas
- React-flow style DAG.
- Nodes: triggers, conditions, actions.
- Version history in `workflow_versions`.

---

## `/welcome-email` — Configurable welcome template
- Rich-text editor (variables: `{{name}}`, `{{email}}`, `{{temp_password}}`).
- Preview pane.
- Applies to new user creation from `/users`.
