# FormForge — Product Requirements & Architecture

## Source problem statements
1. Add Site Management dropdown + dynamic data sources + lookup + formula engine across every selectable field. *(iter 1 — done & verified)*
2. Add the 4-role RBAC permission model (Super Admin / Admin / Vendor Admin / Vendor User), row-level security on sites/forms/PDF-forms/submissions, PDF Form Builder feature parity with normal Form Builder, workflow context enrichment. *(iter 2 — done & verified)*
3. Consolidated Submissions Hub (one menu, accordion per form/PDF), Excel/XLSX exports with dual-header rows (labels + keys), Section-9 workflow email attachments (Completed PDF / Original PDF / Excel / CSV / ZIP bundle). *(iter 3 — done)*
4. Public submitter view is a plain standard form; Jotform-style split-pane (fields + PDF preview) moves to the builder Edit page. Approval nodes auto-resolve the approver email from Site Master (approver_email), with an optional CC input. Submitters + their vendor_admin can download a filled PDF of any submission. In-app notifications with a bell icon in the header for admins/approvers on `approval_pending` and `approval_decided`. *(iter 4 — done)*

## Stack
FastAPI (Python) + Motor / MongoDB + bcrypt + PyJWT + reportlab + openpyxl + simpleeval + pypdf • React 19 (craco) + Tailwind + shadcn/ui + lucide-react + @dnd-kit + ag-grid + react-pdf.

## Roles
| Role          | Sees / can do                                                                                                 |
|---------------|---------------------------------------------------------------------------------------------------------------|
| super_admin   | Everything.                                                                                                   |
| admin         | Sites where `cluster_manager_name` matches their own, or where they appear in `assigned_admin_ids`. Same scope for forms / PDF forms / submissions. CANNOT edit master data (sites / vendors / master tables). |
| vendor_admin  | Only their vendor's sites/forms/PDF forms/submissions. Can add/remove/reset team users (vendor scope only). Can view any team member's approved submission as filled PDF. Menu: Manpower, Forms, Submissions, Team. |
| vendor_user   | Only their own submissions + forms assigned to them. Can download their own filled PDF. Menu: Forms, Submissions only. |

## Demo seeds (idempotent on backend startup)
- `admin@example.com / Admin@12345` — super_admin
- `rahul.verma@example.com / Admin@12345` — admin (cluster_manager_name="Rahul Verma" → Alpha + Bravo)
- `vendor.admin@sunops.example.com / Vendor@12345` — vendor_admin (vendor_id=ven_sunops_demo → Alpha + Charlie)
- `vendor.user@sunops.example.com / Vendor@12345` — vendor_user (same vendor)

Sites now carry an `approver_email` per row (seeded: approver.alpha@example.com, approver.bravo@example.com, approver.charlie@example.com).

## Files added / changed (iter 4 — approval + notifications + submitter PDF)
- **new** `/app/backend/notifications.py` — in-app notifications collection + router mounted at `/api/notifications`. Endpoints: `GET /`, `GET /unread-count`, `PATCH /{id}/read`, `POST /read-all`. Utility `create_notification(db, ...)` + `notify_users_by_email(db, emails, ...)` for helpers that need to fan-out by email.
- `/app/backend/server.py` — mounts the notifications router. New endpoint `GET /api/submissions/{id}/filled.pdf` that generates a printable PDF of any standard-form submission via reportlab. Access allowed to submitter, submitter's vendor_admin, form owners, super_admin. Also sets `submission_kind: "form"` in the workflow trigger payload for consistency with PDF-form submissions.
- `/app/backend/pdf_routes.py` — `download_completed` now also allows the submitter + their vendor_admin (in addition to RLS) so they can access their own filled PDF.
- `/app/backend/workflow_routes.py` — `_create_approval` auto-resolves the approver email from the site's `approver_email` column when `auto_from_site` (default true) and the submission carries a `site_name`. CC list is honoured in the email envelope. Fans out `approval_pending` in-app notifications to every approver + CC user. `resume_from_approval` now creates `approval_decided` notifications for the submitter and every `vendor_admin` in the submitter's vendor_id.
- `/app/backend/vendor_routes.py` — Site Master schema extended with new columns `approver_email` and `cluster_manager_name`. `seed_demo_sites` backfills both on existing rows.
- `/app/frontend/src/pages/PublicPdfForm.jsx` — REVERTED to a plain standard-form view (no PDF pane). Success screen still offers the completed PDF download.
- `/app/frontend/src/pages/PdfBuilder.jsx` — the Preview dialog is now the Jotform-style split-pane view (form fields left, PDF preview right). Live in the builder Edit page.
- `/app/frontend/src/components/layout/NotificationsBell.jsx` (new) — bell icon in the header polling `/notifications/unread-count` every 30s. Popover lists notifications with mark-all-read + click-to-mark-read + navigation to `notification.link`.
- `/app/frontend/src/components/layout/AppLayout.jsx` — added a top header row with the notification bell.
- `/app/frontend/src/pages/SubmissionsHub.jsx` — Download button on EVERY row: PDF-form rows fetch `/pdf-submissions/{id}/completed`, standard-form rows fetch the new `/submissions/{id}/filled.pdf`.
- `/app/frontend/src/lib/workflowNodes.js` — Approval nodes get an `auto_from_site` toggle (default on), a `cc` input, and clearer copy. `send_email` action gets the 5 attachment options (Completed PDF / Original PDF / Excel export / CSV export / ZIP bundle).
- `/app/frontend/src/pages/WorkflowDesigner.jsx` — added a `boolean` field renderer for the new `auto_from_site` config option.
- `/app/frontend/src/pages/Submissions.jsx` + `PdfSubmissions.jsx` — per-form pages get an "Export Excel" button (iter 3).

## New API surface (iter 4)
- `GET /api/notifications`, `GET /api/notifications/unread-count`, `PATCH /api/notifications/{id}/read`, `POST /api/notifications/read-all`
- `GET /api/submissions/{id}/filled.pdf`  (submitter + vendor_admin + form owners)
- Site Master column list now includes `approver_email` and `cluster_manager_name`.

## What's still open (backlog)
- (P1) Vendor Admin `/team` React page — endpoints exist; page not built yet.
- (P1) Filter facets on the Forms list (vendor, cluster manager).
- (P1) Enriched Approval UI cards showing form name + PDF/Site/Vendor + current status badge.
- (P2) SQL data source against PostgreSQL (out of scope for current Mongo stack).
- (P2) Notification bell — websocket push (currently polls every 30 s).
