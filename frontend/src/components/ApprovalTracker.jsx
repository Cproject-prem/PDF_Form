import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { CheckCircle2, Clock, XCircle, ShieldAlert } from "lucide-react";
import { formatDate } from "@/lib/utils2";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function ApprovalTracker({ submissionId }) {
  const [apv, setApv] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/approvals/submission/${submissionId}`);
      setApv(res.data);
    } catch (e) {
      if (e.response?.status !== 404) {
        toast.error("Failed to load approval tracking");
      }
      setApv(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (submissionId) load();
  }, [submissionId]);

  const override = async (decision) => {
    if (!confirm(`Are you sure you want to OVERRIDE and ${decision} this submission?`)) return;
    try {
      await api.post(`/approvals/${apv.approval_id}/override-decide`, { decision, comment: "Override by admin" });
      toast.success(`Overridden and ${decision}d`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Not authorized to override");
    }
  };

  if (loading) return <div className="text-sm text-slate-400 mt-4 p-4 border border-slate-200 rounded-xl bg-slate-50">Loading tracker...</div>;
  if (!apv) return null; // No workflow for this submission

  const decisions = apv.decisions || [];
  const statusColors = {
    pending: "text-amber-600 bg-amber-50",
    approved: "text-emerald-700 bg-emerald-50",
    rejected: "text-red-700 bg-red-50",
  };

  return (
    <div className="mt-4 p-4 border border-slate-200 rounded-xl bg-slate-50">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-700">Approval Workflow</h3>
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusColors[apv.status] || "bg-slate-200"}`}>
          {apv.status}
        </span>
      </div>

      <div className="space-y-3">
        {decisions.map((d, i) => (
          <div key={i} className="flex gap-3 text-sm">
            <div className="mt-0.5">
              {d.decision === "approve" ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              ) : d.decision === "reject" ? (
                <XCircle className="w-4 h-4 text-red-500" />
              ) : (
                <Clock className="w-4 h-4 text-slate-400" />
              )}
            </div>
            <div>
              <div className="font-medium text-slate-800">{d.approver}</div>
              <div className="text-xs text-slate-500">{formatDate(d.at)}</div>
              {d.comment && <div className="text-slate-600 italic mt-0.5 text-xs">"{d.comment}"</div>}
            </div>
          </div>
        ))}

        {apv.status === "pending" && (
          <div className="flex gap-3 text-sm">
            <div className="mt-0.5">
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
            <div>
              <div className="font-medium text-amber-700">Waiting on:</div>
              <div className="text-xs text-slate-600 font-mono">
                {apv.approvers?.[apv.current_index || 0] || "Unknown"}
              </div>
            </div>
          </div>
        )}
      </div>

      {apv.status === "pending" && (
        <div className="mt-4 pt-3 border-t border-slate-200 flex justify-end gap-2">
          <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700" onClick={() => override("reject")}>
            <ShieldAlert className="w-4 h-4 mr-1" /> Override Reject
          </Button>
          <Button size="sm" variant="outline" className="text-emerald-600 hover:text-emerald-700" onClick={() => override("approve")}>
            <ShieldAlert className="w-4 h-4 mr-1" /> Override Approve
          </Button>
        </div>
      )}
    </div>
  );
}
