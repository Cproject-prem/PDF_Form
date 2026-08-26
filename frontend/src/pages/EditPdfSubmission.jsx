import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { api, API } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import FieldRenderer from "@/components/builder/FieldRenderer";
import PdfOverlayFill from "@/components/pdfbuilder/PdfOverlayFill";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CheckCircle2, Pencil, Lock, FileType2 } from "lucide-react";

/**
 * Edit an existing PDF submission.
 * Route: /p/:slug/edit/:submissionId
 *
 * - Loads the template (fields) and the existing submission values
 * - Pre-fills all fields with existing values
 * - Requires user to enter a reason for editing
 * - Calls PUT /api/pdf-submissions/{submissionId}
 * - On success shows a confirmation screen
 */
export default function EditPdfSubmissionPage() {
  const { slug, submissionId } = useParams();
  const { user: me, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const lookupCache = useRef({});

  const [tpl, setTpl] = useState(null);
  const [values, setValues] = useState({});
  const [editReason, setEditReason] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // Auth gate
  useEffect(() => {
    if (!me || !slug || !submissionId) return;

    const load = async () => {
      try {
        const [tplRes, subRes] = await Promise.all([
          api.get(`/public/pdf-forms/${slug}`),
          api.get(`/pdf-submissions/${submissionId}`),
        ]);
        setTpl(tplRes.data);
        setValues(subRes.data.values || {});
      } catch (e) {
        setError(e?.response?.data?.detail || "Could not load submission");
      }
    };
    load();
  }, [slug, submissionId, me]);

  // Lookup engine (mirrors PublicPdfForm)
  useEffect(() => {
    if (!tpl) return;
    const fields = tpl.fields || [];
    let cancelled = false;
    (async () => {
      const patch = {};
      for (const f of fields) {
        const lk = f.lookup;
        if (!lk?.enabled || !lk.trigger_field_id || !lk.return_column) continue;
        const trigger = fields.find((t) => t.id === lk.trigger_field_id);
        if (!trigger || !trigger.data_source?.source) continue;
        const triggerValue = values[trigger.id];
        if (!triggerValue) continue;
        const cacheKey = `${trigger.data_source.source}:${triggerValue}:${lk.return_column}`;
        let row = lookupCache.current[cacheKey];
        if (!row) {
          try {
            const r = await api.post("/lookup/resolve", {
              source: trigger.data_source.source,
              display: trigger.data_source.display || trigger.data_source.return,
              return: trigger.data_source.return || trigger.data_source.display,
              value: triggerValue,
              fill: [lk.return_column],
            });
            if (r.data?.matched) { row = r.data.fill || {}; lookupCache.current[cacheKey] = row; }
          } catch { row = null; }
        }
        if (cancelled) return;
        if (row) { const val = row[lk.return_column]; if (val !== undefined) patch[f.id] = val; }
      }
      if (!cancelled && Object.keys(patch).length) setValues((s) => ({ ...s, ...patch }));
    })();
    return () => { cancelled = true; };
  }, [values, tpl]);

  const skipTypes = ["heading", "paragraph", "static_text", "divider", "hidden"];
  const formFields = useMemo(() => (tpl?.fields || []).filter((f) => !skipTypes.includes(f.type)), [tpl]);

  const submit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!editReason.trim()) {
      toast.error("Please enter a reason for editing this submission");
      return;
    }
    // Client-side required validation
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
      await api.put(`/pdf-submissions/${submissionId}`, { values, edit_reason: editReason });
      setDone(true);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Edit failed. You may not have permission.");
    } finally {
      setSubmitting(false);
    }
  };

  // --- Auth gate ---
  if (authLoading) return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading…</div>;
  if (!me) {
    const next = encodeURIComponent(loc.pathname + loc.search);
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl card-soft p-10 max-w-md text-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-6 h-6 text-blue-600" />
          </div>
          <h2 className="text-2xl font-heading font-bold tracking-tight text-slate-900">Please sign in</h2>
          <p className="text-slate-500 mt-2 text-sm">You must be logged in to edit this submission.</p>
          <Button className="mt-6 bg-blue-600 hover:bg-blue-700" onClick={() => nav(`/login?next=${next}`)}>
            Sign in to continue
          </Button>
        </div>
      </div>
    );
  }
  if (error) return <div className="min-h-screen flex items-center justify-center text-slate-500">{error}</div>;
  if (!tpl) return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading…</div>;

  if (done) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl card-soft p-10 max-w-md text-center">
          <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto mb-4" />
          <h2 className="text-2xl font-heading font-bold tracking-tight text-slate-900">Submission updated</h2>
          <p className="text-slate-500 mt-2 text-sm">
            Your changes have been saved and the approval workflow has been restarted.
          </p>
          <Button className="mt-6 bg-blue-600 hover:bg-blue-700" onClick={() => nav("/submissions")}>
            Go to My Submissions
          </Button>
        </div>
      </div>
    );
  }

  const viewMode = tpl.settings?.public_view_mode || "form";
  const isPdfView = viewMode === "pdf";

  return (
    <div className="h-screen max-h-screen w-screen overflow-y-auto page-overlay-scroll nice-scroll bg-slate-50 relative scroll-smooth" id="edit-submission-scroll-container">
      <div className={`${isPdfView ? "max-w-5xl" : "max-w-2xl"} mx-auto py-10 px-4`}>
        {/* Header */}
        <div className="flex items-center gap-2 mb-4 text-slate-500 text-sm">
          <Pencil className="w-4 h-4 text-amber-600" />
          <span className="font-medium text-amber-700">Editing submission</span>
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 ml-1">
            <FileType2 className="w-3 h-3" /> PDF
          </span>
        </div>

        <form onSubmit={submit} className="bg-white rounded-2xl card-soft p-6 sm:p-8">
          <h1 className="text-3xl font-heading font-bold tracking-tight text-slate-900">{tpl.title}</h1>
          <p className="text-sm text-amber-600 mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            ✏️ You are editing a previously submitted form. All changes will be logged and the approval workflow will restart.
          </p>

          {/* Fields */}
          {isPdfView ? (
            <div className="mt-6">
              <PdfOverlayFill
                fileUrl={`${API}/public/pdf-forms/${slug}/file`}
                fields={tpl.fields || []}
                values={values}
                onChange={(fid, v) => setValues((s) => ({ ...s, [fid]: v }))}
              />
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

          {/* Edit reason — required */}
          <div className="mt-6 space-y-1">
            <label className="text-sm font-medium text-slate-700">
              Reason for edit <span className="text-red-500">*</span>
            </label>
            <Textarea
              rows={3}
              value={editReason}
              onChange={(e) => setEditReason(e.target.value)}
              placeholder="Describe what you changed and why…"
              className="resize-none"
              required
            />
            <p className="text-xs text-slate-400">This will be recorded in the audit log.</p>
          </div>

          <div className="mt-6 flex gap-3">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => nav(-1)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="bg-amber-600 hover:bg-amber-700 flex-1 h-11 rounded-lg"
            >
              {submitting ? "Saving…" : "Save changes & restart approval"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
