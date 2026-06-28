import React, { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  CheckCircle2, XCircle, RotateCcw, Clock, ShieldCheck, FileSignature, AlertTriangle,
} from "lucide-react";
import { formatDate } from "@/lib/utils2";

export default function ApprovalsPage() {
  const [tab, setTab] = useState("pending");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [comment, setComment] = useState("");
  const [working, setWorking] = useState(false);

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
          <TabsList data-testid="approvals-tabs">
            <TabsTrigger value="pending" data-testid="tab-pending">Pending</TabsTrigger>
            <TabsTrigger value="approved" data-testid="tab-approved">Approved</TabsTrigger>
            <TabsTrigger value="rejected" data-testid="tab-rejected">Rejected</TabsTrigger>
            <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
          </TabsList>

          <TabsContent value={tab} className="mt-4">
            {loading ? (
              <div className="text-slate-400 p-6">Loading…</div>
            ) : items.length === 0 ? (
              <Card className="p-10 text-center rounded-2xl border-slate-100">
                <ShieldCheck className="w-10 h-10 mx-auto text-slate-300" />
                <p className="text-sm text-slate-500 mt-2">No {tab} approvals.</p>
              </Card>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {items.map((apv) => (
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
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
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

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-xl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.subject || "Approval"}</DialogTitle>
                <DialogDescription>
                  {selected.description || `Mode: ${selected.mode}`}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <Info label="Status"><StatusBadge status={selected.status} /></Info>
                  <Info label="Submission">
                    <code className="text-xs">{selected.submission_id || "—"}</code>
                  </Info>
                  <Info label="Approvers">{(selected.approvers || []).join(", ")}</Info>
                  <Info label="Created">{formatDate(selected.created_at)}</Info>
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
