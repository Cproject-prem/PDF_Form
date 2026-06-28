import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";
import { api, API } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableHeader, TableHead, TableRow, TableBody, TableCell
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Download, Eye, Search, Trash2, FileText } from "lucide-react";
import { formatDate } from "@/lib/utils2";

export default function SubmissionsPage() {
  const { id } = useParams();
  const [form, setForm] = useState(null);
  const [subs, setSubs] = useState([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [f, s] = await Promise.all([
        api.get(`/forms/${id}`),
        api.get(`/forms/${id}/submissions`),
      ]);
      setForm(f.data); setSubs(s.data);
    } catch { toast.error("Failed to load"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const filtered = subs.filter((s) => {
    if (status !== "all" && s.status !== status) return false;
    if (!q) return true;
    const blob = JSON.stringify(s.values).toLowerCase();
    return blob.includes(q.toLowerCase()) || s.submission_id.includes(q);
  });

  const exportCsv = () => {
    const token = localStorage.getItem("ff_token");
    const url = `${API}/forms/${id}/submissions/export.csv`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `${form?.slug || "submissions"}.csv`;
        link.click();
      });
  };

  const setSubStatus = async (sub, st) => {
    await api.patch(`/submissions/${sub.submission_id}`, { status: st });
    toast.success(`Marked ${st}`);
    setSelected(null); load();
  };

  const delSub = async (sub) => {
    if (!confirm("Delete this submission?")) return;
    await api.delete(`/submissions/${sub.submission_id}`);
    toast.success("Deleted"); load();
  };

  const cols = (form?.fields || []).filter((f) => !["heading", "paragraph", "divider"].includes(f.type)).slice(0, 4);

  return (
    <AppLayout>
      <div className="max-w-7xl">
        <div className="flex items-center gap-3 mb-2">
          <Link to="/forms" className="p-2 rounded-md hover:bg-slate-100 text-slate-600" data-testid="back-to-forms"><ArrowLeft className="w-4 h-4" /></Link>
          <span className="text-xs uppercase tracking-[0.1em] text-slate-400 font-bold">Submissions</span>
        </div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl sm:text-4xl font-heading font-bold tracking-tight">{form?.title || "Form"}</h1>
            <p className="text-slate-500 mt-1">{subs.length} total submissions</p>
          </div>
          <Button data-testid="export-csv" onClick={exportCsv} variant="outline"><Download className="w-4 h-4 mr-1.5" /> Export CSV</Button>
        </div>

        <Card className="rounded-2xl border-slate-100 card-soft">
          <div className="flex items-center gap-3 p-4 border-b border-slate-100">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input data-testid="sub-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search submissions…" className="pl-10 h-9" />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-40 h-9" data-testid="sub-status-filter"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="p-8 text-slate-400">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="w-10 h-10 mx-auto text-slate-300" />
              <p className="text-sm text-slate-500 mt-2">No submissions yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  {cols.map((c) => <TableHead key={c.id}>{c.label}</TableHead>)}
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => (
                  <TableRow key={s.submission_id} data-testid={`sub-row-${s.submission_id}`}>
                    <TableCell className="text-sm text-slate-600">{formatDate(s.created_at)}</TableCell>
                    {cols.map((c) => (
                      <TableCell key={c.id} className="text-sm max-w-[180px] truncate">{renderVal(s.values?.[c.id])}</TableCell>
                    ))}
                    <TableCell><StatusBadge status={s.status} /></TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setSelected(s)} data-testid={`view-${s.submission_id}`}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => delSub(s)} className="text-red-600 hover:text-red-700">
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
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Submission details</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><div className="text-xs text-slate-400">Submitted</div><div>{formatDate(selected.created_at)}</div></div>
                <div><div className="text-xs text-slate-400">Status</div><StatusBadge status={selected.status} /></div>
                <div><div className="text-xs text-slate-400">IP</div><div>{selected.ip || "—"}</div></div>
                <div><div className="text-xs text-slate-400">User Agent</div><div className="truncate" title={selected.user_agent || ""}>{selected.user_agent || "—"}</div></div>
              </div>
              <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl">
                {(form?.fields || []).filter((f) => !["heading", "paragraph", "divider"].includes(f.type)).map((f) => (
                  <div key={f.id} className="p-3 grid grid-cols-3 gap-2 text-sm">
                    <div className="text-slate-500 col-span-1">{f.label}</div>
                    <div className="col-span-2 text-slate-800">{renderVal(selected.values?.[f.id])}</div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setSubStatus(selected, "rejected")} data-testid="reject-btn">Reject</Button>
                <Button onClick={() => setSubStatus(selected, "approved")} className="bg-emerald-600 hover:bg-emerald-700" data-testid="approve-btn">Approve</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function StatusBadge({ status }) {
  const cls = status === "approved" ? "bg-emerald-50 text-emerald-700"
            : status === "rejected" ? "bg-red-50 text-red-700"
            : "bg-amber-50 text-amber-700";
  return <span className={`text-xs font-medium px-2 py-1 rounded-full ${cls}`}>{status}</span>;
}

function renderVal(v) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") {
    if (v.file_id) {
      const token = localStorage.getItem("ff_token");
      return <a className="text-blue-600 hover:underline" href={`${API}/files/${v.file_id}`} target="_blank" rel="noreferrer">{v.filename}</a>;
    }
    if (Array.isArray(v)) return v.join(", ");
    return JSON.stringify(v);
  }
  return String(v);
}
