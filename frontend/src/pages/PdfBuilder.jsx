import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, API } from "@/lib/api";
import PdfFieldPalette from "@/components/pdfbuilder/PdfFieldPalette";
import PdfCanvas from "@/components/pdfbuilder/PdfCanvas";
import PdfThumbnails from "@/components/pdfbuilder/PdfThumbnails";
import PdfProperties from "@/components/pdfbuilder/PdfProperties";
import PdfFiller from "@/components/pdfbuilder/PdfFiller";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { QRCodeCanvas } from "qrcode.react";
import { makePdfField } from "@/lib/pdfFieldTypes";
import {
  ArrowLeft, Sparkles, Eye, Globe, Share2, Copy, ZoomIn, ZoomOut, Maximize2,
  Maximize, RotateCw, Undo2, Redo2, Grid3X3, Ruler, Save, Download, Upload, FileJson,
} from "lucide-react";

const MAX_HIST = 50;

export default function PdfBuilderPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [tpl, setTpl] = useState(null);
  const [zoom, setZoom] = useState(1.25);
  const [rotation, setRotation] = useState(0);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [selectedId, setSelectedId] = useState(null);
  const [showGrid, setShowGrid] = useState(false);
  const [snap, setSnap] = useState(true);
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [previewValues, setPreviewValues] = useState({});
  const saveTimer = useRef(null);
  const pageRefs = useRef({});

  const fileUrl = useMemo(
    () => tpl ? `${API}/pdf-forms/${tpl.template_id}/file` : null, [tpl]
  );

  useEffect(() => {
    api.get(`/pdf-forms/${id}`).then((r) => setTpl(r.data)).catch(() => {
      toast.error("Template not found"); nav("/forms");
    });
    // eslint-disable-next-line
  }, [id]);

  // ---------- save & history -----------------------------------------------
  const save = useCallback(async (next) => {
    setSaving(true);
    try {
      const r = await api.put(`/pdf-forms/${id}`, {
        title: next.title, description: next.description, fields: next.fields,
        settings: next.settings || {}, status: next.status, pages: next.pages || [],
        version: next.version || 1,
      });
      setTpl((prev) => ({ ...prev, ...r.data }));
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally { setSaving(false); }
  }, [id]);

  const pushHistory = (snapshot) => {
    setHistory((h) => [...h.slice(-MAX_HIST + 1), snapshot]);
    setFuture([]);
  };

  const update = (next, { commit = true, record = true } = {}) => {
    setTpl((prev) => {
      if (record && prev) pushHistory({ fields: prev.fields, title: prev.title });
      return next;
    });
    if (commit) {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => save(next), 600);
    }
  };

  const undo = () => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const last = h[h.length - 1];
      setFuture((f) => [{ fields: tpl.fields, title: tpl.title }, ...f]);
      const next = { ...tpl, ...last };
      setTpl(next);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => save(next), 400);
      return h.slice(0, -1);
    });
  };
  const redo = () => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const first = f[0];
      setHistory((h) => [...h, { fields: tpl.fields, title: tpl.title }]);
      const next = { ...tpl, ...first };
      setTpl(next);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => save(next), 400);
      return f.slice(1);
    });
  };

  // ---------- field operations --------------------------------------------
  const onAddField = (type, p, x, y) => {
    const f = makePdfField(type, p, x, y);
    update({ ...tpl, fields: [...(tpl.fields || []), f] });
    setSelectedId(f.id);
  };
  const onPaletteAdd = (type) => {
    onAddField(type, page, 0.1, 0.1);
  };
  const onFieldChange = (fid, patch) => {
    const next = { ...tpl, fields: tpl.fields.map((f) => f.id === fid ? { ...f, ...patch } : f) };
    update(next);
  };
  const onDuplicate = (fid) => {
    const f = tpl.fields.find((x) => x.id === fid);
    if (!f) return;
    const copy = { ...f, id: `pf_${Math.random().toString(36).slice(2, 10)}`,
                   x: Math.min(0.95, f.x + 0.02), y: Math.min(0.95, f.y + 0.02) };
    update({ ...tpl, fields: [...tpl.fields, copy] });
    setSelectedId(copy.id);
  };
  const onDelete = (fid) => {
    update({ ...tpl, fields: tpl.fields.filter((f) => f.id !== fid) });
    if (selectedId === fid) setSelectedId(null);
  };
  const onZ = (fid, dir) => {
    const next = tpl.fields.map((f) => f.id === fid ? { ...f, z_index: (f.z_index || 0) + dir } : f);
    update({ ...tpl, fields: next });
  };
  const onLock = (fid) => onFieldChange(fid, { locked: !tpl.fields.find((f) => f.id === fid)?.locked });
  const onVisible = (fid) => onFieldChange(fid, { visible: !tpl.fields.find((f) => f.id === fid)?.visible });

  // ---------- keyboard shortcuts ------------------------------------------
  useEffect(() => {
    const onKey = (e) => {
      // skip when typing in inputs
      const tag = (e.target?.tagName || "").toLowerCase();
      if (["input", "textarea", "select"].includes(tag) || e.target?.isContentEditable) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); undo(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.shiftKey && e.key === "Z"))) { e.preventDefault(); redo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === "d" && selectedId) { e.preventDefault(); onDuplicate(selectedId); return; }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) { e.preventDefault(); onDelete(selectedId); return; }
      if (!selectedId) return;
      const step = e.shiftKey ? 0.01 : 0.002;
      const f = tpl?.fields?.find((x) => x.id === selectedId);
      if (!f) return;
      let patch;
      if (e.key === "ArrowLeft")  patch = { x: Math.max(0, f.x - step) };
      else if (e.key === "ArrowRight") patch = { x: Math.min(1 - f.width, f.x + step) };
      else if (e.key === "ArrowUp")   patch = { y: Math.max(0, f.y - step) };
      else if (e.key === "ArrowDown") patch = { y: Math.min(1 - f.height, f.y + step) };
      if (patch) { e.preventDefault(); onFieldChange(selectedId, patch); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line
  }, [tpl, selectedId]);

  // ---------- publish / preview / share -----------------------------------
  const publish = async () => {
    if (!(tpl.fields || []).length) { toast.error("Add at least one field"); return; }
    const next = { ...tpl, status: "published" };
    setTpl(next); await save(next);
    toast.success("Published"); setShareOpen(true);
  };
  const unpublish = async () => {
    const next = { ...tpl, status: "draft" };
    setTpl(next); await save(next); toast.success("Set to draft");
  };
  const publicUrl = useMemo(() => tpl ? `${window.location.origin}/p/${tpl.slug}` : "", [tpl]);

  // ---------- import / export template ------------------------------------
  const exportJson = () => {
    if (!tpl) return;
    const data = {
      title: tpl.title, description: tpl.description,
      fields: tpl.fields, settings: tpl.settings, version: tpl.version,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${tpl.slug}.json`; a.click();
    URL.revokeObjectURL(url);
  };
  const importJson = async (file) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data.fields)) throw new Error("Invalid template");
      const next = { ...tpl, fields: data.fields, settings: data.settings || tpl.settings, title: data.title || tpl.title };
      update(next);
      toast.success("Template imported");
    } catch (e) {
      toast.error("Invalid JSON template");
    }
  };

  // ---------- zoom modes --------------------------------------------------
  const fitWidth = () => setZoom(1.5);
  const fitPage = () => setZoom(1.0);

  // ---------- jump-to-page ------------------------------------------------
  const jumpTo = (p) => {
    setPage(p); setPageInput(String(p));
    const el = pageRefs.current[p];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (!tpl) return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading…</div>;
  const selected = tpl.fields.find((f) => f.id === selectedId) || null;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* top bar */}
      <header className="h-14 shrink-0 border-b border-slate-200 bg-white flex items-center justify-between px-3 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Link to="/forms" data-testid="pdf-back" className="p-2 rounded-md hover:bg-slate-100 text-slate-600"><ArrowLeft className="w-4 h-4" /></Link>
          <div className="w-7 h-7 rounded-md bg-violet-600 text-white flex items-center justify-center"><Sparkles className="w-3.5 h-3.5" /></div>
          <Input
            data-testid="pdf-title-input"
            value={tpl.title}
            onChange={(e) => update({ ...tpl, title: e.target.value })}
            className="h-8 w-56 font-heading text-sm"
          />
          <span className={`text-xs px-2 py-0.5 rounded-full ${tpl.status === "published" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{tpl.status}</span>
        </div>

        {/* toolbar */}
        <div className="flex items-center gap-1">
          <ToolbarBtn testid="tb-undo" title="Undo" onClick={undo}><Undo2 className="w-4 h-4" /></ToolbarBtn>
          <ToolbarBtn testid="tb-redo" title="Redo" onClick={redo}><Redo2 className="w-4 h-4" /></ToolbarBtn>
          <div className="mx-1 w-px h-5 bg-slate-200" />
          <ToolbarBtn testid="tb-zoom-out" title="Zoom out" onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(2)))}><ZoomOut className="w-4 h-4" /></ToolbarBtn>
          <span className="text-xs text-slate-500 w-12 text-center" data-testid="tb-zoom-label">{Math.round(zoom * 100)}%</span>
          <ToolbarBtn testid="tb-zoom-in" title="Zoom in" onClick={() => setZoom((z) => Math.min(3, +(z + 0.1).toFixed(2)))}><ZoomIn className="w-4 h-4" /></ToolbarBtn>
          <ToolbarBtn testid="tb-fit-width" title="Fit width" onClick={fitWidth}><Maximize2 className="w-4 h-4" /></ToolbarBtn>
          <ToolbarBtn testid="tb-fit-page" title="Fit page" onClick={fitPage}><Maximize className="w-4 h-4" /></ToolbarBtn>
          <ToolbarBtn testid="tb-rotate" title="Rotate" onClick={() => setRotation((r) => (r + 90) % 360)}><RotateCw className="w-4 h-4" /></ToolbarBtn>
          <div className="mx-1 w-px h-5 bg-slate-200" />
          <ToolbarBtn testid="tb-grid" title="Grid" active={showGrid} onClick={() => setShowGrid((g) => !g)}><Grid3X3 className="w-4 h-4" /></ToolbarBtn>
          <ToolbarBtn testid="tb-snap" title="Snap to grid" active={snap} onClick={() => setSnap((s) => !s)}><Ruler className="w-4 h-4" /></ToolbarBtn>
          <div className="mx-1 w-px h-5 bg-slate-200" />
          <form onSubmit={(e) => { e.preventDefault(); const p = Math.max(1, Math.min((tpl.pages || []).length || 1, Number(pageInput) || 1)); jumpTo(p); }}
                className="flex items-center gap-1">
            <Input data-testid="tb-page-input" value={pageInput} onChange={(e) => setPageInput(e.target.value)}
                   className="h-7 w-12 text-center text-xs" />
            <span className="text-xs text-slate-400">/ {(tpl.pages || []).length}</span>
          </form>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 hidden sm:block">{saving ? "Saving…" : "Saved"}</span>
          <ToolbarBtn testid="tb-export" title="Export JSON" onClick={exportJson}><FileJson className="w-4 h-4" /></ToolbarBtn>
          <label className="p-2 rounded-md hover:bg-slate-100 text-slate-600 cursor-pointer" title="Import JSON">
            <Upload className="w-4 h-4" />
            <input type="file" accept="application/json" className="hidden" data-testid="tb-import"
                   onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
          </label>
          <a className="p-2 rounded-md hover:bg-slate-100 text-slate-600" title="Download original PDF"
             href={`${API}/pdf-forms/${tpl.template_id}/file`} target="_blank" rel="noreferrer">
            <Download className="w-4 h-4" />
          </a>
          <Button data-testid="pdf-preview-btn" variant="outline" size="sm" onClick={() => { setPreviewValues({}); setPreviewOpen(true); }}>
            <Eye className="w-4 h-4 mr-1.5" /> Preview
          </Button>
          <Button data-testid="pdf-share-btn" variant="outline" size="sm" onClick={() => setShareOpen(true)}>
            <Share2 className="w-4 h-4 mr-1.5" /> Share
          </Button>
          {tpl.status === "published" ? (
            <Button data-testid="pdf-unpublish-btn" variant="outline" size="sm" onClick={unpublish}>Unpublish</Button>
          ) : (
            <Button data-testid="pdf-publish-btn" size="sm" onClick={publish} className="bg-blue-600 hover:bg-blue-700">
              <Globe className="w-4 h-4 mr-1.5" /> Publish
            </Button>
          )}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <PdfFieldPalette onPick={onPaletteAdd} />
        <PdfThumbnails fileUrl={fileUrl} currentPage={page} onJump={jumpTo} />
        <PdfCanvas
          fileUrl={fileUrl}
          fields={tpl.fields}
          pages={tpl.pages}
          zoom={zoom}
          rotation={rotation}
          selectedId={selectedId}
          showGrid={showGrid}
          snapToGrid={snap}
          onSelect={setSelectedId}
          onFieldChange={onFieldChange}
          onAddField={onAddField}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          registerPageRef={(p, ref) => { pageRefs.current[p] = ref; }}
        />
        <PdfProperties
          field={selected}
          fields={tpl.fields}
          onChange={onFieldChange}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onZ={onZ}
          onLock={onLock}
          onVisible={onVisible}
        />
      </div>

      {/* Preview */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-5xl h-[88vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Preview</DialogTitle>
            <DialogDescription>This is how the form looks to people filling it out.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-hidden -mx-6 -mb-6 mt-2 rounded-b-2xl">
            <PdfFiller fileUrl={fileUrl} fields={tpl.fields} values={previewValues} onChange={setPreviewValues} />
          </div>
        </DialogContent>
      </Dialog>

      {/* Share */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Share your PDF form</DialogTitle>
            <DialogDescription>Send the public link or embed it.</DialogDescription>
          </DialogHeader>
          {tpl.status !== "published" ? (
            <div className="text-sm text-slate-500">Publish the form first to share it publicly.</div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label className="text-xs">Public URL</Label>
                <div className="flex gap-2 mt-1">
                  <Input data-testid="pdf-share-url" readOnly value={publicUrl} />
                  <Button onClick={() => { navigator.clipboard.writeText(publicUrl); toast.success("Copied"); }}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div>
                <Label className="text-xs">Embed iframe</Label>
                <Textarea readOnly rows={3} className="font-mono text-xs"
                          value={`<iframe src="${publicUrl}" width="100%" height="900" frameborder="0"></iframe>`} />
              </div>
              <div className="flex justify-center bg-slate-50 rounded-xl p-4">
                <QRCodeCanvas value={publicUrl} size={160} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ToolbarBtn({ children, onClick, title, testid, active }) {
  return (
    <button
      data-testid={testid}
      title={title}
      onClick={onClick}
      className={`p-2 rounded-md transition-colors ${active ? "bg-blue-100 text-blue-700" : "text-slate-600 hover:bg-slate-100"}`}
    >
      {children}
    </button>
  );
}
