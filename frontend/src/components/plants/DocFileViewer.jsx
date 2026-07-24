import React, { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { X, Download, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

/**
 * Inline document viewer used in the Plant → Documents card.
 *
 * Supported natively (no server round-trip beyond the file bytes):
 *   • PDF                    → <iframe src=blob:>
 *   • Images (png/jpg/…)     → <img src=blob:>
 *   • Word .docx             → mammoth.js → HTML render
 *   • Plain text / md / json → <pre>
 *
 * Anything else falls back to a "Download to open" message.
 *
 * Props:
 *   open       (bool)         whether the modal is visible
 *   onClose    (() => void)   called when user closes the dialog
 *   fetchUrl   (string)       axios-relative URL that returns the file bytes
 *   fileName   (string)       display name (also used to detect extension)
 */
const IMAGE_EXT = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"];
const TEXT_EXT  = ["txt", "md", "log", "json", "csv", "xml", "yaml", "yml"];

export default function DocFileViewer({ open, onClose, fetchUrl, fileName }) {
  const [state, setState] = useState({ loading: true, kind: null, payload: null, error: null });

  useEffect(() => {
    if (!open || !fetchUrl) return;
    let cancelled = false;
    let createdUrls = [];
    (async () => {
      setState({ loading: true, kind: null, payload: null, error: null });
      const ext = (fileName || "").split(".").pop().toLowerCase();
      try {
        const isText = TEXT_EXT.includes(ext);
        const r = await api.get(fetchUrl, { responseType: isText ? "text" : "blob" });
        if (cancelled) return;
        if (isText) {
          setState({ loading: false, kind: "text", payload: r.data, error: null });
          return;
        }
        if (ext === "pdf") {
          const url = URL.createObjectURL(r.data);
          createdUrls.push(url);
          setState({ loading: false, kind: "pdf", payload: url, error: null });
          return;
        }
        if (IMAGE_EXT.includes(ext)) {
          const url = URL.createObjectURL(r.data);
          createdUrls.push(url);
          setState({ loading: false, kind: "image", payload: url, error: null });
          return;
        }
        if (ext === "docx") {
          const mammoth = (await import("mammoth/mammoth.browser")).default;
          const arrayBuf = await r.data.arrayBuffer();
          const { value } = await mammoth.convertToHtml({ arrayBuffer: arrayBuf });
          if (!cancelled) setState({ loading: false, kind: "docx", payload: value, error: null });
          return;
        }
        // Unknown — offer download
        setState({ loading: false, kind: "unsupported", payload: null, error: null });
      } catch (e) {
        if (!cancelled) {
          setState({
            loading: false, kind: null, payload: null,
            error: e?.response?.data?.detail || e?.message || "Failed to load file",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
      createdUrls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [open, fetchUrl, fileName]);

  const doDownload = async () => {
    try {
      const r = await api.get(fetchUrl, { responseType: "blob" });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url; a.download = fileName;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch { /* silently ignore */ }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-w-5xl w-[95vw] h-[90vh] p-0 gap-0 overflow-hidden flex flex-col bg-white"
        data-testid="doc-viewer-dialog"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 shrink-0">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-800 truncate" title={fileName}>
              {fileName}
            </div>
            <div className="text-[11px] text-slate-400">Preview</div>
          </div>
          <button
            onClick={doDownload}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg
                       border border-slate-200 text-slate-700 hover:bg-slate-50"
            data-testid="doc-viewer-download"
            title="Download"
          >
            <Download className="w-3.5 h-3.5" /> Download
          </button>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-500 hover:bg-slate-100 flex items-center justify-center"
            data-testid="doc-viewer-close"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto bg-slate-50">
          {state.loading && (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-3">
              <Loader2 className="w-6 h-6 animate-spin" />
              <div className="text-sm">Loading preview…</div>
            </div>
          )}
          {!state.loading && state.error && (
            <div className="h-full flex flex-col items-center justify-center text-red-500 gap-2 p-6 text-center">
              <div className="font-semibold">Preview failed</div>
              <div className="text-sm text-slate-500">{state.error}</div>
            </div>
          )}
          {!state.loading && state.kind === "pdf" && (
            <iframe
              src={state.payload}
              title={fileName}
              className="w-full h-full bg-white"
              data-testid="doc-viewer-pdf"
            />
          )}
          {!state.loading && state.kind === "image" && (
            <div className="w-full h-full flex items-center justify-center p-4">
              <img
                src={state.payload}
                alt={fileName}
                className="max-w-full max-h-full object-contain shadow rounded-lg bg-white"
                data-testid="doc-viewer-image"
              />
            </div>
          )}
          {!state.loading && state.kind === "docx" && (
            <div className="max-w-4xl mx-auto bg-white shadow-sm my-6 rounded-lg p-8 prose prose-slate max-w-none"
                 data-testid="doc-viewer-docx"
                 dangerouslySetInnerHTML={{ __html: state.payload }} />
          )}
          {!state.loading && state.kind === "text" && (
            <pre className="max-w-5xl mx-auto bg-white my-6 rounded-lg p-6 text-xs text-slate-800 whitespace-pre-wrap break-words shadow-sm"
                 data-testid="doc-viewer-text">
              {state.payload}
            </pre>
          )}
          {!state.loading && state.kind === "unsupported" && (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-3 p-6 text-center">
              <div className="text-sm">
                Inline preview isn't available for this file type.
                <br />
                Please download the file to open it in the correct app.
              </div>
              <button
                onClick={doDownload}
                className="inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Download className="w-4 h-4" /> Download {fileName}
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
