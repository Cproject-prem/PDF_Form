import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/layout/AppLayout";
import { api, API } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableHeader, TableHead, TableRow, TableBody, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ArrowLeft, Download, Eye, Search, Trash2, FileText, Printer, Mail, FileType2, CalendarIcon, Pencil
} from "lucide-react";
import { formatDate } from "@/lib/utils2";
import ApprovalTracker from "@/components/ApprovalTracker";

export default function PdfSubmissionsPage() {
  const { id } = useParams();
  const { user: me } = useAuth();
  const nav = useNavigate();
  const [tpl, setTpl] = useState(null);
  const [subs, setSubs] = useState([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      let subUrl = `/pdf-forms/${id}/submissions`;
      const params = new URLSearchParams();
      if (startDate) params.append("start_date", startDate);
      if (endDate) params.append("end_date", endDate);
      if (params.toString()) subUrl += `?${params.toString()}`;

      const [t, s] = await Promise.all([
        api.get(`/pdf-forms/${id}`),
        api.get(subUrl),
      ]);
      setTpl(t.data);
      setSubs(s.data);
    } catch (e) {
      toast.error("Failed to load submissions");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id, startDate, endDate]);

  const filtered = subs.filter((s) => {
    if (!q) return true;
    const blob = JSON.stringify(s.values || {}).toLowerCase();
    return blob.includes(q.toLowerCase()) || s.submission_id.includes(q);
  });

  const delSub = async (sub) => {
    if (!confirm("Delete this submission and its completed PDF?")) return;
    await api.delete(`/pdf-submissions/${sub.submission_id}`);
    toast.success("Deleted");
    load();
  };

  const authedDownload = async (url, filename) => {
    const token = localStorage.getItem("ff_token");
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error("Download failed");
      const blob = await r.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 5000);
    } catch (e) {
      toast.error("Download failed");
    }
  };

  const downloadCompleted = (sub) =>
    authedDownload(
      `${API}/pdf-submissions/${sub.submission_id}/completed`,
      `${(tpl?.title || "form").replace(/\W+/g, "_")}-${sub.submission_id}.pdf`,
    );

  const viewCompletedPdf = async (sub) => {
    const token = localStorage.getItem("ff_token");
    try {
      const r = await fetch(`${API}/pdf-submissions/${sub.submission_id}/completed`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error("Failed to load PDF");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch {
      toast.error("Failed to view updated PDF");
    }
  };

  const downloadOriginal = () =>
    authedDownload(
      `${API}/pdf-forms/${tpl.template_id}/file`,
      tpl?.original_filename || "original.pdf",
    );

  const exportXlsx = () => {
    let url = `${API}/pdf-forms/${id}/submissions/export.xlsx`;
    const params = new URLSearchParams();
    if (startDate) params.append("start_date", startDate);
    if (endDate) params.append("end_date", endDate);
    if (params.toString()) url += `?${params.toString()}`;
    authedDownload(url, `${(tpl?.slug || id)}-submissions.xlsx`);
  };

  const printPdf = async (sub) => {
    const token = localStorage.getItem("ff_token");
    const r = await fetch(`${API}/pdf-submissions/${sub.submission_id}/completed`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const w = window.open(url);
    if (w) w.onload = () => w.print();
  };

  const mailto = (sub) => {
    const subject = encodeURIComponent(`${tpl?.title || "PDF Form"} — submission ${sub.submission_id}`);
    const body = encodeURIComponent(
      `Submission ID: ${sub.submission_id}\nSubmitted: ${formatDate(sub.created_at)}\n\n` +
      `Download the completed PDF: ${window.location.origin}${API}/pdf-submissions/${sub.submission_id}/completed`,
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  return (
    <AppLayout>
      <div className="max-w-7xl">
        <div className="flex items-center gap-3 mb-2">
          <Link
            to="/forms"
            data-testid="pdf-subs-back"
            className="p-2 rounded-md hover:bg-slate-100 text-slate-600"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full bg-violet-100 text-violet-700">
            <FileType2 className="w-3 h-3" /> PDF
          </span>
          <span className="text-xs uppercase tracking-[0.1em] text-slate-400 font-bold">Submissions</span>
        </div>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl sm:text-4xl font-heading font-bold tracking-tight text-slate-900">
              {tpl?.title || "PDF Form"}
            </h1>
            <p className="text-slate-500 mt-1">{subs.length} total submissions</p>
          </div>
          {tpl && (
            <div className="flex gap-2">
              <Button
                data-testid="pdf-export-xlsx"
                onClick={exportXlsx}
                variant="outline"
              >
                <Download className="w-4 h-4 mr-1.5" /> Export Excel
              </Button>
              <Button
                data-testid="pdf-download-original"
                onClick={downloadOriginal}
                variant="outline"
              >
                <Download className="w-4 h-4 mr-1.5" /> Download Original PDF
              </Button>
            </div>
          )}
        </div>

        <Card className="rounded-2xl border-slate-100 card-soft bg-white">
          <div className="flex items-center gap-3 p-4 border-b border-slate-100">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                data-testid="pdf-sub-search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search submissions…"
                className="pl-10 h-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-9 w-36 text-sm"
                title="Start Date"
              />
              <span className="text-slate-400 text-sm">to</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-9 w-36 text-sm"
                title="End Date"
              />
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-slate-400">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="w-10 h-10 mx-auto text-slate-300" />
              <p className="text-sm text-slate-500 mt-2">No submissions yet.</p>
              {tpl?.status !== "published" && (
                <p className="text-xs text-slate-400 mt-1">Publish your PDF form to start collecting submissions.</p>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Submission ID</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Submitted By</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => (
                  <TableRow key={s.submission_id} data-testid={`pdf-sub-row-${s.submission_id}`}>
                    <TableCell className="font-mono text-xs text-slate-600">{s.submission_id}</TableCell>
                    <TableCell className="text-sm text-slate-600">{formatDate(s.created_at)}</TableCell>
                    <TableCell className="text-sm">
                      {s.submitted_by_name || s.submitted_by_email || s.submitted_by || "Anonymous"}
                    </TableCell>
                    <TableCell className="text-sm text-slate-500">v{s.template_version}</TableCell>
                    <TableCell>
                      <span className="text-xs font-medium px-2 py-1 rounded-full bg-emerald-50 text-emerald-700">
                        {s.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        title="View"
                        onClick={() => setSelected(s)}
                        data-testid={`pdf-view-${s.submission_id}`}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      {/* Edit button — admin/super_admin always; vendor only after rejection */
                      (() => {
                        const role = me?.role || "";
                        const isAdmin = role === "super_admin" || role === "admin";
                        const subStatus = (s.status || "").toLowerCase();
                        const approvalStatus = (s.approval_status || "").toLowerCase();
                        const isRejected = subStatus === "rejected" || approvalStatus === "rejected";
                        const isVendor = role === "vendor_admin" || role === "vendor_user";
                        const isSubmitter = s.submitted_by === me?.user_id;
                        const canEdit = isAdmin || ((isVendor || isSubmitter) && isRejected);
                        return canEdit ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Edit submission"
                            onClick={() => nav(`/p/${tpl?.slug}/edit/${s.submission_id}`)}
                            className="text-amber-600 hover:text-amber-700"
                            data-testid={`pdf-edit-${s.submission_id}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                        ) : null;
                      })()}
                      <Button
                        variant="ghost"
                        size="sm"
                        title="View Updated PDF"
                        onClick={() => viewCompletedPdf(s)}
                        className="text-blue-600 hover:text-blue-700"
                        data-testid={`pdf-view-pdf-${s.submission_id}`}
                      >
                        <FileType2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Download completed PDF"
                        onClick={() => downloadCompleted(s)}
                        data-testid={`pdf-download-${s.submission_id}`}
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Print"
                        onClick={() => printPdf(s)}
                        data-testid={`pdf-print-${s.submission_id}`}
                      >
                        <Printer className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Email"
                        onClick={() => mailto(s)}
                        data-testid={`pdf-email-${s.submission_id}`}
                      >
                        <Mail className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Delete"
                        onClick={() => delSub(s)}
                        className="text-red-600 hover:text-red-700"
                        data-testid={`pdf-del-${s.submission_id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Submission details</DialogTitle>
            <DialogDescription>
              {selected?.submission_id} · {selected && formatDate(selected.created_at)}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-xs text-slate-400">Submitted by</div>
                  <div>{selected.submitted_by_name || selected.submitted_by_email || selected.submitted_by || "Anonymous"}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Template version</div>
                  <div>v{selected.template_version}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">IP</div>
                  <div>{selected.ip || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">User Agent</div>
                  <div className="truncate" title={selected.user_agent || ""}>
                    {selected.user_agent || "—"}
                  </div>
                </div>
              </div>

              <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl max-h-[40vh] overflow-y-auto">
                {(tpl?.fields || [])
                  .filter((f) => !["heading", "paragraph", "static_text", "divider", "hidden"].includes(f.type))
                  .map((f) => (
                    <div key={f.id} className="p-3 grid grid-cols-3 gap-2 text-sm">
                      <div className="text-slate-500 col-span-1">{f.label || f.name}</div>
                      <div className="col-span-2 text-slate-800 break-words">
                        {renderVal(selected.values?.[f.id])}
                      </div>
                    </div>
                  ))}
              </div>

              <ApprovalTracker submissionId={selected.submission_id} />

              <div className="flex flex-wrap justify-end gap-2 pt-2">
                {/* Edit button in detail dialog */
                (() => {
                  const role = me?.role || "";
                  const isAdmin = role === "super_admin" || role === "admin";
                  const subStatus = (selected.status || "").toLowerCase();
                  const approvalStatus = (selected.approval_status || "").toLowerCase();
                  const isRejected = subStatus === "rejected" || approvalStatus === "rejected";
                  const isVendor = role === "vendor_admin" || role === "vendor_user";
                  const isSubmitter = selected.submitted_by === me?.user_id;
                  const canEdit = isAdmin || ((isVendor || isSubmitter) && isRejected);
                  return canEdit ? (
                    <Button
                      variant="outline"
                      className="text-amber-700 border-amber-200"
                      onClick={() => { setSelected(null); nav(`/p/${tpl?.slug}/edit/${selected.submission_id}`); }}
                      data-testid="pdf-detail-edit"
                    >
                      <Pencil className="w-4 h-4 mr-1.5" /> Edit Submission
                    </Button>
                  ) : null;
                })()
                }
                <Button variant="outline" onClick={() => printPdf(selected)} data-testid="pdf-detail-print">
                  <Printer className="w-4 h-4 mr-1.5" /> Print
                </Button>
                <Button variant="outline" onClick={() => mailto(selected)} data-testid="pdf-detail-email">
                  <Mail className="w-4 h-4 mr-1.5" /> Email
                </Button>
                <Button variant="outline" onClick={downloadOriginal} data-testid="pdf-detail-original">
                  <Download className="w-4 h-4 mr-1.5" /> Original PDF
                </Button>
                <Button
                  variant="outline"
                  onClick={() => viewCompletedPdf(selected)}
                  className="border-blue-200 text-blue-700 bg-blue-50/50 hover:bg-blue-100"
                  data-testid="pdf-detail-view-pdf"
                >
                  <Eye className="w-4 h-4 mr-1.5 text-blue-600" /> View Updated PDF
                </Button>
                <Button
                  onClick={() => downloadCompleted(selected)}
                  className="bg-blue-600 hover:bg-blue-700"
                  data-testid="pdf-detail-completed"
                >
                  <Download className="w-4 h-4 mr-1.5" /> Download PDF
                </Button>
              </div>
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
    return <img src={v} alt="" className="max-h-24 border border-slate-200 rounded" />;
  }
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
