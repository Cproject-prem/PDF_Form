# 14 — Future Features (Backlog)

Prioritised roadmap. P0 = critical, P1 = high-value, P2 = nice-to-have.

## Data & security

- **P1 · Vendor Admin `/team` scoped view** — dedicated page listing only their vendor's users + submissions.
- **P1 · Redis pub/sub for multi-worker WebSockets** — today the notification hub is in-process, so scaling `uvicorn --workers 4` splits the fan-out. Introducing Redis as the message bus fixes it.
- **P1 · Form sharing dialog (admin ↔ admin)** — grant view / edit / admin permissions on a form to specific users, mirroring Google Docs share.
- **P1 · Impersonation** — super admin can "view as" another user for support (audit-logged).
- **P2 · SQL data source against PostgreSQL** — additional dropdown data source beyond Master Data.
- **P2 · Rate limiting** — per-IP and per-user throttling for public submit + login endpoints.
- **P2 · 2-FA (TOTP)** — via `pyotp`.

## Workflow

- **P1 · Cron-scheduled trigger** — `every day at 09:00`.
- **P1 · Webhook action node** — outbound HTTP POST with body template.
- **P2 · Branch node** — visual `if/else` splitter.
- **P2 · Slack / Teams / Telegram action** — via integration playbook.

## Builder / UX

- **P1 · Keyboard drag & drop in builder** — for accessibility.
- **P1 · Field-group / section container** — collapsible sections in long forms.
- **P2 · Multi-page forms** — page breaks with per-page validation.
- **P2 · Dark mode** — Tailwind `dark:` variants already partially applied.

## PDF

- **P1 · PDF field auto-detect** — parse AcroForm fields from the uploaded PDF and pre-populate the overlay.
- **P2 · Unicode font support** — register DejaVuSans TTF so non-Latin values render in filled PDF.
- **P2 · Digital signature** — cryptographic sign via a self-hosted CA.

## Reporting & analytics

- **P1 · Vendor scorecard** — submission volume, approval rate, avg SLA per vendor.
- **P1 · Region heatmap** — submission density per site on a map.
- **P2 · Weekly digest email** — auto-mailed KPI summary to admins.
- **P2 · Compliance report** — % of forms with signature completed, % approved on time.

## Ops

- **P1 · Prometheus metrics endpoint** — expose per-route latency, DB pool stats.
- **P1 · Sentry integration** — automatic backend exception capture.
- **P2 · Kubernetes deployment** — Helm chart with PVC for uploads.
- **P2 · Multi-tenant mode** — one code base, many isolated organisations by subdomain.

## Backup / Restore

- **P1 · `--encrypt PASSWORD` flag on `backup.py`** — AES-encrypted zips for cloud-safe storage.
- **P2 · Incremental backups** — since-timestamp deltas rather than full re-dump.
- **P2 · Automated restore drill** — CI job that spins up a fresh Mongo, restores the newest backup, runs the manual test checklist headlessly.

## AI (Auxiliary Microservice)

- **P1 · Multi-Model Selection UI** — admin toggle between local Gemma and Llama-3 models.

- **P2 · Form-from-prompt** — "Create a PTW form with 8 questions covering PPE, hazards, ..." → LLM emits full field JSON.
- **P2 · Smart approval suggestions** — flag suspicious submissions (missing signature, out-of-hours, etc.).


## Enterprise integrations

- **P2 · SSO via SAML** (Azure AD, Okta).
- **P2 · Excel `Save-to-SharePoint`** — instead of local download.

---

**Note**: this list is the union of stakeholder asks + internal roadmap. Anything shipped moves to `15_Change_Log`.
