import React, { useEffect, useRef, useState, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { api, API } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import FieldRenderer from "@/components/builder/FieldRenderer";
import { Document, Page } from "react-pdf";
import { authPdfFile } from "@/lib/pdfWorker";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CheckCircle2, Sparkles, Download, Eye, Lock } from "lucide-react";

export default function PublicFormPage() {
  const { slug } = useParams();
  const { user: me, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const [values, setValues] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);
  const lookupCache = useRef({}); // memo of `${source}:${display}:${value}` -> row

  // Only fetch the form when the visitor is authenticated; otherwise the
  // gate below renders a login CTA. This avoids a 401 flash on protected
  // preview pages.
  useEffect(() => {
    if (!me) return;
    api.get(`/public/forms/${slug}`).then((r) => setForm(r.data))
      .catch((e) => setError(e?.response?.data?.detail || "Form not found"));
  }, [slug, me]);

  // Whenever any trigger field's value changes, recompute every dependent
  // per-field lookup and patch the values dict.
  useEffect(() => {
    if (!form) return;
    const fields = form.fields || [];
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
        const cacheKey = `${trigger.data_source.source}:${trigger.data_source.display || trigger.data_source.return}:${triggerValue}:${lk.return_column}`;
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
              // Server returns `{ value, fill: { col: val }, matched }`. We
              // wrap that into a row dict the rest of the code can index by
              // column name (including the requested return_column).
              row = r.data.fill || {};
              lookupCache.current[cacheKey] = row;
            } else {
              row = null;
            }
          } catch (_) {
            row = null;
          }
        }
        if (cancelled) return;
        const resolved = row ? (row[lk.return_column] ?? "") : null;
        let next;
        if (resolved !== null && resolved !== undefined && resolved !== "") {
          next = resolved;
        } else {
          switch (lk.not_found) {
            case "keep":     next = values[f.id]; break;
            case "default":  next = lk.default_value || ""; break;
            case "error":    next = `⚠ ${(lk.error_message || "No match found")}`; break;
            default:         next = "";
          }
        }
        if (values[f.id] !== next) patch[f.id] = next;
      }
      if (!cancelled && Object.keys(patch).length) {
        setValues((s) => ({ ...s, ...patch }));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, form]);

  // Formula recompute — runs after lookups settle. Calls /api/formula/evaluate
  // for every field with formula.enabled and writes the computed value back
  // into `values`. Supports SiteMaster table auto-load.
  useEffect(() => {
    if (!form) return;
    const fields = (form.fields || []).filter((f) => f.formula?.enabled && f.formula?.expression);
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
        } catch (_) { /* swallow */ }
      }
      if (!cancelled && Object.keys(patch).length) setValues((s) => ({ ...s, ...patch }));
    }, 150);
    return () => { cancelled = true; clearTimeout(debounce); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, form]);

  const visibleProgressFields = (form?.fields || []).filter((f) => !["heading", "paragraph", "divider"].includes(f.type));
  const filledCount = visibleProgressFields.filter((f) => {
    const v = values[f.id];
    return v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);
  }).length;
  const progress = visibleProgressFields.length === 0 ? 0 : Math.round((filledCount / visibleProgressFields.length) * 100);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const r = await api.post(`/public/forms/${slug}/submit`, { values });
      if (form?.settings?.redirect_url) {
        window.location.href = form.settings.redirect_url;
        return;
      }
      setDone(r.data);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Submission failed");
    } finally { setSubmitting(false); }
  };

  // Auth gate — this app requires login for every form submission. When the
  // visitor is not authenticated we render a login CTA that carries the
  // current URL as `?next=` so the user is bounced back after signing in.
  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading…</div>;
  }
  if (!me) {
    const next = encodeURIComponent(loc.pathname + loc.search);
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl card-soft p-10 max-w-md text-center"
             data-testid="public-form-login-gate">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-6 h-6 text-blue-600" />
          </div>
          <h2 className="text-2xl font-heading font-bold tracking-tight text-slate-900">
            Please sign in to continue
          </h2>
          <p className="text-slate-500 mt-2 text-sm">
            You must be logged in to submit this form. We'll bring you right back here after sign-in.
          </p>
          <Button
            className="mt-6 bg-blue-600 hover:bg-blue-700"
            onClick={() => nav(`/login?next=${next}`)}
            data-testid="public-form-signin-btn"
          >
            Sign in to continue
          </Button>
        </div>
      </div>
    );
  }

  if (error) return <div className="min-h-screen flex items-center justify-center text-slate-500">{error}</div>;
  if (!form) return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading…</div>;
  if (done) {
    const downloadUrl = done.download_token && done.submission_id
      ? `${API}/public/submissions/${done.submission_id}/filled.pdf?token=${encodeURIComponent(done.download_token)}`
      : null;
    if (downloadUrl) {
      return <FormSuccessScreen form={form} done={done} downloadUrl={downloadUrl} />;
    }
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl card-soft p-10 max-w-md text-center">
          <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500 mb-3" />
          <h2 className="text-2xl font-heading font-bold tracking-tight">Submission received</h2>
          <p className="text-slate-500 mt-2">{form.settings?.thank_you_message || "Thanks for your submission!"}</p>
          {done.submission_id && (
            <p className="text-xs text-slate-400 mt-1">ID: {done.submission_id}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-2xl mx-auto py-10 px-4">
        <div className="flex items-center gap-2 mb-4 text-slate-500 text-sm">
          <Sparkles className="w-4 h-4 text-blue-600" />
          <span>Powered by FormForge</span>
        </div>
        <form onSubmit={submit} className="bg-white rounded-2xl card-soft p-8" data-testid="public-form">
          {form.settings?.show_progress && (
            <div className="mb-6">
              <div className="flex justify-between text-xs text-slate-500 mb-1"><span>Progress</span><span>{progress}%</span></div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} /></div>
            </div>
          )}
          <h1 className="text-3xl font-heading font-bold tracking-tight text-slate-900">{form.title}</h1>
          {form.description && <p className="text-sm text-slate-500 mt-2">{form.description}</p>}
          <div className="mt-6 space-y-5">
            {(form.fields || []).map((f) => (
              <FieldRenderer key={f.id} field={f}
                value={values[f.id]}
                onChange={(v) => setValues((s) => ({ ...s, [f.id]: v }))}
                onLookupFill={(patch) => setValues((s) => ({ ...s, ...patch }))}
                mode="fill" isPublic />
            ))}
          </div>
          <Button data-testid="submit-public-form" type="submit" disabled={submitting} className="mt-6 bg-blue-600 hover:bg-blue-700 w-full h-11 rounded-lg">
            {submitting ? "Submitting…" : "Submit"}
          </Button>
        </form>
      </div>
    </div>
  );
}

/* -------------------- Success screen with PDF preview -------------------- */
function FormSuccessScreen({ form, done, downloadUrl }) {
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
                {form.settings?.thank_you_message || "Thanks for your submission!"}
              </p>
              <p className="text-xs text-slate-400 mt-1">Submission ID: {done.submission_id}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-6">
            <a
              href={downloadUrl}
              target="_blank"
              rel="noreferrer"
              data-testid="public-form-download"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
            >
              <Download className="w-4 h-4" /> Download filled PDF
            </a>
            <button
              type="button"
              onClick={() => setShowPreview((s) => !s)}
              data-testid="public-form-toggle-preview"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 hover:border-slate-300 text-slate-700 text-sm font-medium"
            >
              <Eye className="w-4 h-4" /> {showPreview ? "Hide preview" : "Show preview"}
            </button>
          </div>

          {showPreview && (
            <div
              className="mt-6 bg-slate-100 rounded-xl overflow-auto max-h-[75vh] nice-scroll"
              data-testid="public-form-preview"
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

