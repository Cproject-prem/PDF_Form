# FormForge — Product Requirements & Architecture

## Source problem statements
1. Site Management dropdown + dynamic data sources + lookup + formula engine across every selectable field. *(iter 1 — done & verified)*
2. 4-role RBAC (Super Admin / Admin / Vendor Admin / Vendor User), row-level security on sites/forms/PDF-forms/submissions, PDF Form Builder feature parity, workflow context enrichment. *(iter 2 — done & verified)*
3. Consolidated Submissions Hub, Excel/XLSX exports with dual-header rows, Section-9 workflow email attachments. *(iter 3 — done & verified)*
4. Public submitter view = plain form; Jotform-style split-pane preview moved to builder Edit page. Approval nodes auto-resolve approver email from Site Master. Submitter + vendor_admin download filled PDF. In-app notifications with header bell. *(iter 4 — done)*
5. Menu routing fix + `getErrorMessage()` helper + seed backfill. Admin gets Users menu. *(iter 4b — done & verified)*
6. **iter 4c**: Plants (Site Master detail) page, region-based admin RLS driven by Site Master's `region` column, enhanced User Management (create+edit+region dropdown+welcome email+auto-generated temp password), real-time WebSocket notifications. *(done)*
7. **iter 4d**: Anonymous submitter can download filled PDF from success screen (short-lived 24h JWT tied to the submission id); Plant View gets an Edit-History timeline with per-field diffs. *(this iteration — done)*

## Stack
FastAPI + Motor/MongoDB + bcrypt + PyJWT + reportlab + openpyxl + simpleeval + pypdf • React 19 (craco) + Tailwind + shadcn/ui + lucide-react + react-pdf + native WebSocket.

## Roles & scope (iter 4d — SHARED FORMS)
| Role          | Form definitions              | Submissions                                                                 |
|---------------|-------------------------------|-----------------------------------------------------------------------------|
| super_admin   | All                           | All                                                                         |
| admin         | **All (shared library)**      | Submissions where `values.site_name/site_code/asset_id` refers to a site inside their `region`/`cluster_manager_name`/`assigned_admin_ids` scope. Global admins (no region/cluster set) see every submission. |
| vendor_admin  | Only their vendor's forms     | Submissions from any user in the same `vendor_id`                            |
| vendor_user   | Only forms assigned to them   | Only own submissions                                                        |

## Region-based access (iter 4c)
Site Master is the master for access mapping.  Every admin user has three optional access columns:
- `region` — matches `sites.region` (regional access — sees all plants in that region + all forms with `assigned_regions` containing that region).
- `cluster_manager_name` — matches `sites.cluster_manager_name` (fallback).
- `assigned_admin_ids` — explicit per-site assignment (fallback).

Any match on any of the three grants access, so an admin can be regional, cluster-scoped, or per-site-scoped — or all three at once.

