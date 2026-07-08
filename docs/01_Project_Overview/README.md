# 01 — Project Overview

## Product
**FormForge** — a self-hosted, form + PDF-template builder for regulated field operations (safety permits, plant/site audits, vendor onboarding, workflow approvals).

## Vision
Give operations/EHS admins a single canvas to design, distribute and audit forms & fillable PDFs across multiple sites/vendors — without touching code, spreadsheets or email chains.

## Elevator pitch
> *"Google Forms meets Jotform meets Adobe Acrobat, with real-world plant hierarchy, region-based row-level security, workflow-based approvals, live notifications and airtight audit trails."*

## Primary business goals
1. Cut PTW (Permit-to-Work) turnaround from 24 h → under 1 h.
2. Eliminate paper forms in the field. 100 % digital submissions.
3. Provide auditable proof trail (who submitted what, from where, when, and who approved).
4. Restrict data by geography — regional admins never see other regions.
5. Vendor self-service: each vendor company sees only its own submissions.

## Target users
| Persona | Role | Primary Job-to-Be-Done |
|---------|------|------------------------|
| EHS Head | Super Admin | Design master forms; audit organization-wide |
| Regional Ops Head | Regional Admin | Approve submissions in their region |
| Site Cluster Manager | Cluster Admin | Manage plants inside a cluster |
| Vendor Account Manager | Vendor Admin | Oversee their team's submissions |
| Field Technician | Vendor User | Fill and submit forms from mobile |

## Success metrics
- Median form-fill time on mobile: ≤ 3 min
- P95 filled-PDF download after submit: ≤ 5 s
- Approval SLA breach rate: ≤ 2 %
- Regional data leakage incidents: **zero** (verified by row-level-security test suite)

## Non-goals
- Not a workflow-BPM engine (no complex branching approval trees today)
- Not a CRM / ticketing tool
- Not a public form-sharing marketplace

## Tech stack (see `13_Deployment` for infra)
- **Frontend**: React 18 (CRA + craco), Tailwind, shadcn/ui, react-pdf
- **Backend**: FastAPI (Python 3.11), Motor (async MongoDB driver), JWT auth
- **Database**: MongoDB 7
- **PDF**: PyMuPDF (rendering), reportlab (generation)
- **Realtime**: Native WebSockets
- **Excel export**: openpyxl
- **Files**: local disk under `backend/uploads/local/submissions/{sid}/`

## Repository layout
```
formforge/
├── backend/         FastAPI service + PDF/Excel/workflow engines
├── frontend/        React SPA (CRA + craco)
├── docs/            ← you are here
├── memory/          PRD + test credentials + roadmap
└── docker-compose.yml
```
