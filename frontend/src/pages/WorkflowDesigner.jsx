import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  Handle, Position, addEdge, applyNodeChanges, applyEdgeChanges,
  useReactFlow, MarkerType, reconnectEdge
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { api } from "@/lib/api";
import {
  NODE_TYPES, NODE_KINDS, getNodeMeta, PALETTE_GROUPS, OPERATORS,
} from "@/lib/workflowNodes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SearchableDropdown } from "@/components/ui/SearchableDropdown";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ArrowLeft, Save, Play, Send, History, Trash2, Plus, X,
  Zap, GitBranch, Mail, ListChecks, Clock, Globe, Webhook, Hand, LogIn,
  CheckCheck, Pencil, ClipboardCheck, Calculator, Variable, ScrollText,
  GitMerge, CircleStop, FileText, Copy, Loader2, Bug, MessageSquare
} from "lucide-react";

const ICONS = {
  Zap, GitBranch, Mail, ListChecks, Clock, Globe, Webhook, Hand, LogIn,
  CheckCheck, Pencil, ClipboardCheck, Calculator, Variable, ScrollText,
  GitMerge, CircleStop, FileText, MessageSquare
};

// ---------- Custom node component ---------------------------------------------

function WorkflowFlowNode({ id, data, selected }) {
  const meta = getNodeMeta(data.type);
  const Icon = ICONS[meta.icon] || Zap;
  const k = NODE_KINDS[data.kind] || NODE_KINDS.action;

  const isCondition = data.kind === "condition";
  const isApproval = data.kind === "approval";
  const isTrigger = data.kind === "trigger";
  const isEnd = data.kind === "end";

  // For trigger nodes, resolve the picked form/PDF name for a nicer display.
  const [resolvedTriggerName, setResolvedTriggerName] = React.useState(null);
  React.useEffect(() => {
    if (data.kind !== "trigger") return;
    const fid = data.config?.filter?.form_id;
    const tid = data.config?.filter?.template_id;
    if (fid) {
      import("@/lib/api").then(({ api }) => api.get(`/forms/${fid}`).then((r) => setResolvedTriggerName(r.data.title)).catch(() => {}));
    } else if (tid) {
      import("@/lib/api").then(({ api }) => api.get(`/pdf-forms/${tid}`).then((r) => setResolvedTriggerName(r.data.title)).catch(() => {}));
    } else {
      setResolvedTriggerName(null);
    }
  }, [data.config, data.kind]);

  const displayLabel = isTrigger && resolvedTriggerName
    ? `When "${resolvedTriggerName}" ${data.type === "trigger.pdf_submitted" ? "PDF" : "form"} submitted`
    : (data.label || meta.label);

  return (
    <div
      data-testid={`flow-node-${id}`}
      className={`relative rounded-xl bg-white border ${selected ? "border-blue-500 shadow-lg" : "border-slate-200 shadow-sm"} min-w-[220px] hover:shadow-md transition-all`}
    >
      {/* top inbound */}
      {!isTrigger && (
        <Handle type="target" position={Position.Top} className="!bg-slate-400 !w-2 !h-2" />
      )}

      <div className="px-3 pt-2.5 pb-1.5 flex items-center gap-2">
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
          style={{ backgroundColor: k.bg, color: k.color }}
        >
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-wider font-bold" style={{ color: k.color }}>
            {k.label}
          </div>
          <div className="text-sm font-medium text-slate-800 truncate" title={displayLabel}>
            {displayLabel}
          </div>
        </div>
      </div>
      <div className="px-3 pb-2.5 text-xs text-slate-500 truncate">
        {(data.config?.event || data.config?.subject || data.config?.to || data.config?.expression || meta.description)?.slice(0, 60)}
      </div>

      {/* outbound handles */}
      {isCondition ? (
        <>
          <Handle id="true" type="source" position={Position.Bottom} style={{ left: "30%", background: "#16a34a" }} className="!w-2.5 !h-2.5" />
          <Handle id="false" type="source" position={Position.Bottom} style={{ left: "70%", background: "#dc2626" }} className="!w-2.5 !h-2.5" />
          <div className="absolute -bottom-5 left-0 right-0 flex justify-between px-4 text-[10px] text-slate-500">
            <span className="text-emerald-600 font-medium">true</span>
            <span className="text-red-600 font-medium">false</span>
          </div>
        </>
      ) : isApproval ? (
        <>
          <Handle id="approved" type="source" position={Position.Bottom} style={{ left: "30%", background: "#16a34a" }} className="!w-2.5 !h-2.5" />
          <Handle id="rejected" type="source" position={Position.Bottom} style={{ left: "70%", background: "#dc2626" }} className="!w-2.5 !h-2.5" />
          <div className="absolute -bottom-5 left-0 right-0 flex justify-between px-4 text-[10px] text-slate-500">
            <span className="text-emerald-600 font-medium">approved</span>
            <span className="text-red-600 font-medium">rejected</span>
          </div>
        </>
      ) : !isEnd ? (
        <Handle id="default" type="source" position={Position.Bottom} className="!bg-slate-400 !w-2 !h-2" />
      ) : null}
    </div>
  );
}

