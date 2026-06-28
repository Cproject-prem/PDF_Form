import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api, API } from "@/lib/api";
import PdfFiller from "@/components/pdfbuilder/PdfFiller";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CheckCircle2, Sparkles, Download, FileType2 } from "lucide-react";

/**
 * Public page where end users open the PDF form by slug, fill the fields and submit.
 * Shows the original PDF with interactive controls overlaid in place of the blue boxes.
 */
export default function PublicPdfFormPage() {
  const { slug } = useParams();
  const [tpl, setTpl] = useState(null);
  const [error, setError] = useState(null);
  const [values, setValues] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null); // PDFSubmission

  useEffect(() => {
    api
      .get(`/public/pdf-forms/${slug}`)
      .then((r) => setTpl(r.data))
      .catch((e) => setError(e?.response?.data?.detail || "Form not found"));
  }, [slug]);

  const fileUrl = useMemo(
    () => (tpl ? `${API}/public/pdf-forms/${slug}/file` : null),
    [tpl, slug],
  );

  // progress
  const visibleProgressFields = (tpl?.fields || []).filter(
    (f) => !["heading", "paragraph", "static_text", "divider", "hidden"].includes(f.type),
  );
  const filledCount = visibleProgressFields.filter((f) => {
    const v = values[f.id];
    return v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);
  }).length;
  const progress =
    visibleProgressFields.length === 0
      ? 0
      : Math.round((filledCount / visibleProgressFields.length) * 100);

  const submit = async () => {
    // simple required-field check before posting
    for (const f of tpl.fields || []) {
      if (f.required && !["heading", "paragraph", "static_text", "divider", "hidden"].includes(f.type)) {
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

  if (error)
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        {error}
      </div>
    );
  if (!tpl)
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400">
        Loading…
      </div>
    );

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

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <header className="h-14 shrink-0 border-b border-slate-200 bg-white flex items-center justify-between px-4">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-medium text-slate-700 truncate">{tpl.title}</span>
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">
            <FileType2 className="w-3 h-3" /> PDF
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500">
            <span>{progress}%</span>
            <div className="w-32 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
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

      <div className="flex-1 overflow-hidden" data-testid="public-pdf-filler">
        <PdfFiller
          fileUrl={fileUrl}
          fields={tpl.fields || []}
          values={values}
          onChange={setValues}
        />
      </div>
    </div>
  );
}
