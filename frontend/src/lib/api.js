import axios from "axios";

/**
 * Resolve the backend base URL.
 *
 * The app is served in three very different environments and each expects
 * `REACT_APP_BACKEND_URL` to be treated slightly differently:
 *
 *   • Emergent preview   →  a full public URL is baked at build-time; use it as-is
 *   • Local docker/dev   →  `http://localhost:8001` set in .env
 *   • LAN access (phone, ↵    when a colleague opens the app from a different
 *     other PC on Wi-Fi) ↵    device, `localhost` no longer points to the
 *                             machine running the API — so we swap the host
 *                             for whatever host the browser is currently
 *                             using (window.location.hostname), keeping the
 *                             port from the .env value (or 8001 as fallback).
 */
function resolveBackendUrl() {
  const envUrl = process.env.REACT_APP_BACKEND_URL || "";
  if (typeof window === "undefined") return envUrl;
  try {
    const u = new URL(envUrl);
    const currentHost = window.location.hostname;
    const isLocalEnv = ["localhost", "127.0.0.1", "0.0.0.0"].includes(u.hostname);
    const isLocalBrowser = ["localhost", "127.0.0.1"].includes(currentHost);
    if (isLocalEnv && !isLocalBrowser) {
      // Browser opened via LAN IP (e.g. http://192.168.1.24:3000) but the
      // env still says localhost — rewrite the host so API calls hit the
      // same machine over the LAN.
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
