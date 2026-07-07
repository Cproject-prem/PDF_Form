import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Document, Page } from "react-pdf";
import { api, API } from "@/lib/api";
import { authPdfFile } from "@/lib/pdfWorker";
import FieldRenderer from "@/components/builder/FieldRenderer";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  CheckCircle2, Sparkles, Download, FileType2, PanelRightClose, PanelRightOpen,
} from "lucide-react";

/**
 * Public PDF form page — Jotform-style split-pane layout.
 *
 *   ┌───────────────────────────┬──────────────────────────┐
 *   │  Editable form fields     │  Original PDF preview    │
 *   │  (middle / left pane)     │  (right pane, readonly)  │
 *   └───────────────────────────┴──────────────────────────┘
 *
 * After submission, the completed PDF (with the entered values baked in)
 * is available for download.  The right pane can be collapsed for a
 * cleaner fill experience on smaller screens.
 */
export default function PublicPdfFormPage() {
  const { slug } = useParams();
  const [tpl, setTpl] = useState(null);
  const [error, setError] = useState(null);
  const [values, setValues] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);
  const [showPdf, setShowPdf] = useState(true);
  const [numPages, setNumPages] = useState(0);
  const lookupCache = useRef({});

  useEffect(() => {
    api.get(`/public/pdf-forms/${slug}`)
      .then((r) => setTpl(r.data))
      .catch((e) => setError(e?.response?.data?.detail || "Form not found"));
  }, [slug]);

  const fileUrl = useMemo(
    () => (tpl ? `${API}/public/pdf-forms/${slug}/file` : null),
    [tpl, slug],
  );
  const pdfFile = useMemo(() => (fileUrl ? authPdfFile(fileUrl) : null), [fileUrl]);

  // --- Lookup engine (mirror of PublicForm) ---------------------------------
  useEffect(() => {
    if (!tpl) return;
    const fields = tpl.fields || [];
    const lookupBase = typeof window !== "undefined" && localStorage.getItem("ff_token")
      ? "/lookup" : "/public/lookup";
    let cancelled = false;
    (async () => {
      const patch = {};
      for (const f of fields) {
        const lk = f.lookup;
        if (!lk?.enabled || !lk.trigger_field_id || !lk.return_column) continue;
        const trigger = fields.find((t) => t.id === lk.trigger_field_id);
        if (!trigger || !trigger.data_source?.source) continue;
        const triggerValue = values[trigger.id];
        if (!triggerValue) {
          if (lk.not_found === "default" && values[f.id] !== (lk.default_value || "")) {
            patch[f.id] = lk.default_value || "";
          } else if (lk.not_found === "empty" && values[f.id] !== "") {
            patch[f.id] = "";
          }
          continue;
        }
        const cacheKey =
          `${trigger.data_source.source}:${trigger.data_source.display || trigger.data_source.return}:${triggerValue}:${lk.return_column}`;
        let row = lookupCache.current[cacheKey];
        if (!row) {
          try {
            const r = await api.post(`${lookupBase}/resolve`, {
              source: trigger.data_source.source,
              display: trigger.data_source.display || trigger.data_source.return,
              return: trigger.data_source.return || trigger.data_source.display,
              value: triggerValue,
              fill: [lk.return_column],
            });
            if (r.data?.matched) {
              row = r.data.fill || {};
              lookupCache.current[cacheKey] = row;
            } else {
              row = null;
            }
          } catch { row = null; }
        }
        if (cancelled) return;
        const resolved = row ? (row[lk.return_column] ?? "") : null;
        let next;
        if (resolved !== null && resolved !== undefined && resolved !== "") {
          next = resolved;
        } else {
          switch (lk.not_found) {
            case "keep":    next = values[f.id]; break;
            case "default": next = lk.default_value || ""; break;
            case "error":   next = `⚠ ${(lk.error_message || "No match found")}`; break;
            default:        next = "";
          }
        }
        if (values[f.id] !== next) patch[f.id] = next;
      }
      if (!cancelled && Object.keys(patch).length) {
        setValues((s) => ({ ...s, ...patch }));
      }
    })();
    return () => { cancelled = true; };
  }, [values, tpl]);

  // --- Formula recompute ----------------------------------------------------
  useEffect(() => {
    if (!tpl) return;
    const fields = (tpl.fields || []).filter((f) => f.formula?.enabled && f.formula?.expression);
    if (fields.length === 0) return;
    let cancelled = false;
    const debounce = setTimeout(async () => {
      const patch = {};
      for (const f of fields) {
        try {
          const r = await api.post("/formula/evaluate", {
            expression: f.formula.expression,
            values: { ...values, ...patch },
            auto_load_tables: /\b(SiteMaster|Sites)\b/.test(f.formula.expression) ? ["SiteMaster"] : [],
          });
          if (cancelled) return;
          if (r.data?.ok && values[f.id] !== r.data.value) patch[f.id] = r.data.value;
        } catch { /* ignore */ }
      }
      if (!cancelled && Object.keys(patch).length) setValues((s) => ({ ...s, ...patch }));
    }, 150);
    return () => { cancelled = true; clearTimeout(debounce); };
  }, [values, tpl]);

  // --- Progress + submit ----------------------------------------------------
  const skipTypes = ["heading", "paragraph", "static_text", "divider", "hidden"];
  const progressFields = (tpl?.fields || []).filter((f) => !skipTypes.includes(f.type));
  const filledCount = progressFields.filter((f) => {
    const v = values[f.id];
    return v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);
  }).length;
  const progress = progressFields.length === 0 ? 0 : Math.round((filledCount / progressFields.length) * 100);

  const submit = async () => {
    for (const f of tpl.fields || []) {
      if (f.required && !skipTypes.includes(f.type)) {
        const v = values[f.id];
        if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) {
          toast.error(`"${f.label || f.name}" is required`);
          return;
        }
      }
    }
    setSubmitting(true);
    try {
      const r = await api.post(`/public/pdf-forms/${slug}/submit`, { values });
      setDone(r.data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (error) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">{error}</div>;
  }
  if (!tpl) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading…</div>;
  }

  if (done) {
    const downloadUrl = `${API}/pdf-submissions/${done.submission_id}/completed`;
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl card-soft p-10 max-w-md text-center">
          <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500 mb-3" />
          <h2 className="text-2xl font-heading font-bold tracking-tight">Submission received</h2>
          <p className="text-slate-500 mt-2">
            {tpl.settings?.thank_you_message || "Thanks for submitting your PDF form."}
          </p>
          <p className="text-xs text-slate-400 mt-1">ID: {done.submission_id}</p>
          <a
            href={downloadUrl}
            target="_blank"
            rel="noreferrer"
            data-testid="public-pdf-download"
            className="inline-flex items-center gap-2 mt-6 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
          >
            <Download className="w-4 h-4" /> Download completed PDF
          </a>
        </div>
      </div>
    );
  }

  // Fields visible in the form pane (skip PDF-only static/hidden types)
  const formFields = (tpl.fields || []).filter((f) => !skipTypes.includes(f.type));

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Header ---------------------------------------------------------- */}
      <header className="h-14 shrink-0 border-b border-slate-200 bg-white flex items-center justify-between px-4">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-medium text-slate-700 truncate">{tpl.title}</span>
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">
            <FileType2 className="w-3 h-3" /> PDF
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 text-xs text-slate-500">
            <span>{progress}%</span>
            <div className="w-32 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <Button
            data-testid="toggle-pdf-preview"
            onClick={() => setShowPdf((v) => !v)}
            variant="ghost"
            size="sm"
            className="text-slate-600"
          >
            {showPdf ? <PanelRightClose className="w-4 h-4 mr-1.5" /> : <PanelRightOpen className="w-4 h-4 mr-1.5" />}
            {showPdf ? "Hide PDF" : "Show PDF"}
          </Button>
          <Button
            data-testid="public-pdf-submit"
            onClick={submit}
            disabled={submitting}
            className="bg-blue-600 hover:bg-blue-700 h-9"
          >
            {submitting ? "Submitting…" : "Submit"}
          </Button>
        </div>
      </header>

      {/* Split-pane body ------------------------------------------------- */}
      <div className="flex-1 flex overflow-hidden" data-testid="pdf-split-pane">
        {/* Middle: form-view fields */}
        <section
          className={`overflow-y-auto nice-scroll ${showPdf ? "flex-1 lg:max-w-[62%]" : "flex-1"}`}
          data-testid="pdf-form-view"
        >
          <div className="max-w-2xl mx-auto py-8 px-4 md:px-8">
            <div className="bg-white rounded-2xl card-soft p-6 md:p-8">
              <h1 className="text-2xl md:text-3xl font-heading font-bold tracking-tight text-slate-900">
                {tpl.title}
              </h1>
              {tpl.description && (
                <p className="text-sm text-slate-500 mt-2">{tpl.description}</p>
              )}
              <div className="mt-6 space-y-5">
                {formFields.map((f) => (
                  <FieldRenderer
                    key={f.id}
                    field={f}
                    value={values[f.id]}
                    onChange={(v) => setValues((s) => ({ ...s, [f.id]: v }))}
                    onLookupFill={(patch) => setValues((s) => ({ ...s, ...patch }))}
                    mode="fill"
                    isPublic
                  />
                ))}
              </div>
              <Button
                onClick={submit}
                disabled={submitting}
                data-testid="public-pdf-submit-bottom"
                className="mt-8 bg-blue-600 hover:bg-blue-700 w-full h-11 rounded-lg"
              >
                {submitting ? "Submitting…" : "Submit"}
              </Button>
              <p className="text-xs text-slate-400 mt-3 text-center">
                On submission, a completed PDF will be generated with your responses.
              </p>
            </div>
          </div>
        </section>

        {/* Right: PDF preview */}
        {showPdf && (
          <aside
            className="hidden lg:flex w-[38%] shrink-0 border-l border-slate-200 bg-slate-100 overflow-y-auto nice-scroll flex-col"
            data-testid="pdf-preview-pane"
          >
            <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-4 py-2 flex items-center justify-between text-xs text-slate-500">
              <div className="flex items-center gap-2">
                <FileType2 className="w-3.5 h-3.5 text-violet-500" />
                <span className="font-medium">Original PDF preview</span>
                {numPages > 0 && <span className="text-slate-400">· {numPages} page{numPages > 1 ? "s" : ""}</span>}
              </div>
              <a
                href={fileUrl}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:underline flex items-center gap-1"
                data-testid="pdf-download-original-btn"
              >
                <Download className="w-3 h-3" /> Original
              </a>
            </div>
            <div className="p-4 flex flex-col items-center gap-4">
              {pdfFile && (
                <Document
                  file={pdfFile}
                  onLoadSuccess={({ numPages: n }) => setNumPages(n)}
                  loading={<div className="text-slate-400 text-sm py-10">Loading PDF…</div>}
                  error={<div className="text-red-400 text-sm py-10">Could not load PDF</div>}
                >
                  {Array.from({ length: numPages }, (_, i) => i + 1).map((p) => (
                    <Page
                      key={p}
                      pageNumber={p}
                      width={480}
                      className="mb-4 shadow-md bg-white"
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                    />
                  ))}
                </Document>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
