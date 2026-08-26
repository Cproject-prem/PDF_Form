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
/**
 * Returns the backend /api base URL, purely controlled by .env
 * (REACT_APP_BACKEND_URL).
 *
 *   • Separate API subdomain:  REACT_APP_BACKEND_URL="https://api-pdfform.cmam.live"
 *   • Local direct dev:       REACT_APP_BACKEND_URL="http://localhost:8001"
 *   • Same-origin proxy:      REACT_APP_BACKEND_URL=""
 */
export function getBaseApiUrl() {
  const envUrl = (
    (typeof window !== "undefined" && window.__API_BASE__ && !window.__API_BASE__.startsWith("%"))
      ? window.__API_BASE__
      : (process.env.REACT_APP_BACKEND_URL || "")
  ).trim();

  if (envUrl) {
    return `${envUrl.replace(/\/$/, "")}/api`;
  }
  return "/api";
}

export const API = getBaseApiUrl();

export const api = axios.create({ baseURL: API });

api.interceptors.request.use((config) => {
  // Re-read __API_BASE__ on every request — always correct regardless of bundle state
  config.baseURL = getBaseApiUrl();
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

// Global safety net — swallow unhandled Axios rejections so a missing
// endpoint on an older backend doesn't nuke the app with the red React
// dev overlay.  Real code paths that need to show the error still catch
// explicitly and call toast.error(getErrorMessage(...)); this only stops
// background XHR failures (unread-count, menu, stats, etc.) from turning
// into "Uncaught runtime errors".
if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (event) => {
    const r = event?.reason;
    // Swallow Axios errors — includes Network Error (no .response),
    // HTTP errors (.response present), and timeout/CORS failures.
    const isAxios =
      r &&
      (r.isAxiosError ||
        r?.name === "AxiosError" ||
        r?.response ||
        r?.code === "ERR_NETWORK" ||
        r?.code === "ECONNABORTED" ||
        r?.message === "Network Error");
    if (isAxios) {
      event.preventDefault();
      // eslint-disable-next-line no-console
      console.warn(
        "[api] swallowed unhandled axios rejection:",
        r?.config?.method?.toUpperCase(),
        r?.config?.url,
        "code:", r?.code,
        "status:", r?.response?.status ?? "no-response"
      );
    }
  });
}


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
