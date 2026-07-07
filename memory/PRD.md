# FormForge — Product Requirements & Architecture

## Source problem statements
1. Site Management dropdown + dynamic data sources + lookup + formula engine across every selectable field. *(iter 1 — done & verified)*
2. 4-role RBAC (Super Admin / Admin / Vendor Admin / Vendor User), row-level security on sites/forms/PDF-forms/submissions, PDF Form Builder feature parity, workflow context enrichment. *(iter 2 — done & verified)*
3. Consolidated Submissions Hub, Excel/XLSX exports with dual-header rows, Section-9 workflow email attachments. *(iter 3 — done & verified)*
4. Public submitter view = plain form; Jotform-style split-pane preview moved to builder Edit page. Approval nodes auto-resolve approver email from Site Master. Submitter + vendor_admin download filled PDF. In-app notifications with header bell. *(iter 4 — done)*
5. Menu routing fix + `getErrorMessage()` helper + seed backfill. Admin gets Users menu. *(iter 4b — done & verified)*
6. **iter 4c**: Plants (Site Master detail) page, region-based admin RLS driven by Site Master's `region` column, enhanced User Management (create+edit+region dropdown+welcome email+auto-generated temp password), real-time WebSocket notifications. *(this iteration — done)*

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

## Backlog
- (P1) Vendor Admin `/team` page — currently uses Users.jsx; needs vendor-scoped filter UI.
- (P1) Redis pub/sub in `notifications._push` for multi-worker deploys.
- (P1) Form sharing dialog (admin → admin) with editable vs view-only toggle.
- (P1) Configurable welcome-email template UI at `/settings/welcome-email` (backend already reads `db.workspace_settings["welcome_email"]`).
- (P2) SQL data source against PostgreSQL.
- (P2) Enriched Approval UI cards with form/site badges.
