# 17. Network Architecture

This document describes the network topology, service isolation boundaries, internal/external traffic flows, proxy integration, and security perimeters for FormForge.

---

## 1. Network Topology

```text
                                UNTRUSTED / EXTERNAL NETWORK
                                              │
                                       [ HTTPS / Port 443 ]
                                              │
                                              ▼
                           ┌─────────────────────────────────────┐
                           │   NGINX Gateway / Reverse Proxy     │
                           │   (TLS 1.3 Termination, HSTS, CSP)  │
                           └──────────────────┬──────────────────┘
                                              │
                                    Internal Docker Network
                        ┌─────────────────────┴─────────────────────┐
                        │                                           │
                        ▼                                           ▼
          ┌───────────────────────────┐               ┌───────────────────────────┐
          │     formforge-frontend    │               │      formforge-backend    │
          │   (Static SPA on Port 80) │               │   (FastAPI Core / Port 8001)│
          └───────────────────────────┘               └─────────────┬─────────────┘
                                                                    │
                                            ┌───────────────────────┴───────────────────────┐
                                            │                                               │
                                            ▼                                               ▼
                              ┌───────────────────────────┐                   ┌───────────────────────────┐
                              │      formforge-mongo      │                   │       formforge-ai        │
                              │  (MongoDB Core / Port 27017)│                   │  (Isolated AI / Port 9000)│
                              └───────────────────────────┘                   └─────────────┬─────────────┘
                                                                                            │
                                                                                            ▼
                                                                              ┌───────────────────────────┐
                                                                              │          ollama           │
                                                                              │ (Local LLM / Port 11434)  │
                                                                              └───────────────────────────┘
```

---

## 2. Service Isolation & Port Mapping

| Service Name | Internal Port | Host Published Port (Dev) | Host Published Port (Prod) | Publicly Accessible | Role / Boundary |
|--------------|---------------|---------------------------|----------------------------|---------------------|-----------------|
| `gateway` (NGINX) | 80, 443 | 80, 443 | 80, 443 | **YES** | TLS Termination & Web Proxy |
| `frontend` | 80 | None | None | **NO** (via NGINX) | React SPA Static Server |
| `backend` | 8001 | 8001 (Optional) | None | **NO** (via NGINX `/api`) | FormForge Core FastAPI |
| `mongo` | 27017 | 127.0.0.1:27017 | None | **NO** | Enterprise MongoDB Store |
| `formforge-ai` | 9000 | None | None | **NO** (Internal Proxy Only)| Auxiliary AI Microservice |
| `ollama` | 11434 | None | None | **NO** | Local LLM Inference Engine |

---

## 3. Trust Boundaries & Perimeters

1. **Public Edge Boundary**:
   - Only NGINX (`gateway`) is exposed on ports 80/443.
   - Enforces TLS 1.3 encryption, HTTP Strict Transport Security (HSTS), and Content Security Policy (CSP).

2. **Core Application Perimeter**:
   - `backend`, `frontend`, and `mongo` communicate inside an isolated Docker bridge network (`formforge-network`).
   - Core backend handles all business logic, RBAC, and database operations.

3. **Auxiliary AI Perimeter**:
   - `formforge-ai` and `ollama` are completely isolated internal auxiliary services.
   - Ports `9000` and `11434` are **NEVER** exposed to external networks or published on host interfaces.
   - All AI requests flow through `backend` via strict HTTP timeouts and Circuit Breaker logic.

---

## 4. Zscaler & Corporate Proxy Compatibility

FormForge is designed to operate seamlessly within strict corporate proxy environments (e.g., Zscaler, BlueCoat, Fortinet):

- **No Egress Requirements**: When operating in `AI_PROVIDER=local` mode, FormForge requires **ZERO outbound internet traffic**. All LLM inference occurs locally inside the `ollama` container.
- **SSL/TLS Inspection Handling**: Internal HTTP traffic between `backend` and `formforge-ai` uses direct container-name resolution within the private network, bypassing corporate SSL interception.
- **WebSocket Compatibility**: Notifications and live status updates use standard HTTP polling or reverse-proxied WebSockets compatible with Zscaler proxy rules.

---

## 5. Cloudflare Tunnel (Optional Access Layer)

Cloudflare Tunnel (`cloudflared`) can be deployed as an optional outbound-only ingress layer:

```text
[ Remote Users ] ──(HTTPS)──> [ Cloudflare Edge ] ──(Tunnel)──> [ cloudflared daemon ] ──> [ NGINX Gateway ]
```

- **Zero Inbound Ports**: Allows external access without opening inbound firewall ports.
- **Optional**: FormForge core is 100% functional without Cloudflare Tunnel.

---

## 6. Data Flow & Communication Matrix

1. **User Request**: User -> NGINX (HTTPS 443) -> `frontend` (Static SPA) or `backend` (`/api/*`).
2. **Form / Data CRUD**: `backend` -> `mongo` (Port 27017).
3. **Optional AI Query**: `backend` -> `formforge-ai` (Port 9000) -> `ollama` (Port 11434).
4. **AI Down Fallback**: If `formforge-ai` or `ollama` is unresponsive, `backend` Circuit Breaker opens, returning a controlled fallback message immediately without blocking core API requests.
