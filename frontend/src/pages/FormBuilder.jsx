import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "@/lib/api";
import FieldPalette from "@/components/builder/FieldPalette";
import FormCanvas from "@/components/builder/FormCanvas";
import PropertiesPanel from "@/components/builder/PropertiesPanel";
import FieldRenderer from "@/components/builder/FieldRenderer";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  ArrowLeft, Eye, Globe, Save, Share2, Smartphone, Tablet, Monitor, Copy, Sparkles
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";

export default function FormBuilderPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [form, setForm] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState("build");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [previewDevice, setPreviewDevice] = useState("desktop");
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef(null);

  useEffect(() => {
    api.get(`/forms/${id}`).then((r) => setForm(r.data)).catch(() => {
      toast.error("Form not found"); nav("/forms");
    });
    // eslint-disable-next-line
  }, [id]);

  // Autosave: debounce
  const save = useCallback(async (data) => {
    setSaving(true);
    try {
      const r = await api.put(`/forms/${id}`, {
        title: data.title, description: data.description, fields: data.fields,
        theme: data.theme || {}, settings: data.settings || {}, status: data.status,
      });
      setForm((prev) => ({ ...prev, ...r.data }));
    } catch (e) {
      toast.error("Save failed");
    } finally { setSaving(false); }
  }, [id]);

  const onUpdate = (next) => {
    setForm(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(next), 800);
  };

  const publish = async () => {
    if (!form.fields?.length) {
      toast.error("Add at least one field before publishing");
      return;
    }
    const updated = { ...form, status: "published" };
    setForm(updated);
    await save(updated);
    toast.success("Form published");
    setShareOpen(true);
  };

  const unpublish = async () => {
    const updated = { ...form, status: "draft" };
    setForm(updated);
    await save(updated);
    toast.success("Form set to draft");
  };

  const onQuickAdd = (type) => {
    const id_ = `f_${Math.random().toString(36).slice(2, 10)}`;
    const newField = makeField(type, id_);
    const next = { ...form, fields: [...(form.fields || []), newField] };
    onUpdate(next);
    setSelectedId(id_);
  };

  if (!form) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading…</div>;
  }

  const publicUrl = `${window.location.origin}/f/${form.slug}`;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top bar */}
      <header className="h-14 shrink-0 border-b border-slate-200 bg-white flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <Link to="/forms" data-testid="builder-back" className="p-2 rounded-md hover:bg-slate-100 text-slate-600"><ArrowLeft className="w-4 h-4" /></Link>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-blue-600 text-white flex items-center justify-center"><Sparkles className="w-3.5 h-3.5" /></div>
            <div className="font-heading font-semibold text-sm truncate max-w-xs">{form.title || "Untitled Form"}</div>
            <span className={`text-xs px-2 py-0.5 rounded-full ${form.status === "published" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{form.status}</span>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="build" data-testid="tab-build">Build</TabsTrigger>
            <TabsTrigger value="settings" data-testid="tab-settings">Settings</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 hidden sm:block">{saving ? "Saving…" : "Saved"}</span>
          <Button data-testid="preview-btn" variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
            <Eye className="w-4 h-4 mr-1.5" /> Preview
          </Button>
          <Button data-testid="share-btn" variant="outline" size="sm" onClick={() => setShareOpen(true)}>
            <Share2 className="w-4 h-4 mr-1.5" /> Share
          </Button>
          {form.status === "published" ? (
            <Button data-testid="unpublish-btn" variant="outline" size="sm" onClick={unpublish}>Unpublish</Button>
          ) : (
            <Button data-testid="publish-btn" size="sm" onClick={publish} className="bg-blue-600 hover:bg-blue-700">
              <Globe className="w-4 h-4 mr-1.5" /> Publish
            </Button>
          )}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {tab === "build" ? (
          <>
            <FieldPalette onQuickAdd={onQuickAdd} />
            <FormCanvas form={form} selectedId={selectedId} onSelect={setSelectedId} onUpdate={onUpdate} />
            <PropertiesPanel form={form} selectedId={selectedId} onUpdate={onUpdate} />
          </>
        ) : (
          <SettingsPanel form={form} onUpdate={onUpdate} />
        )}
      </div>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Preview</DialogTitle>
            <DialogDescription>See how your form looks across devices.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center gap-2 mb-3">
            {[["desktop", Monitor, "max-w-2xl"], ["tablet", Tablet, "max-w-md"], ["mobile", Smartphone, "max-w-xs"]].map(([k, Ic]) => (
              <Button key={k} variant={previewDevice === k ? "default" : "outline"} size="sm" onClick={() => setPreviewDevice(k)} data-testid={`device-${k}`}>
                <Ic className="w-4 h-4 mr-1.5" /> {k[0].toUpperCase() + k.slice(1)}
              </Button>
            ))}
          </div>
          <div className="bg-slate-100 p-6 rounded-xl">
            <div className={`mx-auto bg-white rounded-2xl card-soft p-6 ${previewDevice === "desktop" ? "max-w-2xl" : previewDevice === "tablet" ? "max-w-md" : "max-w-xs"}`}>
              <h2 className="text-2xl font-heading font-bold tracking-tight text-slate-900">{form.title}</h2>
              {form.description && <p className="text-sm text-slate-500 mt-1">{form.description}</p>}
              <div className="mt-5 space-y-5">
                {(form.fields || []).map((f) => <FieldRenderer key={f.id} field={f} mode="preview" />)}
                {form.fields?.length === 0 && <div className="text-sm text-slate-400">No fields yet.</div>}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Share Dialog */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Share your form</DialogTitle>
            <DialogDescription>Send the public link or embed it.</DialogDescription>
          </DialogHeader>
          {form.status !== "published" ? (
            <div className="text-sm text-slate-500">Publish the form first to share it publicly.</div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label className="text-xs">Public URL</Label>
                <div className="flex gap-2 mt-1">
                  <Input data-testid="share-url" readOnly value={publicUrl} />
                  <Button onClick={() => { navigator.clipboard.writeText(publicUrl); toast.success("Copied"); }}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div>
                <Label className="text-xs">Embed iframe</Label>
                <Textarea readOnly rows={3} className="font-mono text-xs"
                          value={`<iframe src="${publicUrl}" width="100%" height="800" frameborder="0"></iframe>`} />
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

function SettingsPanel({ form, onUpdate }) {
  const setSettings = (patch) => onUpdate({ ...form, settings: { ...(form.settings || {}), ...patch } });
  const s = form.settings || {};
  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 nice-scroll">
      <div className="max-w-3xl mx-auto my-8 px-4 space-y-6">
        <div className="bg-white rounded-2xl border border-slate-100 card-soft p-6">
          <h2 className="text-lg font-heading font-semibold tracking-tight mb-4">General</h2>
          <div className="space-y-4">
            <div>
              <Label>Form title</Label>
              <Input value={form.title || ""} onChange={(e) => onUpdate({ ...form, title: e.target.value })} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea rows={3} value={form.description || ""} onChange={(e) => onUpdate({ ...form, description: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 card-soft p-6">
          <h2 className="text-lg font-heading font-semibold tracking-tight mb-4">Submissions</h2>
          <div className="space-y-4">
            <Row label="Allow multiple submissions per user" desc="Users can submit this form more than once.">
              <Switch checked={s.allow_multiple ?? true} onCheckedChange={(v) => setSettings({ allow_multiple: v })} />
            </Row>
            <Row label="Show progress bar" desc="Display a top-of-form progress bar for long forms.">
              <Switch checked={!!s.show_progress} onCheckedChange={(v) => setSettings({ show_progress: v })} />
            </Row>
            <div>
              <Label>Thank-you message</Label>
              <Textarea rows={2} value={s.thank_you_message || ""} onChange={(e) => setSettings({ thank_you_message: e.target.value })} />
            </div>
            <div>
              <Label>Redirect URL (optional)</Label>
              <Input value={s.redirect_url || ""} placeholder="https://yourdomain.com/thanks" onChange={(e) => setSettings({ redirect_url: e.target.value })} />
            </div>
            <div>
              <Label>Submission limit (optional)</Label>
              <Input type="number" value={s.submission_limit ?? ""} onChange={(e) => setSettings({ submission_limit: e.target.value === "" ? null : Number(e.target.value) })} />
            </div>
            <div>
              <Label>Notify emails (comma-separated)</Label>
              <Input value={(s.notify_emails || []).join(", ")} placeholder="alice@example.com, bob@example.com"
                     onChange={(e) => setSettings({ notify_emails: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, desc, children }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-sm font-medium text-slate-700">{label}</div>
        {desc && <div className="text-xs text-slate-400">{desc}</div>}
      </div>
      {children}
    </div>
  );
}

function makeField(type, id) {
  const defaults = {
    short_text: { label: "Short Text" }, long_text: { label: "Long Text" }, number: { label: "Number" },
    email: { label: "Email", placeholder: "you@example.com" }, phone: { label: "Phone" }, date: { label: "Date" },
    time: { label: "Time" }, dropdown: { label: "Dropdown", options: ["Option A", "Option B"] },
    checkbox: { label: "Checkbox", options: ["Option A", "Option B"] },
    radio: { label: "Radio", options: ["Option A", "Option B"] }, file: { label: "Upload File" },
    url: { label: "Website", placeholder: "https://" }, rating: { label: "Rating" },
    heading: { label: "Heading", rich_text: "Section heading" },
    paragraph: { label: "Paragraph", rich_text: "Add a paragraph of helper text here." },
    divider: { label: "Divider" },
  }[type] || { label: type };
  return {
    id, type, label: defaults.label || "", placeholder: defaults.placeholder || "",
    description: "", required: false, read_only: false, default_value: null,
    options: defaults.options || [], validation: {}, width: "full", rich_text: defaults.rich_text || "",
  };
}
