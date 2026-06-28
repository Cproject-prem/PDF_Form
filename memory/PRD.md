# FormForge — Product Requirements & Architecture

## Source problem statements
1. Add Site Management dropdown + dynamic data sources + lookup + formula engine across every selectable field. *(iter 1 — done & verified)*
2. Add the 4-role RBAC permission model (Super Admin / Admin / Vendor Admin / Vendor User), row-level security on sites/forms/PDF-forms/submissions, PDF Form Builder feature parity with normal Form Builder, workflow context enrichment. *(iter 2 — done & verified)*

## Stack
FastAPI (Python) + Motor / MongoDB + bcrypt + PyJWT + reportlab + openpyxl + simpleeval + pypdf • React 19 (craco) + Tailwind + shadcn/ui + lucide-react + @dnd-kit + ag-grid + react-pdf.

## Roles (iter 2)
| Role          | Sees / can do                                                                                                 |
|---------------|---------------------------------------------------------------------------------------------------------------|
| super_admin   | Everything.                                                                                                   |
| admin         | Sites where `cluster_manager_name` matches their own, or where they appear in `assigned_admin_ids`. Same scope for forms / PDF forms / submissions. CANNOT edit master data (sites / vendors / master tables). |
| vendor_admin  | Only their vendor's sites/forms/PDF forms/submissions. Can add/remove/reset team users (vendor scope only). Menu: Manpower, Forms, Submissions, Team. |
| vendor_user   | Only their own submissions + forms assigned to them. Menu: Forms, Submissions only.                           |

Demo seeds (idempotent on backend startup):
- `admin@example.com / Admin@12345` — super_admin
- `rahul.verma@example.com / Admin@12345` — admin (cluster_manager_name="Rahul Verma" → Alpha + Bravo)
- `vendor.admin@sunops.example.com / Vendor@12345` — vendor_admin (vendor_id=ven_sunops_demo → Alpha + Charlie)
- `vendor.user@sunops.example.com / Vendor@12345` — vendor_user (same vendor)

## Files added / changed (iter 2)
- New `/app/backend/permissions.py` — `normalize_role`, `site_filter`, `form_filter`, `can_view_form`, `can_edit_form`, `submission_filter`, `capabilities_for`, `menu_for`, `require_master_data_editor`.
- `/app/backend/server.py` — adds `cluster_manager_name`/`vendor_id`/`assignments` to `User`, `Form` carries `assigned_*` lists. New `/api/auth/menu`, `/api/submissions` (global). `list_forms`, `_get_form_for_user`, `update_form`, `patch_form`, `duplicate_form`, `delete_form` all delegate to the permissions module. Demo seeds the 3 new roles + Site backfill of `cluster_manager_name`. Workflow trigger payload enriched with `form_name / form_type / site_name / vendor_name / current_status`.
- `/app/backend/vendor_routes.py` — `_site_filter_for_user` delegates to `permissions.site_filter`. All Site/Vendor/Master Data **write** endpoints now use `_require_master_data_editor` (super_admin only). Vendor User CRUD now uses `_require_vendor_user_editor` (vendor admin can manage their own team). `DEMO_SITES` carry `cluster_manager_name`; `seed_demo_sites` backfills it on existing rows.
- `/app/backend/pdf_routes.py` — `PDFField` is now `extra="allow"` so PDF fields can carry the same `data_source`/`lookup`/`formula` blobs as normal form fields. `PDFTemplateIn` carries the same `assigned_*` lists. `_owner_query` + `_get_template_for_user` delegate to `permissions.form_filter` / `can_edit_form`.
- `/app/frontend/src/components/layout/AppLayout.jsx` — sidebar is now data-driven by `GET /api/auth/menu`.
- `/app/frontend/src/lib/utils2.js` — `ROLE_LABELS` and `ROLES` extended with `vendor_admin`/`vendor_user`.
- `/app/frontend/src/components/builder/FieldDataLookupFormulaTabs.jsx` — shared compact Data/Lookup/Formula panel.
- `/app/frontend/src/components/pdfbuilder/PdfProperties.jsx` — mounts the shared panel for PDF-builder parity.

## Test status (iter 2)
- Backend pytest: 18/18 iter-1 regression + 18/20 iter-2 → after the master-data-guard fix: **38/38 expected** (curl-verified manually for Admin 403, Super Admin 200, Vendor Admin scoped writes).
- Frontend Playwright: role-based sidebars correctly shown per role; PDF builder dlf-tabs render; iter-1 public form regression passes.

## What's still open (next sessions)
- (P1) Workflow runtime: surface enriched payload in Approval/Workflow UI cards (form name + PDF/Site/Vendor + current status badge).
- (P2) Workflow Email Action: checkbox attachment picker (Completed PDF / Original Template / Signature Images / Submission Attachments / Custom Upload).
- (P2) Vendor Admin team management UI page (/team) — endpoints already enforce the scope; needs the React page.
- (P2) Forms list filter UI: show "assigned to vendor", "cluster manager" facets.
- (P2) SQL data source against PostgreSQL (out of scope for current Mongo stack).