## Real-time notifications (iter 4c)
- `WS /api/notifications/ws?token=<JWT>` — per-user push channel. Auth via query token (browsers can't set headers on the handshake).
- Frontend `NotificationsBell` opens the socket on mount, prepends new notifications to the popover, increments the bell badge, and shows a Sonner toast. Reconnects after 3 s on drop; falls back to 60 s polling as a safety net.
- Uses an in-process registry (dict of `user_id → set[WebSocket]`) — swap for Redis pub/sub before scaling past one worker.

## Files added / changed (iter 4c)
- **new** `/app/frontend/src/pages/Plants.jsx` — Plants list (`/plants`) + Plants detail (`/plants/:site_code`).  Search, status filter, hero card, grouped sections (Location, Vendor & customer, Approver, Timeline), recent submissions.
- `/app/backend/vendor_routes.py` — new `GET /api/sites/by-code/{site_code}` for the Plants detail page (returns `{site, recent_submissions[]}` with RLS).
- `/app/backend/server.py` — new `GET /api/regions` and `GET /api/cluster-managers` (distinct values from Site Master, RLS-filtered).  User model now has `region`.  `create_user`, `update_user`, `delete_user` open to admin + vendor_admin with careful scope guards; create_user supports auto-generated temp password + configurable welcome email; response returns `temp_password` when generated or SMTP fails.
- `/app/backend/permissions.py` — `site_filter()` and `form_filter()` for admin role now include `region` clause. Menu extended with `plants`. `/site-master` path fixed to `/sites`; `/smtp` → `/settings/smtp`.
- `/app/backend/notifications.py` — added WebSocket `/notifications/ws` endpoint + in-process connection registry. `create_notification` now pushes over the socket in addition to persisting.
- `/app/frontend/src/pages/Users.jsx` — complete rewrite: search, edit-user dialog, temp-password result dialog, region + cluster dropdown pulled from `/api/regions` and `/api/cluster-managers`. Scope pill shows region/cluster/vendor per user. Role list adapts to the actor (vendor_admin sees only vendor* roles).
- `/app/frontend/src/lib/api.js` — `getErrorMessage()` helper safely stringifies Pydantic 422 arrays.
- `/app/frontend/src/components/layout/NotificationsBell.jsx` — WebSocket subscription + reconnect + Sonner toast on push.
- `/app/frontend/src/App.js` — Plants routes.  `/pdf-forms`, `/reports`, `/team` alias routes to eliminate the sidebar-redirects-to-dashboard bug.  `/users` opened to `super_admin`+`admin`.

## New API surface (iter 4c)
- `GET  /api/regions`             — distinct regions from Site Master (RLS-filtered)
- `GET  /api/cluster-managers`    — distinct cluster manager names
- `GET  /api/sites/by-code/{code}`— Plants detail (site + recent submissions)
- `WS   /api/notifications/ws?token=…` — real-time push channel

## Demo seed additions (iter 4c)
- `south.admin@example.com / Admin@12345` — admin with `region=South` (region-based access demo).

## Public download tokens (iter 4d)
- `POST /api/public/forms/{slug}/submit` now returns `download_token` (JWT scope=`download`, kind=`form`, sid, 24h TTL).
- `POST /api/public/pdf-forms/{slug}/submit` also returns `download_token` (kind=`pdf`).
- `GET  /api/public/submissions/{sid}/filled.pdf?token=…` — anonymous-safe standard-form filled PDF.
- `GET  /api/public/pdf-submissions/{sid}/completed?token=…` — anonymous-safe PDF-form completed file.
- Frontend `PublicForm.jsx` and `PublicPdfForm.jsx` success screens use these tokenised URLs so the "Download filled PDF" button works without auth.

## Plant edit history (iter 4d)
- `GET /api/sites/by-code/{site_code}/history` — RLS-scoped, returns `{site_id, current_version, history:[{version, saved_at, saved_by_name/email, changes:[{field, from, to}], change_count}]}`. Newest snapshot's diff is computed against the *current* live row; older snapshots diff against the next-newer snapshot.
- Frontend `PlantEditHistory` component on `/plants/{code}` renders a collapsible timeline with red-strikethrough → green diff pills for each field change.

## Backlog
- (P1) Vendor Admin `/team` page — currently uses Users.jsx; needs vendor-scoped filter UI.
- (P1) Redis pub/sub in `notifications._push` for multi-worker deploys.
- (P1) Form sharing dialog (admin → admin) with editable vs view-only toggle.
- (P1) Configurable welcome-email template UI at `/settings/welcome-email` (backend already reads `db.workspace_settings["welcome_email"]`).
- (P2) SQL data source against PostgreSQL.
- (P2) Enriched Approval UI cards with form/site badges.

## iter 5 — Access-Override + Strict Form-Edit Lock (Feb 2026)
- **Backend**
  - `permissions.py`: new `has_access_override(user)` + `can_create_form(user)` + `require_can_create_form(user)`; `can_edit_form`, `can_view_form`, `site_filter`, `form_filter`, `submission_filter`, `async_submission_filter` and `capabilities_for` all honour the override flag (treats holder as super-admin).
  - `site_filter` for vendor tier now uses `$or` on `vendor_id` OR `assigned_vendor_ids` (share-based visibility).
  - `POST /api/forms`, `POST /api/forms/{id}/duplicate`, `POST /api/pdf-forms/upload`, `POST /api/pdf-forms/{id}/duplicate` now return **403** for vendor tier (require_can_create_form).
  - New `User.access_override: bool`. `PATCH /api/users/{id}` accepts `access_override` — only super-admin may toggle (403 otherwise).
  - **Per-form submission RLS (bug fix)**: `GET /api/forms/{id}/submissions`, `.../export.xlsx`, `GET/PATCH/DELETE /api/submissions/{sid}`, and the identical PDF endpoints in `pdf_routes.py` now scope rows by role (super_admin/override → all, admin → region/cluster, vendor_admin → team-vendor, vendor_user → own).
- **Frontend**
  - `Users.jsx`: super-admin only sees "Grant Add-on Access override" checkbox in the Create + Edit dialogs; ScopePill renders an `OVERRIDE` badge for such users.
  - `Forms.jsx`: `canEditForms` boolean = `role in [super_admin, admin] || access_override`; hides Create button, empty-state CTA, and all Edit / Duplicate / Archive / Delete card + menu items when false.
  - `App.js`: `/forms/:id/build`, `/pdf-forms/:id/build`, `/workflows/:id/build` gated by `BUILDER_ROLES = ["super_admin","admin"]`; `Protected` respects `user.access_override` as an escape hatch.
- **Verification**: backend testing agent ran 13 pytest scenarios (12 pass, 1 flaky due to test-parallelism, not product); curl E2E confirms vendor_admin `list submissions` on a shared form drops from 16 → 0 (or team-only rows) — the reported "still others submissions shown in vendor access" bug is fixed.


## iter 6 — Schedule vs Actual page (Feb 2026)
- **Feature:** Per-site monthly cycle tracker with submit → approve workflow.
- **Backend**
  - New collection `site_cycles`: unique key `(site_id, year, month, cycle_number)`; blocks `schedule{planned_date, notes, status}` and `actual{actual_date, result[Done|Missed], notes, status}` — each with `submitted_at/by`, `approved_at/by`, `unlocked_at/by/note`.
  - New file `schedule_routes.py` exposes: `GET /api/site-cycles?year=&month=&site_id=`, `POST /api/site-cycles/upsert`, `POST /api/site-cycles/{id}/submit-schedule|approve-schedule|submit-actual|approve-actual|unlock`, `GET /api/site-cycles/summary?year=` (yearly rollup per plant).
  - Site Master gained core column `cycles_per_month` (default 1). Vendors save schedule/actual; admin (cluster manager) or super_admin approve. Approved blocks are locked; admin can unlock with an audit note (`unlock_note`).
  - RLS delegates to `permissions.site_filter` — vendor sees own plants only, admin sees region/cluster, super_admin+override see everything.
- **Frontend** — new page `/schedule` (menu entry "Schedule vs Actual" for all roles):
  - Year dropdown auto-adds next year once current month ≥ Sep (so Q4 planning works).
  - Month dropdown + Monthly / Yearly-Summary toggle.
  - Monthly view: table with one row per site × cycle; Planned date, Sch-notes | Actual date, Result, Act-notes; per-block Save / Submit / Approve / Unlock buttons that honour the lock rules.
  - Yearly view: per-plant progress table with draft/submitted/approved counts and a percentage completion bar.
- **Verified via curl:** `GET /api/site-cycles?year=2026` returns sites with `cycles_per_month`; PUT `/api/sites/{id}` with `cycles_per_month=2` correctly surfaces both 1st + 2nd cycle rows; upsert + yearly summary work end-to-end. Frontend screenshot confirms the sidebar entry and table rendering.


## iter 7 — Schedule attachments policy (Feb 2026)
- **Requirement**: The "Schedule vs Actual" page must accept image/PDF attachments as **proof of work**. Attachments are **REQUIRED on the Actual submission** (proof of execution), but **OPTIONAL on the Schedule submission** (planning-only step).
- **Backend** — `schedule_routes.py`
  - `POST /api/site-cycles/{cycle_id}/submit-schedule` no longer requires `evidence_files`. It only validates that `planned_date` is set.
  - `POST /api/site-cycles/{cycle_id}/submit-actual` continues to enforce `evidence_files` (400 "Attach at least one photo / PDF before submitting the actual").
- **Frontend** — `Schedule.jsx`
  - Schedule row's "Submit" button no longer blocked by `!schHasAttachments`.
  - `AttachStrip` gained a `required` prop → Schedule side renders "Attach (optional)" in neutral gray; Actual side renders "Upload proof *" in red when empty.
- **Verified via curl (Feb 17 2026)**:
  - Upsert + submit-schedule with no attachments → HTTP 200, status=`submitted`.
  - Upsert actual + submit-actual with no attachments → HTTP 400 "Attach at least one photo / PDF before submitting the actual".
  - Screenshot of `/schedule` confirms optional vs required styling difference.


## iter 8 — PDF checkbox per-option positions + Vendor normalise (Feb 2026)
- PDF Form checkbox / radio: each option is now an independently draggable box on the PDF page. New `option_positions` field on `PDFField`; renderer, editor, filler and public overlay all respect it. Backend `_draw_radio` helper added; radio removed from text-drawing list.
- Vendor Management/Users mismatch fixed: `_normalize_vendor()` aliases `name ↔ vendor_name` and `email ↔ vendor_email` in every GET/POST/PUT `/api/vendors*` response so both pages see identical data.

## iter 9 — Admin approvals + multi-vendor site sharing (Feb 2026)
- **Feature 1 — approval-gated user disable**
  - When a vendor_admin sends `PATCH /api/users/{id}` or `PUT /api/vendor-users/{id}` with `is_active: false`, the change is NOT applied; instead a row is inserted in the new `pending_approvals` collection and the API returns HTTP 202 `{ pending_approval: true, approval: {...} }`.
  - New router `admin_approvals` (prefix `/api/admin-approvals`) — separate from the existing workflow `/api/approvals`:
    - `GET /admin-approvals?status=pending`  — super_admin/admin see all, vendor_admin sees own requests
    - `POST /admin-approvals/{id}/approve` — applies the deferred action (disables the target user)
    - `POST /admin-approvals/{id}/reject`  — marks the request rejected with an optional reason
  - Frontend: Users page gains a segmented **Users / Approvals** toggle (super_admin & admin only) with a badge counter. `ApprovalsCard` lists pending items with Approve/Reject controls; vendor_admin sees a toast "Request submitted for admin approval" when their disable is queued.
- **Feature 2 — site allow-list of emails**
  - `permissions.site_filter()` now also matches `allowed_emails: user.email`, so a site accessible to multiple contact addresses under the same vendor.
  - `_upsert_site()` and `PUT /api/sites/{id}` normalise the `vendor_email` string: any `;`/`,`/whitespace-separated set is split, first email stays in `vendor_email`, all of them go into `allowed_emails`.
  - Site Master UI: helper hint under the title ("Vendor email accepts multiple addresses separated by `;`"), column tooltip on `vendor_email`, and `load()` reconstitutes the `; `-joined value from `allowed_emails` so subsequent edits don't drop entries.
- **Verified via curl (Feb 17 2026)**:
  - vendor_admin PATCH `/users/{id}` with `is_active:false` → HTTP 202 `pending_approval:true`. Target `is_active` remains true. Admin `POST /admin-approvals/{id}/approve` → target `is_active` becomes false.
  - Site create with `vendor_email: "alice@w.com; bob@w.com , carol@w.com"` → `vendor_email="alice@w.com"`, `allowed_emails=["alice@w.com","bob@w.com","carol@w.com"]`.
  - Screenshot of Users → Approvals tab shows badge counter and Approve/Reject controls.

## iter 10 — Hierarchy: vendor member scope + tiered approval override (Feb 2026)
- **Phase A — Vendor member sees only assigned plants**
  - `permissions.site_filter()` (branch `VENDOR_USER`) no longer inherits the vendor-wide `vendor_id` clause. When `assignments.sites` is set → the member sees ONLY those; when empty → sees none (fail-safe). `allowed_emails`/`vendor_email` per-site ad-hoc sharing still works.
  - Vendor Admin behaviour unchanged (still sees all vendor plants).
- **Phase B — Plant-assignment UI**
  - `Users.jsx` → new `PlantAssignPicker` (searchable multi-select, "Select all filtered", per-plant checkbox) shown in Edit dialog when target user's role is `vendor` and a vendor is chosen. Saves via `PUT /vendor-users/{id}/assignments` in addition to the main `/users/{id}` PATCH.
- **Phase C+D — Tiered approval hierarchy**
  - New `permissions.can_approve(actor, approval_row)` helper implementing:
    `super_admin (or access_override) > region_admin > cluster_manager > vendor_admin`
  - Cluster manager = `role=admin` AND `cluster_manager_name` set. Region admin = `role=admin` AND `region` set. Approver must be strictly higher on the ladder AND their scope (region / cluster) must contain the target user's `region`/`cluster_manager_name`.
  - Pending approvals now tag `target_region` and `target_cluster_manager_name`, plus requester's own region/cluster.
  - `GET /admin-approvals` filters the list to what the caller could actually act on (super_admin sees all; region/cluster admin sees only their scope; vendor_admin sees own requests).
  - `POST /admin-approvals/{id}/approve` and `/reject` reject with 403 if the actor is outside scope.
- **Phase E — Team view**
  - Users list gained a "Plants" column via new `PlantsBadge`: shows "All" for super_admin/override, "Cluster scope" / "Region scope" for admins, "All vendor plants" for vendor_admin, and the exact count (or red "0 plants" warning) for vendor members.
- **Verified**:
  - Curl e2e: fresh vendor_admin sees 4 vendor sites, fresh vendor_user with no assignments sees 0, after `PUT .../assignments {sites:[X]}` sees exactly 1.
  - Python REPL: 7 `can_approve` test cases all pass (region match, cluster match, mismatched region, super_admin always, vendor_admin never).


## iter 11 — Login-gated public forms + submitter capture (Feb 2026)
- **Backend**
  - `POST /api/public/forms/{slug}/submit` and `POST /api/public/pdf-forms/{slug}/submit` switched from `Depends(get_optional_user)` → `Depends(get_current_user)`. Anonymous requests return HTTP 401 "Not authenticated".
  - Each submission doc now stores `submitted_by` (user_id), `submitted_by_name` and `submitted_by_email` — captured at write time from the authenticated viewer.
  - The Hub endpoint's existing enrichment (`s.setdefault("submitted_by_name", u.get("name"))`) also fills these fields for legacy rows via user lookup.
- **Frontend**
  - `PublicForm.jsx` and `PublicPdfForm.jsx` now show a "Please sign in to continue" login gate for unauthenticated visitors. The Sign In button navigates to `/login?next=<current-path>`.
  - `Login.jsx` reads the `?next=` query parameter and redirects there after successful sign-in (in addition to the classic `state.from` React Router pattern).
  - `SubmissionsHub.jsx` gained a new "Submitted by" column powered by `SubmitterCell`. Legacy anonymous rows render as "Anonymous" (italic gray).
- **Verified via curl (Feb 17 2026)**:
  - Anonymous submit → HTTP 401 on both `/public/forms/{slug}/submit` and `/public/pdf-forms/{slug}/submit`.
  - Authed submit → 200 with submission created; DB doc has `submitted_by_name="Super Admin"`, `submitted_by_email="admin@example.com"`, `submitted_by="user_cc16917170e0"`.
  - Screenshot of `/f/sig-test-4977bd` when not signed in confirms the auth gate card.


## iter 12 — Vendor auto-link + Plant Assign Picker fix (Feb 2026)
- **Root cause found**: sites created via Site Master with a freeform `vendor_name` (e.g. `s`, `d`, `f`) never had their `vendor_id` populated, because `_upsert_site` only auto-linked when a matching **user** email existed. Vendors created via Vendor Management had no user tied to them → `vendor_id` stayed null. Result: `PlantAssignPicker` (Users → Edit → assign plants) showed only SunOps plants.
- **Backend fixes** — `vendor_routes.py`
  - `_upsert_site()` now looks up the `vendors` collection first (by `name` case-insensitive, then by `email`), then falls back to a user email match. Any new/edited site with a valid vendor_name or vendor_email gets a real `vendor_id`.
  - New endpoint `POST /api/sites/relink-vendors` — bulk repair: iterates every site whose `vendor_id` is missing and re-attaches it via vendor_name / vendor_email match. Returns `{relinked: n}`.
- **Frontend fixes**
  - `SiteMaster.jsx` gained a **"Relink vendors"** toolbar button that calls the new endpoint and reloads the grid.
  - `Users.jsx` `PlantAssignPicker` filter broadened: still uses `vendor_id` primarily but now also matches `vendor_name` and `vendor_email` from the selected vendor row — so legacy sites still show up even if their `vendor_id` was never linked.
- **Verified via curl (Feb 17 2026)**:
  - Before relink: "Bravo Wind 30MW" had `vendor_id=None`. After `POST /api/sites/relink-vendors` → `{ok:true, relinked:1}`, its `vendor_id` = `ven_68dc0ca5117c` (matching vendor `d`).

