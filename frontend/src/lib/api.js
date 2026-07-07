import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
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
