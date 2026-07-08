import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api, API } from "@/lib/api";
import FieldRenderer from "@/components/builder/FieldRenderer";
import PdfOverlayFill from "@/components/pdfbuilder/PdfOverlayFill";
import { Document, Page } from "react-pdf";
import { authPdfFile } from "@/lib/pdfWorker";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CheckCircle2, Sparkles, Download, FileType2, Eye } from "lucide-react";

/**
 * Public PDF form runner — submitters see a plain standard form view only.
 * The original PDF is NOT shown here; that split-pane preview lives inside
 * the builder edit page.  After submission, the completed (filled) PDF is
 * available for download from the success screen.
 */
export default function PublicPdfFormPage() {
  const { slug } = useParams();
  const [tpl, setTpl] = useState(null);
  const [error, setError] = useState(null);
  const [values, setValues] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);
  const lookupCache = useRef({});

  useEffect(() => {
    api.get(`/public/pdf-forms/${slug}`)
      .then((r) => setTpl(r.data))
      .catch((e) => setError(e?.response?.data?.detail || "Form not found"));
  }, [slug]);

  // --- Lookup engine --------------------------------------------------------
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

  // --- Progress -------------------------------------------------------------
  const skipTypes = ["heading", "paragraph", "static_text", "divider", "hidden"];
  const progressFields = (tpl?.fields || []).filter((f) => !skipTypes.includes(f.type));
  const filledCount = progressFields.filter((f) => {
    const v = values[f.id];
    return v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);
  }).length;
  const progress = progressFields.length === 0 ? 0 : Math.round((filledCount / progressFields.length) * 100);

  const formFields = useMemo(
    () => (tpl?.fields || []).filter((f) => !skipTypes.includes(f.type)),
    [tpl],
  );

  const submit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
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
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Submission failed");
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
    const downloadUrl = done.download_token
      ? `${API}/public/pdf-submissions/${done.submission_id}/completed?token=${encodeURIComponent(done.download_token)}`
      : `${API}/pdf-submissions/${done.submission_id}/completed`;
    return <PdfSuccessScreen tpl={tpl} done={done} downloadUrl={downloadUrl} />;
  }

  const viewMode = tpl.settings?.public_view_mode || "form";
  const isPdfView = viewMode === "pdf";
  const containerMax = isPdfView ? "max-w-5xl" : "max-w-2xl";

  return (
    <div className="min-h-screen bg-slate-50">
      <div className={`${containerMax} mx-auto py-10 px-4`}>
        <div className="flex items-center gap-2 mb-4 text-slate-500 text-sm">
          <Sparkles className="w-4 h-4 text-blue-600" />
          <span>Powered by FormForge</span>
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 ml-1">
            <FileType2 className="w-3 h-3" /> PDF
          </span>
        </div>
        <form onSubmit={submit} className="bg-white rounded-2xl card-soft p-6 sm:p-8" data-testid="public-pdf-form">
          {tpl.settings?.show_progress !== false && progressFields.length > 0 && (
            <div className="mb-6">
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>Progress</span><span>{progress}%</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
          <h1 className="text-3xl font-heading font-bold tracking-tight text-slate-900">{tpl.title}</h1>
          {tpl.description && <p className="text-sm text-slate-500 mt-2">{tpl.description}</p>}

          {isPdfView ? (
            <div className="mt-6">
              <PdfOverlayFill
                fileUrl={`${API}/public/pdf-forms/${slug}/file`}
                fields={tpl.fields || []}
                values={values}
                onChange={(fid, v) => setValues((s) => ({ ...s, [fid]: v }))}
              />
              <p className="text-[11px] text-slate-400 mt-2">
                Click any highlighted field on the PDF to fill it in.
              </p>
            </div>
          ) : (
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
          )}
          <Button
            data-testid="public-pdf-submit"
            type="submit"
            disabled={submitting}
            className="mt-6 bg-blue-600 hover:bg-blue-700 w-full h-11 rounded-lg"
          >
            {submitting ? "Submitting…" : "Submit"}
          </Button>
          <p className="text-xs text-slate-400 mt-3 text-center">
            On submission you&apos;ll get a filled PDF with your responses.
          </p>
        </form>
      </div>
    </div>
  );
}


/* -------------------- Success screen with PDF preview -------------------- */
function PdfSuccessScreen({ tpl, done, downloadUrl }) {
  const [numPages, setNumPages] = useState(0);
  const [showPreview, setShowPreview] = useState(true);
  const file = useMemo(() => authPdfFile(downloadUrl), [downloadUrl]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto py-10 px-4">
        <div className="bg-white rounded-2xl card-soft p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 shrink-0" />
            <div className="flex-1">
              <h2 className="text-2xl font-heading font-bold tracking-tight">Submission received</h2>
              <p className="text-slate-500 mt-1 text-sm">
                {tpl.settings?.thank_you_message || "Thanks for submitting your PDF form."}
              </p>
              <p className="text-xs text-slate-400 mt-1">Submission ID: {done.submission_id}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-6">
            <a
              href={downloadUrl}
              target="_blank"
              rel="noreferrer"
              data-testid="public-pdf-download"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
            >
              <Download className="w-4 h-4" /> Download filled PDF
            </a>
            <button
              type="button"
              onClick={() => setShowPreview((s) => !s)}
              data-testid="public-pdf-toggle-preview"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 hover:border-slate-300 text-slate-700 text-sm font-medium"
            >
              <Eye className="w-4 h-4" /> {showPreview ? "Hide preview" : "Show preview"}
            </button>
          </div>

          {showPreview && (
            <div
              className="mt-6 bg-slate-100 rounded-xl overflow-auto max-h-[75vh] nice-scroll"
              data-testid="public-pdf-preview"
            >
              <div className="py-4 flex flex-col items-center gap-4">
                <Document
                  file={file}
                  onLoadSuccess={({ numPages: n }) => setNumPages(n)}
                  loading={<div className="text-slate-400 text-sm py-10">Generating preview…</div>}
                  error={<div className="text-red-500 text-sm py-10">Preview unavailable</div>}
                >
                  {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
                    <Page
                      key={n}
                      pageNumber={n}
                      width={Math.min(900, window.innerWidth - 80)}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                      className="shadow-sm ring-1 ring-slate-200"
                    />
                  ))}
                </Document>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
