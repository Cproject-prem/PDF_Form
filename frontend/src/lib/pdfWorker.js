// Configure pdfjs worker once for the entire app
import { pdfjs } from "react-pdf";

// Use a same-origin static worker (copied from pdfjs-dist) to avoid CORS / CDN issues.
pdfjs.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL || ""}/pdf.worker.min.mjs`;

/**
 * Build a `file` prop for react-pdf <Document> that includes the JWT auth
 * header so authenticated endpoints (/api/pdf-forms/{id}/file) load correctly.
 * Returns null when url is missing.
 */
export function authPdfFile(url) {
  if (!url) return null;
  const token = typeof window !== "undefined" ? localStorage.getItem("ff_token") : null;
  if (!token) return url; // public endpoints (e.g. /public/pdf-forms/{slug}/file)
  return {
    url,
    httpHeaders: { Authorization: `Bearer ${token}` },
    withCredentials: false,
  };
}

export { pdfjs };
