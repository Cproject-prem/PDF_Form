import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableHeader, TableHead, TableRow, TableBody, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plus, Workflow, Search, Trash2, Copy, Edit3, Play, Pause,
  Sparkles, Zap, FileText, ChevronRight,
} from "lucide-react";
import { formatDate } from "@/lib/utils2";
import { useNavigate } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";

const STATUS_STYLES = {
  draft: "bg-amber-50 text-amber-700",
  published: "bg-emerald-50 text-emerald-700",
  disabled: "bg-slate-100 text-slate-500",
};

export default function WorkflowsPage() {
  const { canEditWorkflows, isVendorRole } = usePermissions();
  const [workflows, setWorkflows] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [q, setQ] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const [w, t] = await Promise.all([
        api.get("/workflows"),
        api.get("/workflows/templates"),
      ]);
      setWorkflows(w.data);
      setTemplates(t.data);
    } catch (e) {
      toast.error("Failed to load workflows");
    } finally {
      setLoading(false);
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  if (isVendorRole) {
    return (
      <AppLayout>
        <div className="p-8 text-center max-w-md mx-auto my-12 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-3">
            <Workflow className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-800">Access Restricted</h2>
          <p className="text-sm text-slate-500 mt-1">Workflow Automation is not required for Vendor users.</p>
        </div>
      </AppLayout>
    );
  }

  const filtered = workflows.filter((w) =>
    !q || (w.name || "").toLowerCase().includes(q.toLowerCase()),
  );

  const createBlank = async () => {
    if (!newName.trim()) { toast.error("Name required"); return; }
    try {
      const r = await api.post("/workflows", {
        name: newName.trim(),
        description: "",
        nodes: [{
          id: "trigger_1", kind: "trigger", type: "trigger.form_submitted",
          label: "When a form is submitted",
          config: { event: "form_submitted" },
          position: { x: 80, y: 120 },
        }],
        edges: [],
      });
      setCreateOpen(false);
      setNewName("");
      nav(`/workflows/${r.data.workflow_id}/build`);
    } catch (e) {
      toast.error("Failed to create");
    }
  };

  const fromTemplate = async (slug) => {
    try {
      const r = await api.post(`/workflows/templates/${slug}/instantiate`);
      setTplOpen(false);
      nav(`/workflows/${r.data.workflow_id}/build`);
    } catch (e) {
      toast.error("Failed to instantiate template");
    }
  };

  const toggleStatus = async (wf) => {
    const next = wf.status === "published" ? "disabled" : "published";
    await api.patch(`/workflows/${wf.workflow_id}/status`, { status: next });
    toast.success(next === "published" ? "Enabled" : "Disabled");
    load();
  };

  const remove = async (wf) => {
    if (!confirm(`Delete "${wf.name}"? Past executions will remain.`)) return;
    await api.delete(`/workflows/${wf.workflow_id}`);
    toast.success("Deleted");
    load();
  };

  const duplicate = async (wf) => {
    const r = await api.post(`/workflows/${wf.workflow_id}/duplicate`);
    toast.success("Duplicated");
    nav(`/workflows/${r.data.workflow_id}/build`);
  };

  return (
    <AppLayout>
      <div className="max-w-7xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <span className="text-xs uppercase tracking-[0.1em] text-slate-400 font-bold">Automation</span>
            <h1 className="text-3xl sm:text-4xl font-heading font-bold tracking-tight text-slate-900 mt-1">
              Workflow Designer
            </h1>
            <p className="text-slate-500 mt-1">
              Visual triggers, conditions, approvals and actions — one engine for every form.
            </p>
          </div>
          {canEditWorkflows && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                data-testid="wf-from-template-btn"
                onClick={() => setTplOpen(true)}
              >
                <Sparkles className="w-4 h-4 mr-1.5" /> From template
              </Button>
              <Button
                data-testid="wf-create-btn"
                onClick={() => setCreateOpen(true)}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="w-4 h-4 mr-1.5" /> New workflow
              </Button>
            </div>
          )}
        </div>

        <Card className="rounded-2xl border-slate-100 card-soft bg-white">
          <div className="flex items-center gap-3 p-4 border-b border-slate-100">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search workflows…"
                className="pl-10 h-9"
                data-testid="wf-search"
              />
            </div>
            <span className="text-xs text-slate-500">{filtered.length} workflows</span>
          </div>
          {loading ? (
            <div className="p-8 text-slate-400">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <Workflow className="w-10 h-10 mx-auto text-slate-300" />
              <p className="text-sm text-slate-500 mt-2">No workflows yet.</p>
              <p className="text-xs text-slate-400 mt-1">
                Start blank or use a template — Leave Approval, Expense, Purchase Request…
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Triggers</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((wf) => (
                  <TableRow key={wf.workflow_id} data-testid={`wf-row-${wf.workflow_id}`}>
                    <TableCell>
                      <Link
                        to={`/workflows/${wf.workflow_id}/build`}
                        className="font-medium text-slate-800 hover:text-blue-600"
                      >
                        {wf.name}
                      </Link>
                      {wf.description && (
                        <div className="text-xs text-slate-500 mt-0.5 line-clamp-1">{wf.description}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(wf.triggers || []).slice(0, 2).map((t, i) => (
                          <span key={i} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                            {t.event}
                          </span>
                        ))}
                        {!(wf.triggers || []).length && (
                          <span className="text-xs text-slate-400">No trigger</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_STYLES[wf.status] || ""}`}>
                        {wf.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-slate-500">v{wf.version}</TableCell>
                    <TableCell className="text-sm text-slate-500">{formatDate(wf.updated_at)}</TableCell>
                    <TableCell className="text-right">
                      {canEditWorkflows && (
                        <Button
                          variant="ghost" size="sm" title={wf.status === "published" ? "Disable" : "Enable"}
                          onClick={() => toggleStatus(wf)}
                          data-testid={`wf-toggle-${wf.workflow_id}`}
                        >
                          {wf.status === "published" ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </Button>
                      )}
                      <Link
                        to={`/workflows/${wf.workflow_id}/build`}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-500 hover:bg-slate-100"
                        data-testid={`wf-edit-${wf.workflow_id}`}
                      >
                        <Edit3 className="w-4 h-4" />
                      </Link>
                      {canEditWorkflows && (
                        <>
                          <Button
                            variant="ghost" size="sm" title="Duplicate"
                            onClick={() => duplicate(wf)}
                            data-testid={`wf-dup-${wf.workflow_id}`}
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost" size="sm" title="Delete"
                            onClick={() => remove(wf)}
                            className="text-red-600"
                            data-testid={`wf-del-${wf.workflow_id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a workflow</DialogTitle>
            <DialogDescription>Start blank — you'll add triggers and actions next.</DialogDescription>
          </DialogHeader>
          <Input
            value={newName} onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Onboarding approval"
            data-testid="wf-create-name"
            onKeyDown={(e) => e.key === "Enter" && createBlank()}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={createBlank} data-testid="wf-create-submit" className="bg-blue-600 hover:bg-blue-700">
              <Zap className="w-4 h-4 mr-1.5" /> Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={tplOpen} onOpenChange={setTplOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Start from a template</DialogTitle>
            <DialogDescription>Pre-built flows ready to customise.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto">
            {templates.map((t) => (
              <button
                key={t.template_slug}
                onClick={() => fromTemplate(t.template_slug)}
                data-testid={`wf-tpl-${t.template_slug}`}
                className="text-left p-4 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/30 transition-all"
              >
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="w-4 h-4 text-blue-600" />
                  <span className="font-medium text-slate-800">{t.name}</span>
                </div>
                <p className="text-xs text-slate-500 line-clamp-2">{t.description}</p>
                <div className="flex items-center justify-between mt-3 text-xs text-slate-400">
                  <span>{(t.nodes || []).length} nodes</span>
                  <ChevronRight className="w-3 h-3" />
                </div>
              </button>
            ))}
            {templates.length === 0 && (
              <div className="col-span-2 p-8 text-center text-slate-400 text-sm">No templates yet.</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
