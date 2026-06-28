import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, API } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import {
  ShieldCheck, CheckCircle2, XCircle, RotateCcw, Clock, FileSignature, Sparkles,
} from "lucide-react";

/**
 * Token-based public approval page. The link is sent to the approver by
 * email; no login is required.
 */
export default function PublicApprovalPage() {
  const { token } = useParams();
  const [state, setState] = useState({ loading: true });
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`${API}/public/approvals/${token}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).detail || "Invalid link");
        return r.json();
      })
      .then((data) => setState({ loading: false, ...data }))
      .catch((e) => setState({ loading: false, error: e.message || "Invalid link" }));
  }, [token]);

  const decide = async (decision) => {
    setBusy(true);
    try {
      const r = await fetch(`${API}/public/approvals/${token}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, comment }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Failed");
      setState((s) => ({ ...s, done: true, finalStatus: data.status || decision }));
      toast.success(`Recorded: ${decision}`);
    } catch (e) {
      toast.error(e.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  if (state.loading) {
    return <Center>Loading…</Center>;
  }
  if (state.error) {
    return (
      <Center>
        <Card className="p-8 rounded-2xl">
          <XCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <h2 className="text-xl font-heading font-bold text-center">Invalid link</h2>
          <p className="text-sm text-slate-500 text-center mt-2">{state.error}</p>
        </Card>
      </Center>
    );
  }
  if (state.done || state.approval?.status !== "pending") {
    const status = state.finalStatus || state.approval?.status;
    return (
      <Center>
        <Card className="p-8 rounded-2xl max-w-md text-center">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
          <h2 className="text-2xl font-heading font-bold">Approval finalised</h2>
          <p className="text-sm text-slate-500 mt-2">Status: <b>{status}</b></p>
          <p className="text-xs text-slate-400 mt-4">Thank you for responding.</p>
        </Card>
      </Center>
    );
  }

  const apv = state.approval;
  return (
    <div className="min-h-screen bg-slate-100 py-10 px-4">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center gap-2 mb-6 text-slate-600">
          <Sparkles className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-medium">FormForge Approvals</span>
        </div>

        <Card className="rounded-2xl border-slate-100 card-soft bg-white p-8">
          <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-blue-600 mb-2">
            Approval request
          </div>
          <h1 className="text-2xl font-heading font-bold tracking-tight">{apv.subject}</h1>
          {apv.description && (
            <p className="text-sm text-slate-500 mt-3 leading-relaxed whitespace-pre-line">{apv.description}</p>
          )}

          <div className="grid grid-cols-2 gap-4 mt-5 text-sm">
            <Info label="Reviewer">{state.approver}</Info>
            <Info label="Mode">{apv.mode}</Info>
            {apv.submission_id && <Info label="Submission"><code className="text-xs">{apv.submission_id}</code></Info>}
            <Info label="Requested">{new Date(apv.created_at).toLocaleString()}</Info>
          </div>

          {(apv.decisions || []).length > 0 && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <div className="text-xs uppercase tracking-wider text-slate-400 mb-2">History</div>
              {apv.decisions.map((d, i) => (
                <div key={i} className="text-xs py-1 text-slate-600">
                  <span className={`font-medium ${
                    d.decision === "approve" ? "text-emerald-700" :
                    d.decision === "reject"  ? "text-red-700" : "text-amber-700"
                  }`}>{d.decision}</span> · {d.approver}
                </div>
              ))}
            </div>
          )}

          <div className="mt-5">
            <label className="text-xs text-slate-500">Comment (optional)</label>
            <Textarea
              data-testid="public-apv-comment"
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add a note for the audit trail…"
            />
          </div>

          <div className="flex flex-wrap gap-2 mt-5 justify-end">
            <Button
              variant="outline" className="text-amber-700 border-amber-200"
              disabled={busy}
              onClick={() => decide("return")}
              data-testid="public-apv-return"
            >
              <RotateCcw className="w-4 h-4 mr-1" /> Return
            </Button>
            <Button
              variant="outline" className="text-red-700 border-red-200"
              disabled={busy}
              onClick={() => decide("reject")}
              data-testid="public-apv-reject"
            >
              <XCircle className="w-4 h-4 mr-1" /> Reject
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={busy}
              onClick={() => decide("approve")}
              data-testid="public-apv-approve"
            >
              <CheckCircle2 className="w-4 h-4 mr-1" /> Approve
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Info({ label, children }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-0.5 text-slate-700">{children}</div>
    </div>
  );
}

function Center({ children }) {
  return <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">{children}</div>;
}