const nodeTypesMap = { workflow: WorkflowFlowNode };

// ---------- Designer ----------------------------------------------------------

function DesignerInner() {
  const { id } = useParams();
  const nav = useNavigate();
  const [wf, setWf] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [history, setHistory] = useState({ past: [], future: [] });
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [testOpen, setTestOpen] = useState(false);
  const [testPayload, setTestPayload] = useState('{\n  "submission_id": "sub_test1",\n  "values": {"days": 3, "email": "user@x.com"}\n}');
  const [testResult, setTestResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [executions, setExecutions] = useState([]);
  const [executionsOpen, setExecutionsOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const flow = useReactFlow();
  const dragType = useRef(null);

  // load workflow
  useEffect(() => {
    api.get(`/workflows/${id}`).then((r) => {
      const w = r.data;
      setWf(w);
      setNodes(toFlowNodes(w.nodes));
      setEdges(toFlowEdges(w.edges));
    }).catch(() => { toast.error("Workflow not found"); nav("/workflows"); });
  }, [id, nav]);

  const selected = useMemo(() => nodes.find((n) => n.id === selectedId), [nodes, selectedId]);

  // autosave
  const dirtyRef = useRef(false);
  useEffect(() => { dirtyRef.current = true; }, [nodes, edges]);
  useEffect(() => {
    const t = setInterval(() => {
      if (dirtyRef.current && wf) {
        dirtyRef.current = false;
        save();
      }
    }, 12000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wf]);

  // history
  const pushHistory = useCallback(() => {
    setHistory((h) => ({ past: [...h.past.slice(-30), { nodes, edges }], future: [] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]);

  const undo = () => {
    setHistory((h) => {
      if (!h.past.length) return h;
      const prev = h.past[h.past.length - 1];
      setNodes(prev.nodes);
      setEdges(prev.edges);
      return { past: h.past.slice(0, -1), future: [{ nodes, edges }, ...h.future] };
    });
  };
  const redo = () => {
    setHistory((h) => {
      if (!h.future.length) return h;
      const next = h.future[0];
      setNodes(next.nodes);
      setEdges(next.edges);
      return { past: [...h.past, { nodes, edges }], future: h.future.slice(1) };
    });
  };

  // node/edge handlers
  const onNodesChange = useCallback((changes) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);
  const onReconnect = useCallback((oldEdge, newConnection) => setEdges((els) => reconnectEdge(oldEdge, newConnection, els)), []);
  const onConnect = useCallback((params) => {
    pushHistory();
    setEdges((eds) => addEdge({
      ...params,
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed, width: 20, height: 20, color: "#94a3b8" },
      style: { strokeWidth: 2, stroke: "#94a3b8" }
    }, eds));
  }, [pushHistory]);

  const addNode = (typeMeta, position) => {
    pushHistory();
    const id = `n_${Math.random().toString(36).slice(2, 10)}`;
    const newNode = {
      id,
      type: "workflow",
      position: position || { x: 200 + Math.random() * 200, y: 200 + Math.random() * 200 },
      data: {
        kind: typeMeta.kind,
        type: typeMeta.type,
        label: typeMeta.label,
        config: { ...(typeMeta.defaults || {}) },
      },
    };
    setNodes((nds) => [...nds, newNode]);
    setSelectedId(id);
  };

  // drag and drop
  const onDragStart = (e, type) => {
    dragType.current = type;
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };
  const onDrop = (e) => {
    e.preventDefault();
    if (!dragType.current) return;
    const meta = getNodeMeta(dragType.current);
    const position = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    addNode(meta, position);
    dragType.current = null;
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    pushHistory();
    setNodes((nds) => nds.filter((n) => n.id !== selectedId));
    setEdges((eds) => eds.filter((e) => e.id !== selectedId && e.source !== selectedId && e.target !== selectedId));
    setSelectedId(null);
  };

  const duplicateSelected = () => {
    if (!selected) return;
    const meta = getNodeMeta(selected.data.type);
    const copy = {
      ...meta,
      defaults: { ...(selected.data.config || {}) },
    };
    addNode(copy, { x: selected.position.x + 40, y: selected.position.y + 40 });
  };

  const updateSelected = (patch) => {
    setNodes((nds) => nds.map((n) => n.id === selectedId
      ? { ...n, data: { ...n.data, ...patch, config: { ...(n.data.config || {}), ...(patch.config || {}) } } }
      : n,
    ));
  };

  // keyboard
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || "").toLowerCase();
      if (["input", "textarea"].includes(tag) || e.target?.isContentEditable) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
      if (e.key === "Delete" || e.key === "Backspace") deleteSelected();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, selectedId]);

  // save/publish/test
  const save = async (override = {}) => {
    if (!wf) return;
    setSaving(true);
    try {
      const r = await api.put(`/workflows/${wf.workflow_id}`, {
        name: override.name ?? wf.name,
        description: override.description ?? wf.description,
        nodes: nodes.map(toBackendNode),
        edges: edges.map(toBackendEdge),
        ...(override.status ? { status: override.status } : {}),
      });
      setWf(r.data);
      dirtyRef.current = false;
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    if (!nodes.some((n) => n.data.kind === "trigger")) {
      toast.error("Add at least one trigger before publishing");
      return;
    }
    await save();
    await api.patch(`/workflows/${wf.workflow_id}/status`, { status: "published" });
    setWf((w) => ({ ...w, status: "published" }));
    toast.success("Workflow published");
  };

  const unpublish = async () => {
    await api.patch(`/workflows/${wf.workflow_id}/status`, { status: "draft" });
    setWf((w) => ({ ...w, status: "draft" }));
    toast.success("Set to draft");
  };

  const runTest = async () => {
    setRunning(true); setTestResult(null);
    try {
      await save();
      let payload;
      try { payload = JSON.parse(testPayload); }
      catch { toast.error("Payload must be valid JSON"); setRunning(false); return; }
      const r = await api.post(`/workflows/${wf.workflow_id}/test`, {
        event: (wf.triggers?.[0]?.event) || "manual",
        payload,
      });
      const ex = await api.get(`/workflows/executions/${r.data.execution_id}`);
      setTestResult(ex.data);
    } catch (e) {
      toast.error("Test failed");
    } finally {
      setRunning(false);
    }
  };

  const loadExecutions = async () => {
    const r = await api.get(`/workflows/${wf.workflow_id}/executions`);
    setExecutions(r.data);
    setExecutionsOpen(true);
  };

  const saveTemplate = async () => {
    try {
      setSaving(true);
      await api.post(`/workflows/${wf.workflow_id}/save-template`, { name: templateName });
      toast.success("Saved as template");
      setTemplateOpen(false);
      setTemplateName("");
    } catch (e) {
      toast.error("Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  if (!wf) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading…</div>;
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Top bar */}
      <header className="h-14 shrink-0 border-b border-slate-200 bg-white flex items-center justify-between px-3 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link to="/workflows" className="p-2 rounded-md hover:bg-slate-100 text-slate-600"><ArrowLeft className="w-4 h-4" /></Link>
          <Input
            data-testid="wf-name-input"
            value={wf.name}
            onChange={(e) => setWf((w) => ({ ...w, name: e.target.value }))}
            onBlur={() => save({ name: wf.name })}
            className="h-9 max-w-[280px] border-transparent focus-visible:border-slate-300"
          />
          <span className={`text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full ${wf.status === "published" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
            {wf.status}
          </span>
          <span className="text-xs text-slate-400">v{wf.version}</span>
          {saving && <span className="text-xs text-slate-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Saving…</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <Button data-testid="wf-undo" variant="ghost" size="sm" onClick={undo} title="Undo (Ctrl+Z)">↶</Button>
          <Button data-testid="wf-redo" variant="ghost" size="sm" onClick={redo} title="Redo (Ctrl+Shift+Z)">↷</Button>
          <Button data-testid="wf-save" variant="outline" size="sm" onClick={() => save()}>
            <Save className="w-4 h-4 mr-1" /> Save
          </Button>
          <Button data-testid="wf-test" variant="outline" size="sm" onClick={() => setTestOpen(true)}>
            <Bug className="w-4 h-4 mr-1" /> Test
          </Button>
          <Button data-testid="wf-history" variant="outline" size="sm" onClick={loadExecutions}>
            <History className="w-4 h-4 mr-1" /> Runs
          </Button>
          <Button data-testid="wf-save-template" variant="outline" size="sm" onClick={() => { setTemplateName(`Copy of ${wf.name}`); setTemplateOpen(true); }}>
            <Copy className="w-4 h-4 mr-1" /> Save as Template
          </Button>
          {wf.status === "published" ? (
            <Button data-testid="wf-unpublish" variant="outline" size="sm" onClick={unpublish}>Unpublish</Button>
          ) : (
            <Button data-testid="wf-publish" size="sm" onClick={publish} className="bg-blue-600 hover:bg-blue-700">
              <Send className="w-4 h-4 mr-1" /> Publish
            </Button>
          )}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Palette */}
        <aside data-testid="wf-palette" className={`${paletteOpen ? "w-64" : "w-0"} shrink-0 border-r border-slate-200 bg-white overflow-y-auto transition-all`}>
          <div className="p-3">
            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-2">Library</div>
            {PALETTE_GROUPS.map((g) => (
              <div key={g.label} className="mb-4">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 px-1 mb-1">{g.label}</div>
                <div className="space-y-1">
                  {NODE_TYPES.filter((t) => g.kinds.includes(t.kind)).map((t) => {
                    const Icon = ICONS[t.icon] || Zap;
                    const k = NODE_KINDS[t.kind];
                    return (
                      <button
                        key={t.type}
                        draggable
                        onDragStart={(e) => onDragStart(e, t.type)}
                        onDoubleClick={() => addNode(t)}
                        data-testid={`palette-${t.type}`}
                        className="w-full flex items-center gap-2 px-2 py-2 rounded-lg border border-transparent hover:border-slate-200 hover:bg-slate-50 transition-all text-left cursor-grab active:cursor-grabbing"
                      >
                        <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                             style={{ backgroundColor: k.bg, color: k.color }}>
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-slate-800 truncate">{t.label}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* Canvas */}
        <div
          className="flex-1 relative"
          onDrop={onDrop}
          onDragOver={onDragOver}
          data-testid="wf-canvas"
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypesMap}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onReconnect={onReconnect}
            onNodeClick={(_, n) => setSelectedId(n.id)}
            onEdgeClick={(_, e) => setSelectedId(e.id)}
            onPaneClick={() => setSelectedId(null)}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#cbd5e1" gap={20} size={1} />
            <Controls position="bottom-left" />
            <MiniMap position="bottom-right" pannable zoomable
                     nodeColor={(n) => NODE_KINDS[n.data?.kind]?.color || "#94a3b8"} />
          </ReactFlow>
        </div>

        {/* Right config */}
        <aside data-testid="wf-config-panel" className="w-80 shrink-0 border-l border-slate-200 bg-white overflow-y-auto">
          {selected ? (
            <ConfigPanel
              node={selected}
              allNodes={nodes}
              onChange={(patch) => updateSelected(patch)}
              onDelete={deleteSelected}
              onDuplicate={duplicateSelected}
              cfg={selected.data.config || {}}
            />
          ) : selectedId ? (
            <div className="p-4 flex flex-col items-center justify-center text-center mt-10 space-y-4">
              <p className="text-sm text-slate-700 font-medium">Connection Selected</p>
              <Button variant="destructive" onClick={deleteSelected} className="w-full">
                <Trash2 className="w-4 h-4 mr-2" />
                Remove Connection
              </Button>
            </div>
          ) : (
            <div className="p-6">
              <div className="text-xs uppercase tracking-wider font-bold text-slate-500 mb-2">Workflow</div>
              <Input
                data-testid="wf-desc-input"
                placeholder="Description"
                value={wf.description || ""}
                onChange={(e) => setWf((w) => ({ ...w, description: e.target.value }))}
                onBlur={() => save({ description: wf.description })}
              />
              <p className="text-xs text-slate-400 mt-4 leading-relaxed">
                Drag a node from the left palette onto the canvas, then connect from a handle on
                one node to the top of another. Click a node to edit its parameters here.
              </p>
              <p className="text-xs text-slate-400 mt-3 leading-relaxed">
                Variables you can use in any string field:{" "}
                <code className="bg-slate-100 px-1 rounded">{"{{submission_id}}"}</code>,{" "}
                <code className="bg-slate-100 px-1 rounded">{"{{values.email}}"}</code>,{" "}
                <code className="bg-slate-100 px-1 rounded">{"{{user_email}}"}</code>,{" "}
                <code className="bg-slate-100 px-1 rounded">{"{{approval.status}}"}</code>.
              </p>
            </div>
          )}
        </aside>
      </div>

      {/* Test dialog */}
      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Test workflow</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-slate-500 mb-1">Payload (JSON)</div>
              <Textarea
                rows={12}
                value={testPayload}
                onChange={(e) => setTestPayload(e.target.value)}
                className="font-mono text-xs"
                data-testid="wf-test-payload"
              />
              <Button
                onClick={runTest} disabled={running} className="mt-3 bg-blue-600 hover:bg-blue-700"
                data-testid="wf-test-run"
              >
                {running ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Running…</> : <><Play className="w-4 h-4 mr-1" /> Run test</>}
              </Button>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">Result</div>
              {!testResult ? (
                <div className="border border-slate-200 rounded-lg p-4 text-sm text-slate-400 h-72">
                  Run the workflow to see live logs here.
                </div>
              ) : (
                <div className="border border-slate-200 rounded-lg p-3 h-72 overflow-auto font-mono text-[11px]">
                  <div className={`mb-2 font-bold ${testResult.status === "success" ? "text-emerald-600" : testResult.status === "failed" ? "text-red-600" : "text-amber-600"}`}>
                    {testResult.status.toUpperCase()} · {testResult.duration_ms ?? "—"}ms
                  </div>
                  {testResult.error && <div className="mb-2 text-red-600">{testResult.error}</div>}
                  {testResult.logs.map((l, i) => (
                    <div key={i} className="border-b border-slate-100 py-1">
                      <span className="text-slate-400">[{l.timestamp.slice(11, 19)}]</span>{" "}
                      <span className={l.level === "error" ? "text-red-600" : l.level === "warn" ? "text-amber-600" : "text-slate-700"}>{l.message}</span>
                    </div>
                  ))}
                  <div className="mt-3 text-slate-400">Variables:</div>
                  <pre className="text-slate-600 whitespace-pre-wrap break-words">{JSON.stringify(testResult.variables, null, 2)}</pre>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Executions dialog */}
      <Dialog open={executionsOpen} onOpenChange={setExecutionsOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Recent executions</DialogTitle></DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto divide-y divide-slate-100">
            {executions.length === 0 ? (
              <div className="p-6 text-sm text-slate-400">No executions yet.</div>
            ) : executions.map((ex) => (
              <div key={ex.execution_id} className="p-3 flex items-center justify-between text-sm">
                <div>
                  <div className="font-mono text-xs text-slate-500">{ex.execution_id}</div>
                  <div className="text-xs text-slate-400">
                    {ex.trigger_event} · {new Date(ex.started_at).toLocaleString()} · {ex.duration_ms ?? "—"}ms
                  </div>
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                  ex.status === "success" ? "bg-emerald-50 text-emerald-700" :
                  ex.status === "failed" ? "bg-red-50 text-red-700" :
                  ex.status === "waiting_approval" ? "bg-violet-50 text-violet-700" :
                  "bg-slate-100 text-slate-600"
                }`}>{ex.status}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Save Template Dialog */}
      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Save as Template</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-slate-500">
              Save this workflow layout as a reusable template. It will appear in the templates list for future forms.
            </div>
            <div>
              <div className="text-xs font-medium text-slate-500 mb-1">Template Name</div>
              <Input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g. Finance Approval"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="ghost" onClick={() => setTemplateOpen(false)}>Cancel</Button>
              <Button onClick={saveTemplate} disabled={!templateName.trim() || saving}>
                {saving ? "Saving..." : "Save Template"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function WorkflowDesignerPage() {
  return (
    <ReactFlowProvider>
      <DesignerInner />
    </ReactFlowProvider>
  );
}

// ---------- Config panel -----------------------------------------------------

function ConfigPanel({ node, onChange, onDelete, onDuplicate, allNodes }) {
  const meta = getNodeMeta(node.data.type);
  const cfg = node.data.config || {};

  const setCfg = (k, v) => {
    if (k.includes(".")) {
      const [outer, inner] = k.split(".", 2);
      onChange({ config: { [outer]: { ...(cfg[outer] || {}), [inner]: v } } });
    } else {
      onChange({ config: { [k]: v } });
    }
  };

  const setLabel = (label) => onChange({ label });

  return (
    <div className="p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider font-bold" style={{ color: NODE_KINDS[node.data.kind]?.color }}>
            {NODE_KINDS[node.data.kind]?.label}
          </div>
          <div className="text-sm font-medium text-slate-800">{meta.label}</div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onDuplicate} data-testid="cfg-duplicate" title="Duplicate"><Copy className="w-4 h-4" /></Button>
          <Button variant="ghost" size="sm" onClick={onDelete} data-testid="cfg-delete" className="text-red-600" title="Delete"><Trash2 className="w-4 h-4" /></Button>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs text-slate-500">Label</label>
          <Input value={node.data.label || ""} onChange={(e) => setLabel(e.target.value)} data-testid="cfg-label" />
        </div>

        {/* type-specific fields */}
        {meta.fields.map((f) => (
          <FieldEditor key={f.key} field={f} value={readPath(cfg, f.key)} onChange={(v) => setCfg(f.key, v)} allNodes={allNodes} cfg={cfg} />
        ))}
      </div>

      {/* helpful description */}
      <p className="mt-6 text-xs text-slate-400 leading-relaxed">{meta.description}</p>
    </div>
  );
}

function readPath(obj, key) {
  if (!key.includes(".")) return obj?.[key];
  const [a, b] = key.split(".", 2);
  return obj?.[a]?.[b];
}

function FieldIdValidator({ field, value, onChange, cfg }) {
  const [formFields, setFormFields] = React.useState(null);
  
  React.useEffect(() => {
    const tid = cfg?.filter?.template_id;
    const fid = cfg?.filter?.form_id;
    if (tid) {
      import("@/lib/api").then(({ api }) => api.get(`/pdf-forms/${tid}`).then((r) => setFormFields(r.data?.fields || [])));
    } else if (fid) {
      import("@/lib/api").then(({ api }) => api.get(`/forms/${fid}`).then((r) => setFormFields(r.data?.fields || [])));
    } else {
      setFormFields(null);
    }
  }, [cfg?.filter?.template_id, cfg?.filter?.form_id]);

  let statusMsg = null;
  let statusColor = "text-slate-500";
  if (!value) {
    statusMsg = "Format: field_id (e.g. text-123)";
  } else if (formFields) {
    const found = formFields.find(f => f.id === value);
    if (found) {
      statusMsg = `✓ Found: ${found.label || found.name || found.id}`;
      statusColor = "text-green-600";
    } else {
      statusMsg = "✗ Enter valid field ID";
      statusColor = "text-red-500";
    }
  } else {
    statusMsg = "Please select a form above first.";
  }

  return (
    <div>
      <label className="text-xs text-slate-500">{field.label}</label>
      <Input
        value={value ?? ""}
        placeholder={field.placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={!value ? "" : statusColor.includes("red") ? "border-red-500 focus-visible:ring-red-500" : "border-green-500 focus-visible:ring-green-500"}
      />
      <div className={`text-[10px] mt-1 ${statusColor}`}>{statusMsg}</div>
    </div>
  );
}

function FieldEditor({ field, value, onChange, allNodes, cfg }) {
  if (field.type === "site_column_picker") {
    return <SiteColumnPicker field={field} value={value} onChange={onChange} />;
  }
  if (field.type === "site_column_value_picker") {
    return <SiteColumnValuePicker field={field} value={value} onChange={onChange} cfg={cfg} />;
  }
  if (field.type === "field_id_validator") {
    return <FieldIdValidator field={field} value={value} onChange={onChange} cfg={cfg} />;
  }
  if (field.type === "string") {
    return (
      <div>
        <label className="text-xs text-slate-500">{field.label}</label>
        <Input
          value={value ?? ""}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          data-testid={`cfg-${field.key}`}
        />
      </div>
    );
  }
  if (field.type === "long") {
    return (
      <div>
        <label className="text-xs text-slate-500">{field.label}</label>
        <Textarea rows={5} value={value ?? ""} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} data-testid={`cfg-${field.key}`} />
      </div>
    );
  }
  if (field.type === "number") {
    return (
      <div>
        <label className="text-xs text-slate-500">{field.label}</label>
        <Input type="number" value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} data-testid={`cfg-${field.key}`} />
      </div>
    );
  }
  if (field.type === "select") {
    return (
      <div>
        <label className="text-xs text-slate-500">{field.label}</label>
        <Select value={value || ""} onValueChange={onChange}>
          <SelectTrigger data-testid={`cfg-${field.key}`}><SelectValue placeholder="Choose…" /></SelectTrigger>
          <SelectContent>
            {field.options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    );
  }
  if (field.type === "boolean") {
    return (
      <label className="flex items-center gap-2 cursor-pointer text-sm">
        <input
          type="checkbox"
          checked={value !== false}
          onChange={(e) => onChange(e.target.checked)}
          data-testid={`cfg-${field.key}`}
        />
        <span className="text-slate-700">{field.label}</span>
      </label>
    );
  }
  if (field.type === "json") {
    return (
      <div>
        <label className="text-xs text-slate-500">{field.label}</label>
        <Textarea
          rows={4} className="font-mono text-xs"
          value={typeof value === "string" ? value : JSON.stringify(value || {}, null, 2)}
          placeholder={field.placeholder}
          onChange={(e) => {
            try { onChange(JSON.parse(e.target.value || "{}")); }
            catch { onChange(e.target.value); }
          }}
          data-testid={`cfg-${field.key}`}
        />
      </div>
    );
  }
  if (field.type === "form_picker") {
    return <FormPicker field={field} value={value} onChange={onChange} />;
  }
  if (field.type === "multi_checkbox") {
    return (
      <div>
        <label className="text-xs text-slate-500">{field.label}</label>
        <div className="space-y-1.5 mt-1">
          {(field.options || []).map((o) => {
            const checked = Array.isArray(value) && value.includes(o.value);
            return (
              <label key={o.value} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    const set = new Set(Array.isArray(value) ? value : []);
                    e.target.checked ? set.add(o.value) : set.delete(o.value);
                    onChange(Array.from(set));
                  }}
                  data-testid={`cfg-${field.key}-${o.value}`}
                />
                <span>{o.label}</span>
              </label>
            );
          })}
        </div>
      </div>
    );
  }
  if (field.type === "rule_group") {
    return <RuleGroupEditor group={value || { combinator: "and", rules: [] }} onChange={onChange} />;
  }
  return null;
}

function FormPicker({ field, value, onChange }) {
  const [opts, setOpts] = React.useState([]);
  React.useEffect(() => {
    import("@/lib/api").then(({ api }) =>
      api.get(`/${field.source}`).then((r) => setOpts(r.data || [])).catch(() => setOpts([])));
  }, [field.source]);
  const idKey = field.source === "pdf-forms" ? "template_id" : "form_id";
  return (
    <div>
      <label className="text-xs text-slate-500">{field.label}</label>
      <Select value={value || "__any__"} onValueChange={(v) => onChange(v === "__any__" ? "" : v)}>
        <SelectTrigger data-testid={`cfg-${field.key}`}><SelectValue placeholder="Any" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__any__">Any {field.source === "pdf-forms" ? "PDF form" : "form"}</SelectItem>
          {opts.map((o) => (
            <SelectItem key={o[idKey]} value={o[idKey]}>{o.title || o.name || o[idKey]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SiteColumnValuePicker({ field, value, onChange, cfg }) {
  const [opts, setOpts] = React.useState([]);
  const depCol = cfg?.[field.depends_on];

  React.useEffect(() => {
    if (!depCol) {
      setOpts([]);
      return;
    }
    import("@/lib/api").then(({ api }) => {
      api.get(`/sites/columns/${depCol}/values`)
        .then((r) => setOpts(r.data || []))
        .catch(() => setOpts([]));
    });
  }, [depCol]);

  // Use the SearchableDropdown with multi=true
  return (
    <div>
      <label className="text-xs text-slate-500">{field.label}</label>
      <div className="h-8 mt-1">
        <SearchableDropdown
          options={opts}
          value={value || []}
          onChange={onChange}
          placeholder={field.placeholder || "Select values..."}
          multi={true}
          disabled={!depCol}
        />
      </div>
    </div>
  );
}

/** Dropdown populated from /api/sites/columns — lets user pick a Site Master column key */
function SiteColumnPicker({ field, value, onChange }) {
  const [cols, setCols] = React.useState([]);
  React.useEffect(() => {
    import("@/lib/api").then(({ api }) =>
      api.get("/sites/columns").then((r) => setCols(r.data || [])).catch(() => setCols([])));
  }, []);
  
  const options = [
    { value: "__none__", label: "(none / skip)" },
    ...cols.map(c => ({ value: c.key, label: `${c.label} (${c.key})` }))
  ];

  return (
    <div>
      <label className="text-xs text-slate-500">{field.label}</label>
      <div className="h-8 mt-1">
        <SearchableDropdown
          options={options}
          value={value || ""}
          onChange={(v) => onChange(v === "__none__" ? "" : v)}
          placeholder={field.placeholder || "Select site column..."}
        />
      </div>
    </div>
  );
}

function RuleGroupEditor({ group, onChange }) {
  const setCombinator = (c) => onChange({ ...group, combinator: c });
  const addRule = () =>
    onChange({ ...group, rules: [...(group.rules || []), { left: "", op: "eq", right: "" }] });
  const addGroup = () =>
    onChange({ ...group, rules: [...(group.rules || []), { combinator: "and", rules: [] }] });
  const update = (i, patch) => {
    const next = [...(group.rules || [])];
    next[i] = { ...next[i], ...patch };
    onChange({ ...group, rules: next });
  };
  const remove = (i) => {
    const next = [...(group.rules || [])];
    next.splice(i, 1);
    onChange({ ...group, rules: next });
  };

  return (
    <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/40">
      <div className="flex items-center gap-2 mb-2">
        <Select value={group.combinator || "and"} onValueChange={setCombinator}>
          <SelectTrigger className="h-7 w-20 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="and">AND</SelectItem>
            <SelectItem value="or">OR</SelectItem>
            <SelectItem value="not">NOT</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-[10px] uppercase tracking-wider text-slate-400">Match {(group.combinator || "and").toUpperCase()} of</span>
      </div>
      <div className="space-y-2">
        {(group.rules || []).map((r, i) => r.combinator ? (
          <div key={i} className="pl-3">
            <RuleGroupEditor group={r} onChange={(g) => update(i, g)} />
            <Button variant="ghost" size="sm" className="text-red-600 text-xs h-6 mt-1" onClick={() => remove(i)}>
              <X className="w-3 h-3" /> remove group
            </Button>
          </div>
        ) : (
          <div key={i} className="flex items-center gap-1.5">
            <Input
              className="h-7 text-xs"
              placeholder="values.field"
              value={r.left || ""}
              onChange={(e) => update(i, { left: e.target.value })}
              data-testid={`rule-left-${i}`}
            />
            <Select value={r.op || "eq"} onValueChange={(v) => update(i, { op: v })}>
              <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {OPERATORS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              className="h-7 text-xs flex-1"
              placeholder="value"
              value={r.right ?? ""}
              onChange={(e) => update(i, { right: e.target.value })}
              data-testid={`rule-right-${i}`}
            />
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600" onClick={() => remove(i)}>
              <X className="w-3 h-3" />
            </Button>
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 mt-2">
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addRule} data-testid="rule-add">
          <Plus className="w-3 h-3 mr-1" /> rule
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addGroup}>
          <Plus className="w-3 h-3 mr-1" /> group
        </Button>
      </div>
    </div>
  );
}

// ---------- conversions -----------------------------------------------------

function toFlowNodes(nodes = []) {
  return nodes.map((n) => ({
    id: n.id,
    type: "workflow",
    position: n.position || { x: 200, y: 200 },
    data: { kind: n.kind, type: n.type, label: n.label, config: n.config || {} },
  }));
}
function toFlowEdges(edges = []) {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
    label: e.label,
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8" },
    style: { stroke: "#94a3b8", strokeWidth: 1.5 },
  }));
}
function toBackendNode(n) {
  return {
    id: n.id,
    kind: n.data.kind,
    type: n.data.type,
    label: n.data.label || null,
    config: n.data.config || {},
    position: n.position,
  };
}
function toBackendEdge(e) {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle || null,
    targetHandle: e.targetHandle || null,
    label: e.label || null,
  };
}
