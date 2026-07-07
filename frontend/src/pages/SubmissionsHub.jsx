import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";
import { api, API } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table, TableHeader, TableHead, TableRow, TableBody, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Download, Eye, Search, FileText, FileType2, FileSpreadsheet, Inbox,
} from "lucide-react";
import { formatDate } from "@/lib/utils2";

/**
 * Consolidated Submissions page.
 *
 * Shows submissions for BOTH standard forms and PDF forms, grouped
 * form-wise as an accordion.  Each group has:
 *   - a summary row (title • kind badge • total count)
 *   - a table of the submissions (first 4-6 field columns + View / Actions)
 *   - "Export CSV" / "Export XLSX" buttons per group
 *   - PDF-form groups additionally get "Completed PDF" download per row
 */
export default function SubmissionsHubPage() {
  const [groups, setGroups] = useState([]);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all"); // all | form | pdf
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null); // {group, sub}

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/submissions/overview");
      setGroups(r.data || []);
    } catch (e) {
      toast.error("Failed to load submissions");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (groups || [])
      .filter((g) => kind === "all" || g.kind === kind)
      .map((g) => {
        if (!needle) return g;
        // filter both by title and by submission blob
        const titleMatch = g.title.toLowerCase().includes(needle);
        const subs = (g.submissions || []).filter((s) =>
          titleMatch ||
          s.submission_id.toLowerCase().includes(needle) ||
          JSON.stringify(s.values || {}).toLowerCase().includes(needle),
        );
        return { ...g, submissions: subs };
      })
      .filter((g) => q.trim() === "" || g.submissions.length > 0 || g.title.toLowerCase().includes(needle));
  }, [groups, q, kind]);

  const total = filtered.reduce((sum, g) => sum + (g.submissions?.length || 0), 0);
  const forms = filtered.filter((g) => g.kind === "form").length;
  const pdfs = filtered.filter((g) => g.kind === "pdf").length;

  const authedDownload = async (url, filename) => {
    const token = localStorage.getItem("ff_token");
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error();
      const blob = await r.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 4000);
    } catch { toast.error("Download failed"); }
  };

  const exportCsv = (g) => {
    if (g.kind !== "form") { toast.info("CSV export is available for standard forms"); return; }
    authedDownload(
      `${API}/forms/${g.id}/submissions/export.csv`,
      `${g.slug || g.id}-submissions.csv`,
    );
  };
  const exportXlsx = (g) => {
    const url = g.kind === "form"
      ? `${API}/forms/${g.id}/submissions/export.xlsx`
      : `${API}/pdf-forms/${g.id}/submissions/export.xlsx`;
    authedDownload(url, `${g.slug || g.id}-submissions.xlsx`);
  };
  const downloadCompleted = (g, sub) => {
    if (g.kind !== "pdf") return;
    authedDownload(
      `${API}/pdf-submissions/${sub.submission_id}/completed`,
      `${g.slug || g.id}-${sub.submission_id}.pdf`,
    );
  };

  return (
    <AppLayout>
      <div className="max-w-7xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="text-xs uppercase tracking-[0.1em] text-slate-400 font-bold mb-1">Submissions</div>
            <h1 className="text-3xl sm:text-4xl font-heading font-bold tracking-tight">
              All Submissions
            </h1>
            <p className="text-slate-500 mt-1">
              {total} submission{total === 1 ? "" : "s"} across {forms} form{forms === 1 ? "" : "s"}
              {" "}and {pdfs} PDF form{pdfs === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        <Card className="rounded-2xl border-slate-100 card-soft bg-white">
          <div className="flex flex-wrap items-center gap-3 p-4 border-b border-slate-100">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                data-testid="hub-search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search forms or submissions…"
                className="pl-10 h-9"
              />
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-slate-200 p-1 text-xs">
              {["all", "form", "pdf"].map((k) => (
                <button
                  key={k}
                  data-testid={`kind-tab-${k}`}
                  onClick={() => setKind(k)}
                  className={`px-3 py-1.5 rounded-md capitalize transition-colors ${
                    kind === k ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {k === "all" ? "All" : k === "form" ? "Standard Forms" : "PDF Forms"}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center text-slate-400">Loading submissions…</div>
          ) : filtered.length === 0 ? (
            <div className="p-16 text-center">
              <Inbox className="w-12 h-12 mx-auto text-slate-300" />
              <p className="text-sm text-slate-500 mt-3">No submissions yet.</p>
              <p className="text-xs text-slate-400 mt-1">
                Publish a form or PDF and share the link to start receiving submissions.
              </p>
            </div>
          ) : (
            <Accordion type="multiple" className="p-2 md:p-4" data-testid="hub-accordion">
              {filtered.map((g) => (
                <AccordionItem
                  key={`${g.kind}-${g.id}`}
                  value={`${g.kind}-${g.id}`}
                  className="border-b border-slate-100 last:border-0"
                  data-testid={`group-${g.kind}-${g.id}`}
                >
                  <AccordionTrigger className="hover:no-underline px-3">
                    <div className="flex-1 flex items-center gap-3 text-left">
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full ${
                          g.kind === "pdf" ? "bg-violet-100 text-violet-700" : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {g.kind === "pdf" ? <FileType2 className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                        {g.kind === "pdf" ? "PDF" : "Form"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-900 truncate">{g.title}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {(g.submissions || []).length} of {g.count} submission{g.count === 1 ? "" : "s"} · status {g.status || "draft"}
                        </div>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-4">
                    <div className="flex flex-wrap gap-2 justify-end mb-3">
                      {g.kind === "form" && (
                        <Button
                          data-testid={`export-csv-${g.id}`}
                          variant="outline"
                          size="sm"
                          onClick={() => exportCsv(g)}
                        >
                          <Download className="w-4 h-4 mr-1.5" /> CSV
                        </Button>
                      )}
                      <Button
                        data-testid={`export-xlsx-${g.id}`}
                        variant="outline"
                        size="sm"
                        onClick={() => exportXlsx(g)}
                      >
                        <FileSpreadsheet className="w-4 h-4 mr-1.5" /> Excel
                      </Button>
                      <Link to={g.kind === "pdf" ? `/pdf-forms/${g.id}/submissions` : `/forms/${g.id}/submissions`}>
                        <Button size="sm" variant="ghost" data-testid={`open-detail-${g.id}`}>
                          Open full view
                        </Button>
                      </Link>
                    </div>

                    {g.submissions.length === 0 ? (
                      <div className="text-xs text-slate-400 text-center py-6">
                        No submissions yet.
                      </div>
                    ) : (
                      <div className="border border-slate-100 rounded-xl overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              {(g.field_summary || []).slice(0, 4).map((f) => (
                                <TableHead key={f.id}>{f.label}</TableHead>
                              ))}
                              <TableHead>Status</TableHead>
                              <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {g.submissions.slice(0, 25).map((s) => (
                              <TableRow key={s.submission_id} data-testid={`hub-row-${s.submission_id}`}>
                                <TableCell className="text-xs text-slate-600">{formatDate(s.created_at)}</TableCell>
                                {(g.field_summary || []).slice(0, 4).map((f) => (
                                  <TableCell key={f.id} className="text-sm max-w-[180px] truncate">
                                    {renderVal(s.values?.[f.id])}
                                  </TableCell>
                                ))}
                                <TableCell>
                                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                                    {s.status}
                                  </span>
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setDetail({ group: g, sub: s })}
                                    data-testid={`hub-view-${s.submission_id}`}
                                  >
                                    <Eye className="w-4 h-4" />
                                  </Button>
                                  {g.kind === "pdf" && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      title="Completed PDF"
                                      onClick={() => downloadCompleted(g, s)}
                                      data-testid={`hub-pdf-${s.submission_id}`}
                                    >
                                      <Download className="w-4 h-4" />
                                    </Button>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        {g.submissions.length > 25 && (
                          <div className="text-xs text-slate-400 text-center py-2 border-t border-slate-100">
                            Showing first 25 · <Link className="text-blue-600 hover:underline"
                              to={g.kind === "pdf" ? `/pdf-forms/${g.id}/submissions` : `/forms/${g.id}/submissions`}>
                              open full view
                            </Link>
                          </div>
                        )}
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </Card>
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {detail?.group.title} · {detail?.sub.submission_id}
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl max-h-[60vh] overflow-y-auto">
              {(detail.group.field_summary || []).map((f) => (
                <div key={f.id} className="p-3 grid grid-cols-3 gap-2 text-sm">
                  <div className="text-slate-500 col-span-1">{f.label}</div>
                  <div className="col-span-2 text-slate-800 break-words">
                    {renderVal(detail.sub.values?.[f.id])}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function renderVal(v) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "string" && v.startsWith("data:image")) {
    return <img src={v} alt="" className="max-h-16 border border-slate-200 rounded" />;
  }
  if (typeof v === "object") {
    if (v.file_id) {
      return <span className="text-blue-600">{v.filename || "file"}</span>;
    }
    if (Array.isArray(v)) return v.join(", ");
    return JSON.stringify(v);
  }
  return String(v);
}
