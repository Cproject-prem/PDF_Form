# FormForge — Documentation

Full project documentation, organised as **24 topic folders**. Each folder contains a `README.md` that stands alone.

| # | Folder | What's inside |
|--:|--------|--------------|
| 01 | `01_Project_Overview` | Vision, personas, goals, tech stack |
| 02 | `02_Requirements` | Functional (FR) + non-functional (NFR) requirements (including AI Isolation NFRs) |
| 03 | `03_User_Roles` | Role hierarchy + permission matrix + RLS explainer |
| 04 | `04_Sitemap` | Route tree + navigation groups per role |
| 05 | `05_Page_Details` | Per-page spec (purpose, components, APIs, behaviour) |
| 06 | `06_Workflows` | End-to-end business flows + workflow-engine node reference |
| 07 | `07_Database` | MongoDB collections, sample docs, indexes, relationships |
| 08 | `08_API_Documentation` | Every endpoint grouped by domain |
| 09 | `09_UI_UX` | Design tokens, components, motion, accessibility |
| 10 | `10_Assets` | Static + user-uploaded asset inventory, icon library |
| 11 | `11_Reports` | Excel exports, dashboard stats, plant edit history, audit |
| 12 | `12_Testing` | Test pyramid, manual checklist, testid registry, AI fault injection |
| 13 | `13_Deployment` | Docker / bare-metal / production setups + env vars |
| 14 | `14_Future_Features` | Prioritised backlog (P0/P1/P2) |
| 15 | `15_Change_Log` | Version history, newest first |
| 16 | `16_Security` | Hardening measures, AI security controls, deployment checklist |
| 17 | `17_Network_Architecture` | Topology, trust boundaries, Zscaler, Cloudflare Tunnel, TLS |
| 18 | `18_Threat_Model` | STRIDE threat matrix, attack surfaces, security controls |
| 19 | `19_AI_Architecture` | Microservice isolation, Ollama, local LLM, health probes, circuit breaker |

| 20 | `20_AI_RAG` | RAG processing lifecycle, document chunking, vector store, permissions |
| 21 | `21_AI_Governance` | Local/cloud AI policy, privacy, prompt injection, AI kill switch |
| 22 | `22_Disaster_Recovery` | RPO/RTO metrics, MongoDB + upload + RAG vector backup/restore runbooks |
| 23 | `23_Security_Test_Plan` | Comprehensive security test matrix, automated verification scripts |
| 24 | `24_Deployment_Runbook` | 3-stage deployment runbook (Dev, UAT, Production), rollback, verification |

## How to use these docs

- **New developer onboarding** → read `01`, `13`, `17`, `19`, `07`, `08` in that order.
- **Product / stakeholder review** → `01`, `02`, `06`, `15`, `21`.
- **QA & Security test planning** → `03`, `04`, `05`, `12`, `18`, `23`.
- **DevOps & SysAdmin** → `13`, `16`, `17`, `22`, `24`.

## Keeping docs fresh

- Each PR that changes behaviour should also touch the relevant `docs/*/README.md`.
- Every release → add a new entry to `15_Change_Log`.
- Roadmap items in `14_Future_Features` move to `15_Change_Log` once shipped.
