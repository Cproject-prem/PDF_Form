import axios from "axios";

/**
 * Resolve the backend base URL for the current environment.
 *
 *   • Same-origin production (recommended)
 *       Set `REACT_APP_BACKEND_URL=""` (empty) — API calls go to
 *       `${window.location.origin}/api`, so nginx can proxy `/api` to
 *       FastAPI and the browser stays on one domain (no CORS, no mixed
 *       content).  Works with any DNS like https://formforge.mycompany.com.
 *
 *   • Separate API subdomain
 *       Set `REACT_APP_BACKEND_URL=https://api.mycompany.com` — used as-is.
 *
 *   • Local dev
 *       Set `REACT_APP_BACKEND_URL=http://localhost:8001`.
 *
 *   • LAN dev
 *       Leave the env at `http://localhost:8001` — when the browser opens
 *       the app from another device by IP, the host is swapped to
 *       `window.location.hostname` (keeping port 8001) automatically.
 */
function resolveBackendUrl() {
  const envUrl = (process.env.REACT_APP_BACKEND_URL || "").trim();
  if (typeof window === "undefined") return envUrl;
  // Same-origin production — no env value → API on the current origin.
  if (!envUrl) return window.location.origin;
  try {
    const u = new URL(envUrl);
    const currentHost = window.location.hostname;
    const isLocalEnv = ["localhost", "127.0.0.1", "0.0.0.0"].includes(u.hostname);
    const isLocalBrowser = ["localhost", "127.0.0.1"].includes(currentHost);
    if (isLocalEnv && !isLocalBrowser) {
      // LAN case — the env still says localhost but the browser is on
      // 192.168.x.x, so swap the hostname while keeping the port.
      u.hostname = currentHost;
      return u.toString().replace(/\/$/, "");
    }
    return envUrl.replace(/\/$/, "");
  } catch {
    return envUrl.replace(/\/$/, "");
  }
}

const BACKEND_URL = resolveBackendUrl();
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("ff_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401 && !window.location.pathname.startsWith("/login") &&
        !window.location.pathname.startsWith("/auth")) {
      localStorage.removeItem("ff_token");
      localStorage.removeItem("ff_user");
    }
    return Promise.reject(err);
  }
);

/**
 * Normalise any axios/FastAPI error into a plain string suitable for
 * `toast.error(...)` or direct React rendering.  Handles Pydantic v2
 * validation errors which arrive as an array of objects — passing those
 * to Sonner triggers "Objects are not valid as a React child".
 */
export function getErrorMessage(err, fallback = "Something went wrong") {
  if (!err) return fallback;
  // axios error → err.response.data
  const data = err?.response?.data ?? err;
  if (data == null) return fallback;
  if (typeof data === "string") return data;
  const detail = data?.detail ?? data?.message ?? data;
  if (detail == null) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        if (!d) return "";
        if (typeof d === "string") return d;
        const loc = Array.isArray(d.loc) ? d.loc.filter((p) => p !== "body").join(".") : "";
        const msg = d.msg || d.message || "invalid";
        return loc ? `${loc}: ${msg}` : msg;
      })
      .filter(Boolean)
      .join(" · ") || fallback;
  }
  if (typeof detail === "object") {
    return detail.msg || detail.message || JSON.stringify(detail).slice(0, 240);
  }
  return String(detail);
}
