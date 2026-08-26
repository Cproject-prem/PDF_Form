import React, { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { api, API } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@/components/ui/tabs";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  CheckCircle2, XCircle, RotateCcw, Clock, ShieldCheck, FileSignature, AlertTriangle,
  FileText, FileType2, MapPin, Building2, User as UserIcon, Globe, Filter,
} from "lucide-react";
import { formatDate } from "@/lib/utils2";

export default function ApprovalsPage() {
  const [tab, setTab] = useState("pending");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [comment, setComment] = useState("");
  const [working, setWorking] = useState(false);

  const [filterSite, setFilterSite] = useState([]);
  const [filterSubmitter, setFilterSubmitter] = useState([]);
  const [filterApprover, setFilterApprover] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get(`/approvals${tab === "all" ? "" : `?status_filter=${tab}`}`);
      setItems(r.data);
    } catch (e) {
      toast.error("Failed to load approvals");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab]);

  const decide = async (apv, decision) => {
    setWorking(true);
    try {
      await api.post(`/approvals/${apv.approval_id}/decide`, {
        decision, comment,
      });
      toast.success(`Marked ${decision}`);
      setSelected(null); setComment("");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    } finally {
      setWorking(false);
    }
  };

  const viewPdf = async (apv) => {
    if (!apv.submission_id || apv.submission_kind !== "pdf") return;
    const toastId = toast.loading("Loading PDF...");
    try {
      const token = localStorage.getItem("ff_token");
      const r = await fetch(`${API}/pdf-submissions/${apv.submission_id}/completed`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error("Failed to load PDF. It may have been deleted or you lack permission.");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
      toast.dismiss(toastId);
    } catch (e) {
      toast.dismiss(toastId);
      toast.error(e.message || "Failed to load PDF");
    }
  };

  const uniqueSites = [...new Set(items.map(i => i.site_name).filter(Boolean))].sort();
  const uniqueSubmitters = [...new Set(items.map(i => i.submitted_by_name || i.submitted_by_email).filter(Boolean))].sort();
  const uniqueApprovers = [...new Set(items.flatMap(i => i.approvers || []).filter(Boolean))].sort();

  const filteredItems = items.filter(apv => {
    if (filterSite.length > 0 && !filterSite.includes(apv.site_name)) return false;
    const subName = apv.submitted_by_name || apv.submitted_by_email;
    if (filterSubmitter.length > 0 && !filterSubmitter.includes(subName)) return false;
    if (filterApprover.length > 0) {
      const apvList = apv.approvers || [];
      if (!filterApprover.some(a => apvList.includes(a))) return false;
    }
    return true;
  });

  return (
    <AppLayout>
      <div className="max-w-6xl">
        <div className="mb-6">
          <span className="text-xs uppercase tracking-[0.1em] text-slate-400 font-bold">Inbox</span>
          <h1 className="text-3xl sm:text-4xl font-heading font-bold tracking-tight text-slate-900 mt-1">
            My Approvals
          </h1>
          <p className="text-slate-500 mt-1">Steps where you are listed as an approver.</p>
        </div>

                <Tabs value={tab} onValueChange={setTab}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <TabsList data-testid="approvals-tabs">
              <TabsTrigger value="pending" data-testid="tab-pending">Pending</TabsTrigger>
              <TabsTrigger value="approved" data-testid="tab-approved">Approved</TabsTrigger>
              <TabsTrigger value="rejected" data-testid="tab-rejected">Rejected</TabsTrigger>
              <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-2 flex-wrap">
              <FilterDropdown label="Site" options={uniqueSites} selected={filterSite} onChange={setFilterSite} />
              <FilterDropdown label="Submitter" options={uniqueSubmitters} selected={filterSubmitter} onChange={setFilterSubmitter} />
              <FilterDropdown label="Approver" options={uniqueApprovers} selected={filterApprover} onChange={setFilterApprover} />
            </div>
          </div>

          <TabsContent value={tab} className="mt-4">
            {loading ? (
              <div className="text-slate-400 p-6">Loading…</div>
            ) : filteredItems.length === 0 ? (
              <Card className="p-10 text-center rounded-2xl border-slate-100">
                <ShieldCheck className="w-10 h-10 mx-auto text-slate-300" />
                <p className="text-sm text-slate-500 mt-2">No {tab} approvals.</p>
              </Card>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {filteredItems.map((apv) => (
                  <Card
                    key={apv.approval_id}
                    data-testid={`apv-card-${apv.approval_id}`}
                    className="rounded-2xl border-slate-100 card-soft p-4 cursor-pointer hover:border-blue-200 transition-all"
                    onClick={() => setSelected(apv)}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-medium text-slate-800 leading-snug line-clamp-2 flex-1">
                        {apv.subject || "Approval needed"}
                      </h3>
                      <StatusBadge status={apv.status} />
                    </div>
                    {apv.description && (
                      <p className="text-xs text-slate-500 line-clamp-2 mb-3">{apv.description}</p>
                    )}
                    <ContextBadges apv={apv} />
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mt-3">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {formatDate(apv.created_at)}
                      </span>
                      <span className="text-slate-500">{apv.mode}</span>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => {
        if (!o) {
          setSelected(null);
          setPdfUrl(null);
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.subject || "Approval"}</DialogTitle>
                <DialogDescription>
                  {selected.description || `Mode: ${selected.mode}`}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 text-sm">
                <ContextBadges apv={selected} large />
                <div className="grid grid-cols-2 gap-3">
                  <Info label="Status"><StatusBadge status={selected.status} /></Info>
                  <Info label="Submission">
                    <div className="flex items-center gap-2">
                      <code className="text-xs">{selected.submission_id || "—"}</code>
                      {selected.submission_kind === "pdf" && selected.submission_id && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-[10px] px-2 py-0 border-slate-200"
                          onClick={() => viewPdf(selected)}
                        >
                          View PDF
                        </Button>
                      )}
                    </div>
                  </Info>
                  <Info label="Approvers">{(selected.approvers || []).join(", ")}</Info>
                  <Info label="Created">{formatDate(selected.created_at)}</Info>
                  {selected.submitted_by_name && (
                    <Info label="Submitted by">
                      {selected.submitted_by_name}
                      {selected.submitted_by_email && (
                        <span className="text-xs text-slate-400 ml-1">({selected.submitted_by_email})</span>
                      )}
                    </Info>
                  )}
                  {selected.cluster_manager_name && (
                    <Info label="Cluster manager">{selected.cluster_manager_name}</Info>
                  )}
                </div>

                {(selected.decisions || []).length > 0 && (
                  <div className="border border-slate-100 rounded-lg p-3 max-h-40 overflow-y-auto">
                    <div className="text-xs uppercase tracking-wider text-slate-400 mb-1">History</div>
                    {selected.decisions.map((d, i) => (
                      <div key={i} className="text-xs py-1 border-b last:border-b-0 border-slate-50">
                        <span className={`font-medium ${
                          d.decision === "approve" ? "text-emerald-700" :
                          d.decision === "reject" ? "text-red-700" : "text-amber-700"
                        }`}>{d.decision}</span> · <span className="text-slate-500">{d.approver}</span>
                        {d.comment && <div className="text-slate-600 mt-0.5">{d.comment}</div>}
                      </div>
                    ))}
                  </div>
                )}

                {pdfUrl && (
                  <div className="mt-4 border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
                    <div className="bg-slate-100 border-b border-slate-200 px-3 py-1.5 flex justify-between items-center">
                      <span className="text-xs font-medium text-slate-600">PDF Preview</span>
                      <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => window.open(pdfUrl, '_blank')}>
                        Open in new tab
                      </Button>
                    </div>
                    <iframe src={pdfUrl} className="w-full h-[60vh]" title="PDF Document" />
                  </div>
                )}

                {selected.status === "pending" && (
                  <div>
                    <label className="text-xs text-slate-500">Comment (optional)</label>
                    <Textarea
                      rows={3}
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Reason / notes for the audit trail…"
                      data-testid="apv-comment"
                    />
                  </div>
                )}
              </div>

              {selected.status === "pending" && (
                <DialogFooter className="flex-wrap gap-2 sm:gap-2">
                  <Button
                    variant="outline" className="text-amber-700 border-amber-200"
                    disabled={working}
                    onClick={() => decide(selected, "return")}
                    data-testid="apv-return"
                  >
                    <RotateCcw className="w-4 h-4 mr-1" /> Return
                  </Button>
                  <Button
                    variant="outline" className="text-red-700 border-red-200"
                    disabled={working}
                    onClick={() => decide(selected, "reject")}
                    data-testid="apv-reject"
                  >
                    <XCircle className="w-4 h-4 mr-1" /> Reject
                  </Button>
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-700"
                    disabled={working}
                    onClick={() => decide(selected, "approve")}
                    data-testid="apv-approve"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1" /> Approve
                  </Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function Info({ label, children }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    pending:  { cls: "bg-amber-50 text-amber-700",     icon: Clock },
    approved: { cls: "bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
    rejected: { cls: "bg-red-50 text-red-700",         icon: XCircle },
    returned: { cls: "bg-violet-50 text-violet-700",   icon: RotateCcw },
    escalated: { cls: "bg-orange-50 text-orange-700",  icon: AlertTriangle },
    timeout: { cls: "bg-slate-100 text-slate-600",     icon: Clock },
  };
  const m = map[status] || map.pending;
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${m.cls}`}>
      <Icon className="w-3 h-3" /> {status}
    </span>
  );
}

/**
 * Context badges — enrich each approval card / dialog with quick chips for
 * Form, Region, Site, Vendor. Any missing field is silently skipped.
 */
function ContextBadges({ apv, large = false }) {
  const chips = [];
  if (apv.form_name) {
    const Icon = apv.submission_kind === "pdf" ? FileType2 : FileText;
    const cls = apv.submission_kind === "pdf"
      ? "bg-violet-50 text-violet-700 border-violet-200"
      : "bg-blue-50 text-blue-700 border-blue-200";
    chips.push({ icon: Icon, text: apv.form_name, cls });
  }
  if (apv.region) {
    chips.push({ icon: Globe, text: apv.region, cls: "bg-cyan-50 text-cyan-700 border-cyan-200" });
  }
  if (apv.site_name) {
    chips.push({ icon: MapPin, text: apv.site_name, cls: "bg-emerald-50 text-emerald-700 border-emerald-200" });
  }
  if (apv.vendor_name) {
    chips.push({ icon: Building2, text: apv.vendor_name, cls: "bg-orange-50 text-orange-700 border-orange-200" });
  }
  if (apv.submitted_by_name && !large) {
    chips.push({ icon: UserIcon, text: apv.submitted_by_name, cls: "bg-slate-50 text-slate-700 border-slate-200" });
  }
  if (chips.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-1 ${large ? "" : ""}`} data-testid="apv-context-badges">
      {chips.map((c, i) => {
        const Icon = c.icon;
        const size = large ? "text-xs px-2 py-1" : "text-[10px] px-1.5 py-0.5";
        return (
          <span
            key={i}
            className={`inline-flex items-center gap-1 rounded-md border ${size} ${c.cls}`}
            title={c.text}
          >
            <Icon className={large ? "w-3.5 h-3.5" : "w-3 h-3"} />
            <span className={large ? "" : "truncate max-w-[10rem]"}>{c.text}</span>
          </span>
        );
      })}
    </div>
  );
}

function FilterDropdown({ label, options, selected, onChange }) {
  const opts = options || [];
  const count = (selected || []).length;
  
  const toggle = (opt) => {
    if (selected.includes(opt)) {
      onChange(selected.filter(x => x !== opt));
    } else {
      onChange([...selected, opt]);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 border-dashed flex gap-2">
          <Filter className="w-3.5 h-3.5" />
          <span className="text-xs">{label}</span>
          {count > 0 && (
            <span className="border-l border-slate-200 pl-2 text-xs font-semibold">{count}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-0" align="start">
        <div className="p-3 border-b text-xs font-medium text-slate-500 bg-slate-50">
          Filter by {label}
        </div>
        <div className="max-h-[300px] overflow-y-auto p-2 space-y-1">
          {opts.length === 0 ? (
            <div className="text-xs text-slate-400 p-2 text-center">No options available</div>
          ) : (
            opts.map(opt => {
              const isChecked = selected.includes(opt);
              return (
                <label key={opt} className="flex items-center gap-2 p-2 hover:bg-slate-50 rounded cursor-pointer">
                  <Checkbox checked={isChecked} onCheckedChange={() => toggle(opt)} />
                  <span className="text-sm truncate" title={opt}>{opt}</span>
                </label>
              );
            })
          )}
        </div>
        {count > 0 && (
          <div className="p-2 border-t bg-slate-50">
            <Button variant="ghost" size="sm" className="w-full h-8 text-xs text-slate-500" onClick={() => onChange([])}>
              Clear filters
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
