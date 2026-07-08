# 15 — Change Log

Chronological history of shipped work. Newer entries at the top.

---

## v0.7 — Local-First & Backup (2026-07-08)
- **Local disk storage**: replaced Emergent Object Storage with local disk under `backend/uploads/local/`. Files are organised per submission (`local/submissions/{sid}/{original_filename}`) automatically at submit time.
- **Legacy path fallback** in `get_object()` — old records with `formforge/uploads/...` paths still resolve by basename search.
- **`backup.py` & `restore.py`**: single-zip export (all Mongo collections + all uploaded files); restore with dry-run + `--wipe` modes; Windows Task Scheduler-ready.
- **Docker Compose** for one-command local stack.
- **Complete README** with Windows PowerShell + Linux/macOS setup paths and troubleshooting table.
- **Bug fix**: removed `emergentintegrations` from `requirements.txt` — it wasn't publicly installable and broke local `pip install`.

## v0.6 — Public PDF Download + PDF View + Tick Field (2026-07-07)
- **Anonymous filled-PDF download** — public submit now returns a `download_token` (24 h JWT), and new endpoints `GET /api/public/submissions/{sid}/filled.pdf?token=...` and `GET /api/public/pdf-submissions/{sid}/completed?token=...` serve the PDF without auth.
- **PDF public view mode toggle** in PDF Builder's Share dialog — publishers choose between clean **Form view** or original **PDF view** (with overlaid input widgets on top of the source PDF).
- **New `tick` field type** — single yes/no checkbox with a customisable label. Renders as a visible green ZapfDingbats ✓ in the filled PDF.
- **Plant Edit History timeline** — `/plants/{code}` now has a collapsible timeline showing per-field diffs (red-strikethrough → green pill) with editor name/email + timestamp per snapshot.
- **New endpoint** `GET /api/sites/by-code/{site_code}/history` (RLS-aware).

## v0.5 — Region-RLS, Plant View, Realtime (2026-07-04)
- **Plants (Site Master detail)** page at `/plants/{code}` — dynamic editable fields, submission history, `PATCH` snapshots into `site_versions`.
- **Region-based admin RLS** — admins with a `region` value auto-filter to submissions in that region.
- **Enhanced User Management** — create + edit dialog with region dropdown, welcome email, auto-generated temp password.
- **Real-time WebSocket notifications** — bell icon in top bar, `/ws/notifications` channel.
- **New `GET /api/regions`** — cascading dropdown source.

## v0.4 — Workflow Emails, Excel Export, Split-Pane Builder (2026-06-25)
- **Section 9 — Workflow email attachments**: `send_email` action node can attach Excel, PDF, CSV of the current submission.
- **Excel generation** — `GET /api/submissions/export?form_id=...` produces `.xlsx` via openpyxl.
- **Split-pane builder redesign** — palette (left) + canvas + properties (right), Jotform-style.
- **Consolidated Submissions hub** — one page merges standard-form + PDF-form submissions.
- **Admin menu segregation** — role-aware navigation groups.

## v0.3 — Enriched Approvals & Welcome Email UI (2026-06-15)
- Approval cards with form/site/vendor/region badges.
- Configurable welcome-email template with variables (`{{name}}`, `{{temp_password}}`).
- Approval auto-CC list per site.

## v0.2 — Formula Engine, Data Sources, Lookups (2026-05-30)
- Excel-like formula engine — `SUM`, `IF`, `AVG`, `MIN`, `MAX`, cell-refs, string ops.
- Dynamic dropdown data sources — reference master-data collections.
- Field-to-field lookups — Site → Approver, Site → Region.

## v0.1 — Foundation MVP (2026-05-10)
- Standard form builder (17 field types) with drag-drop, autosave, publish.
- PDF template builder (upload PDF + overlay fields).
- Public submissions (both flows).
- 4-tier RBAC: super_admin, admin, vendor_admin, vendor_user.
- Basic workflow engine with `form_submitted` trigger + `send_email` action.
- JWT auth, bcrypt passwords.
- MongoDB + FastAPI + React scaffolding.

---

## Change-log conventions
- Format: `## vX.Y — Title (YYYY-MM-DD)`
- Group changes as: new features, bug fixes, breaking changes (if any).
- Reference commit SHAs when git history is available.
- Never rewrite past entries — corrections go under a new dated entry.
