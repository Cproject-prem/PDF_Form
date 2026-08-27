import { useEffect, useState } from "react";
import { pdfjs } from "react-pdf";
import { api } from "./api";

// Configure pdfjs worker
try {
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version || "4.10.38"}/build/pdf.worker.min.mjs`;
} catch (e) {
  pdfjs.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL || ""}/pdf.worker.min.mjs`;
}

const blobCache = new Map();

export function usePdfFile(url) {
  const [fileData, setFileData] = useState(() => blobCache.get(url) || null);
  const [loading, setLoading] = useState(!fileData && !!url);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!url) {
      setFileData(null);
      setLoading(false);
      return;
    }
    if (blobCache.has(url)) {
      setFileData(blobCache.get(url));
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    api.get(url, { responseType: "blob" })
      .then((res) => {
        if (!isMounted) return;
        const blobUrl = URL.createObjectURL(res.data);
        blobCache.set(url, blobUrl);
        setFileData(blobUrl);
        setLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error("Failed to load PDF binary:", err);
        setError(err);
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [url]);

  return { file: fileData, loading, error };
}

/**
 * Build a `file` prop for react-pdf <Document> that includes the JWT auth
 * header so authenticated endpoints (/api/pdf-forms/{id}/file) load correctly.
 * Returns null when url is missing.
 */
export function authPdfFile(url) {
  if (!url) return null;
  const token = typeof window !== "undefined" ? localStorage.getItem("ff_token") : null;
  if (!token) return url;
  return {
    url,
    httpHeaders: { Authorization: `Bearer ${token}` },
    withCredentials: false,
  };
}

export { pdfjs };
