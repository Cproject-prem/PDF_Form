# 08 — API Documentation

Base URL: `<REACT_APP_BACKEND_URL>/api`
Auth: `Authorization: Bearer <jwt>` (unless marked **public**).

---

## Auth

| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | `/auth/login` | `{email, password}` | `{token, user}` |
| GET  | `/auth/me` | — | current `User` |
| POST | `/auth/change-password` | `{old, new}` | `{ok:true}` |

## Users

| Method | Path | Notes |
|--------|------|-------|
| GET  | `/users` | admin+ |
| POST | `/users` | admin+; auto-generate temp password + welcome email |
| PATCH | `/users/{user_id}` | admin+ |
| DELETE | `/users/{user_id}` | super_admin only |

## Forms (standard)

| Method | Path | Notes |
|--------|------|-------|
| GET  | `/forms` | RLS-scoped |
| POST | `/forms` | admin+ |
| GET  | `/forms/{form_id}` | RLS |
| PATCH | `/forms/{form_id}` | autosaved by builder |
| POST | `/forms/{form_id}/publish` | flips `status="published"` |
| GET  | **public** `/public/forms/{slug}` | anonymous fetch |
| POST | **public** `/public/forms/{slug}/submit` | returns `{submission..., download_token}` |
| GET  | `/submissions` | RLS-scoped, filters via querystring |
| GET  | `/submissions/{sid}/filled.pdf` | Bearer-auth PDF |
| GET  | **public** `/public/submissions/{sid}/filled.pdf?token=...` | 24h token |
| GET  | `/submissions/export?form_id=...` | Excel export |

## PDF templates

| Method | Path | Notes |
|--------|------|-------|
| GET  | `/pdf-forms` | list |
| POST | `/pdf-forms` (multipart) | upload a PDF file |
| GET  | `/pdf-forms/{template_id}` | includes fields[] |
| PATCH | `/pdf-forms/{template_id}` | supports `title`, `status`, `settings`, `is_archived` |
| PUT  | `/pdf-forms/{template_id}` | full replace (used by builder autosave) |
| GET  | `/pdf-forms/{template_id}/file` | download original |
| GET  | **public** `/public/pdf-forms/{slug}` | anonymous fetch |
| GET  | **public** `/public/pdf-forms/{slug}/file` | anonymous PDF binary |
| POST | **public** `/public/pdf-forms/{slug}/submit` | returns `{submission..., download_token}` |
| GET  | `/pdf-submissions/{sid}/completed` | Bearer-auth |
| GET  | **public** `/public/pdf-submissions/{sid}/completed?token=...` | 24h token |

## Files

| Method | Path | Notes |
|--------|------|-------|
| POST | `/upload` (multipart) | auth required |
| POST | **public** `/public/upload` | for anonymous form filling |
| GET  | `/files/{file_id}` | streams from local disk (falls back to legacy-path search) |

## Master data

| Method | Path | Notes |
|--------|------|-------|
| GET  | `/sites` | RLS-scoped |
| POST | `/sites/import` (CSV) | admin+ |
| GET  | `/sites/by-code/{site_code}` | RLS |
| PATCH | `/sites/by-code/{site_code}` | snapshots into `site_versions` |
| GET  | `/sites/{site_id}/history` | admin+ |
| GET  | `/sites/by-code/{site_code}/history` | RLS; enriched with saved_by name/email + per-field diffs |
| GET  | `/vendors` | admin+ |
| GET  | `/regions` | any authed user |

## Workflows & approvals

| Method | Path | Notes |
|--------|------|-------|
| GET  | `/workflows` | admin+ |
| POST | `/workflows` | admin+ |
| PATCH | `/workflows/{wf_id}` | admin+ |
| POST | `/workflows/{wf_id}/publish` | admin+ |
| GET  | `/workflow-executions` | admin+ |
| GET  | `/approvals` | RLS |
| POST | `/approvals/{token}/decision` | **public** — magic-link approvals |

## Notifications (WebSocket)

- `WS  /ws/notifications` — authenticate via `?token=<jwt>` in query; server sends events as JSON: `{type, submission_id, actor, timestamp, ...}`.

## Health & meta

- `GET /api/health` → `{status:"ok", time: "..."}`
- `GET /api/dashboard/stats` → per-role stats

## Response conventions

Success: `200 OK` with the resource.
Errors: `4xx | 5xx` with body `{detail: "human readable"}`.

## Rate-limit
Not implemented (roadmap).

## Pagination
Cursor-based via `?cursor=<opaque>&limit=50`. Where paginated, response is `{items: [...], next_cursor: "..." | null}`.
