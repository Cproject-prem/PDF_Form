import React, { useEffect, useRef, useState, useMemo } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogTrigger
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableDropdown } from "@/components/ui/SearchableDropdown";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import {
  Plus, Search, Star, MoreHorizontal, Copy, Archive, Trash2, ExternalLink,
  PieChart, Pencil, Globe, Circle, FileText, FileType2, UploadCloud, User as UserIcon,
  Share2, CheckCircle2, AlertTriangle, Building2,
} from "lucide-react";
import { formatDate } from "@/lib/utils2";

export default function FormsPage() {
  const { user: me } = useAuth();
  const canEditForms =
    ["super_admin", "admin"].includes(me?.role) || !!me?.access_override;
  const [forms, setForms] = useState([]);
  const [pdfTemplates, setPdfTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [archived, setArchived] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [pdfUploadOpen, setPdfUploadOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState(null); // { item, type: "pdf" | "form" }
  const [pdfTitle, setPdfTitle] = useState("");
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfUploading, setPdfUploading] = useState(false);
  const [autoDetect, setAutoDetect] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const fileInputRef = useRef(null);
  const nav = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const [a, b] = await Promise.all([
        api.get("/forms", { params: { archived, q: q || undefined } }),
        api.get("/pdf-forms", { params: { archived, q: q || undefined } }),
      ]);
      setForms(a.data);
      setPdfTemplates(b.data);
    } catch (e) { toast.error("Failed to load forms"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [archived]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [q]);

  const createForm = async () => {
    try {
      const r = await api.post("/forms", { title: newTitle || "Untitled Form", description: newDesc });
      toast.success("Form created");
      setCreateOpen(false); setNewTitle(""); setNewDesc("");
      nav(`/forms/${r.data.form_id}/build`);
    } catch (e) { toast.error("Could not create form"); }
  };

  const uploadPdf = async () => {
    if (!pdfFile) { toast.error("Choose a PDF file"); return; }
    if (!pdfFile.name.toLowerCase().endsWith(".pdf")) { toast.error("Only .pdf files are accepted"); return; }
    setPdfUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", pdfFile);
      if (pdfTitle) fd.append("title", pdfTitle);
      fd.append("auto_detect", autoDetect ? "true" : "false");
      const r = await api.post("/pdf-forms/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("PDF uploaded");
      setPdfUploadOpen(false); setPdfTitle(""); setPdfFile(null);
      nav(`/pdf-forms/${r.data.template_id}/build`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Upload failed");
    } finally { setPdfUploading(false); }
  };

  const toggleFav = async (f) => {
    await api.patch(`/forms/${f.form_id}`, { is_favorite: !f.is_favorite });
    load();
  };
  const duplicate = async (f) => {
    await api.post(`/forms/${f.form_id}/duplicate`);
    toast.success("Duplicated");
    load();
  };
  const archive = async (f) => {
    await api.patch(`/forms/${f.form_id}`, { is_archived: !f.is_archived });
    toast.success(f.is_archived ? "Restored" : "Archived");
    load();
  };
  const del = async (f) => {
    if (!confirm(`Delete "${f.title}"? This cannot be undone.`)) return;
    await api.delete(`/forms/${f.form_id}`);
    toast.success("Deleted");
    load();
  };

  // PDF template actions
  const pdfDuplicate = async (t) => {
    await api.post(`/pdf-forms/${t.template_id}/duplicate`);
    toast.success("Duplicated"); load();
  };
  const pdfArchive = async (t) => {
    await api.patch(`/pdf-forms/${t.template_id}`, { is_archived: !t.is_archived });
    toast.success(t.is_archived ? "Restored" : "Archived"); load();
  };
  const pdfDelete = async (t) => {
    if (!confirm(`Delete "${t.title}"? This cannot be undone.`)) return;
    await api.delete(`/pdf-forms/${t.template_id}`);
    toast.success("Deleted"); load();
  };

  return (
    <AppLayout>
      <div className="max-w-7xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl sm:text-4xl font-heading font-bold tracking-tight text-slate-900">My Forms</h1>
            <p className="text-slate-500 mt-1">Create, manage and share your forms.</p>
          </div>
          <Dialog open={chooserOpen} onOpenChange={setChooserOpen}>
            <DialogTrigger asChild>
              <Button
                data-testid="create-form-btn"
                className="bg-blue-600 hover:bg-blue-700 rounded-lg h-10"
                disabled={!canEditForms}
                style={!canEditForms ? { display: "none" } : undefined}
              >
                <Plus className="w-4 h-4 mr-2" /> Create New Form
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create new form</DialogTitle>
                <DialogDescription>Choose how you'd like to start.</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                <button
                  data-testid="create-blank-card"
                  onClick={() => { setChooserOpen(false); setCreateOpen(true); }}
                  className="group text-left p-6 rounded-2xl border-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50/40 transition-all bg-white"
                >
                  <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div className="font-heading font-semibold text-slate-900 text-lg">Create Blank Form</div>
                  <div className="text-sm text-slate-500 mt-1">Start from scratch with the drag-and-drop builder.</div>
                </button>
                <button
                  data-testid="create-pdf-card"
                  onClick={() => { setChooserOpen(false); setPdfUploadOpen(true); }}
                  className="group text-left p-6 rounded-2xl border-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50/40 transition-all bg-white"
                >
                  <div className="w-12 h-12 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                    <FileType2 className="w-6 h-6" />
                  </div>
                  <div className="font-heading font-semibold text-slate-900 text-lg">Create Form from PDF</div>
                  <div className="text-sm text-slate-500 mt-1">Upload a PDF and place form fields directly on top.</div>
                </button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create blank form</DialogTitle>
                <DialogDescription>Start from a blank form. You can add fields next.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="title">Title</Label>
                  <Input id="title" data-testid="new-form-title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Customer feedback" />
                </div>
                <div>
                  <Label htmlFor="desc">Description (optional)</Label>
                  <Textarea id="desc" data-testid="new-form-desc" rows={3} value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button data-testid="create-form-confirm" onClick={createForm} className="bg-blue-600 hover:bg-blue-700">Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={pdfUploadOpen} onOpenChange={setPdfUploadOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Upload PDF</DialogTitle>
                <DialogDescription>Drop a PDF and we'll let you place fields directly on it.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="pdf-title">Title (optional)</Label>
                  <Input id="pdf-title" data-testid="pdf-title" value={pdfTitle} onChange={(e) => setPdfTitle(e.target.value)} placeholder="e.g. Employment Application" />
                </div>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files?.[0];
                    if (f) setPdfFile(f);
                  }}
                  data-testid="pdf-dropzone"
                  className="border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-2xl p-8 text-center cursor-pointer bg-slate-50/50"
                >
                  <UploadCloud className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                  <div className="text-sm font-medium text-slate-700">{pdfFile ? pdfFile.name : "Click or drop a PDF here"}</div>
                  <div className="text-xs text-slate-400 mt-1">PDF only · up to 50 MB</div>
                  <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" className="hidden"
                         data-testid="pdf-file-input"
                         onChange={(e) => setPdfFile(e.target.files?.[0] || null)} />
                </div>
                
                <div className="flex items-start space-x-2 mt-4 p-3 bg-blue-50/50 rounded-lg border border-blue-100">
                  <input 
                    type="checkbox" 
                    id="auto-detect" 
                    checked={autoDetect} 
                    onChange={(e) => setAutoDetect(e.target.checked)}
                    className="mt-1"
                  />
                  <div>
                    <label htmlFor="auto-detect" className="text-sm font-medium text-slate-800 cursor-pointer">
                      Auto-Detect Fields (AI)
                    </label>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Automatically place fields over placeholders like <code className="bg-white px-1 rounded">{"{{dropdown}}"}</code> or <code className="bg-white px-1 rounded">{"{{signature}}"}</code> in your PDF.
                    </p>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPdfUploadOpen(false)}>Cancel</Button>
                <Button data-testid="pdf-upload-confirm" disabled={!pdfFile || pdfUploading} onClick={uploadPdf}
                        className="bg-blue-600 hover:bg-blue-700">
                  {pdfUploading ? "Uploading…" : "Upload & Open Editor"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input data-testid="forms-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search forms…" className="pl-10 h-10 bg-white border-slate-200" />
          </div>
          <div className="inline-flex rounded-lg bg-white border border-slate-200 p-1">
            <button data-testid="filter-active" onClick={() => setArchived(false)} className={`px-3 py-1.5 text-sm rounded-md transition-colors ${!archived ? "bg-slate-900 text-white" : "text-slate-600"}`}>Active</button>
            <button data-testid="filter-archived" onClick={() => setArchived(true)} className={`px-3 py-1.5 text-sm rounded-md transition-colors ${archived ? "bg-slate-900 text-white" : "text-slate-600"}`}>Archived</button>
          </div>
        </div>

        {loading ? (
          <div className="text-slate-400">Loading…</div>
        ) : (forms.length === 0 && pdfTemplates.length === 0) ? (
          <Card className="p-12 text-center rounded-2xl border-dashed border-slate-200 card-soft">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
              <PieChart className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-heading font-semibold">No forms yet</h3>
            <p className="text-sm text-slate-500 mt-1">Create your first form to start collecting submissions.</p>
            <Button data-testid="empty-create-btn" onClick={() => setChooserOpen(true)} disabled={!canEditForms} style={!canEditForms ? { display: "none" } : undefined} className="mt-4 bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" /> Create New Form
            </Button>
          </Card>
        ) : (
          <div className="space-y-10">
            {pdfTemplates.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <FileType2 className="w-4 h-4 text-violet-600" />
                  <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-slate-500">PDF Forms</h2>
                  <span className="text-xs text-slate-400">{pdfTemplates.length}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                  {pdfTemplates.map((t) => (
                    <Card key={t.template_id} data-testid={`pdf-card-${t.template_id}`}
                          className="p-5 rounded-2xl border-slate-100 card-soft card-hover transition-all duration-200 bg-white">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full bg-violet-100 text-violet-700">
                            <FileType2 className="w-3 h-3" /> PDF
                          </span>
                          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full ${
                            t.status === "published" ? "bg-emerald-50 text-emerald-700"
                              : t.status === "archived" ? "bg-slate-100 text-slate-600"
                              : "bg-amber-50 text-amber-700"}`}>
                            <Circle className="w-2 h-2 fill-current" /> {t.status}
                          </span>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger className="p-1 rounded-md hover:bg-slate-100"><MoreHorizontal className="w-4 h-4 text-slate-500" /></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {canEditForms && (
                              <DropdownMenuItem onClick={() => nav(`/pdf-forms/${t.template_id}/build`)}><Pencil className="w-4 h-4 mr-2" /> Edit</DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => nav(`/pdf-forms/${t.template_id}/submissions`)}><PieChart className="w-4 h-4 mr-2" /> Submissions</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setShareTarget({ item: t, type: "pdf" })}><Share2 className="w-4 h-4 mr-2 text-blue-600" /> Share &amp; Plant Override</DropdownMenuItem>
                            {canEditForms && (
                              <>
                                <DropdownMenuItem onClick={() => pdfDuplicate(t)}><Copy className="w-4 h-4 mr-2" /> Duplicate</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => pdfArchive(t)}><Archive className="w-4 h-4 mr-2" /> {t.is_archived ? "Restore" : "Archive"}</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => pdfDelete(t)} className="text-red-600"><Trash2 className="w-4 h-4 mr-2" /> Delete</DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <h3 className="font-heading font-semibold text-lg text-slate-900 line-clamp-1">{t.title}</h3>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-1">{t.original_filename}</p>
                      <div className="flex items-center gap-2 text-xs text-slate-400 mt-3">
                        <span>{(t.pages || []).length} pages</span>
                        <span>·</span>
                        <span>{(t.fields || []).length} fields</span>
                        <span>·</span>
                        <span>Updated {formatDate(t.updated_at)}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-4">
                        {canEditForms && (
                          <Button data-testid={`pdf-edit-${t.template_id}`} variant="outline" className="flex-1 h-9" onClick={() => nav(`/pdf-forms/${t.template_id}/build`)}>
                            <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
                          </Button>
                        )}
                        <Button data-testid={`pdf-subs-${t.template_id}`} variant="outline" className="flex-1 h-9" onClick={() => nav(`/pdf-forms/${t.template_id}/submissions`)}>
                          <PieChart className="w-3.5 h-3.5 mr-1.5" /> Subs
                        </Button>
                        <Button variant="outline" className="h-9 px-3" onClick={() => setShareTarget({ item: t, type: "pdf" })} title="Share Options & Plant Override">
                          <Share2 className="w-3.5 h-3.5 text-blue-600" />
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              </section>
            )}

            {forms.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="w-4 h-4 text-blue-600" />
                  <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-slate-500">Standard Forms</h2>
                  <span className="text-xs text-slate-400">{forms.length}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                  {forms.map((f) => (
              <Card key={f.form_id} data-testid={`form-card-${f.form_id}`}
                    className="p-5 rounded-2xl border-slate-100 card-soft card-hover transition-all duration-200 bg-white">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full ${
                      f.status === "published" ? "bg-emerald-50 text-emerald-700"
                      : f.status === "archived" ? "bg-slate-100 text-slate-600"
                      : "bg-amber-50 text-amber-700"}`}>
                      <Circle className="w-2 h-2 fill-current" /> {f.status}
                    </span>
                    {f.is_favorite && <Star className="w-4 h-4 text-amber-500 fill-amber-400" />}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="p-1 rounded-md hover:bg-slate-100"><MoreHorizontal className="w-4 h-4 text-slate-500" /></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {canEditForms && (
                        <DropdownMenuItem onClick={() => nav(`/forms/${f.form_id}/build`)}><Pencil className="w-4 h-4 mr-2" /> Edit</DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => nav(`/forms/${f.form_id}/submissions`)}><PieChart className="w-4 h-4 mr-2" /> Submissions</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShareTarget({ item: f, type: "form" })}><Share2 className="w-4 h-4 mr-2 text-blue-600" /> Share &amp; Plant Override</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => toggleFav(f)}><Star className="w-4 h-4 mr-2" /> {f.is_favorite ? "Unfavorite" : "Favorite"}</DropdownMenuItem>
                      {canEditForms && (
                        <>
                          <DropdownMenuItem onClick={() => duplicate(f)}><Copy className="w-4 h-4 mr-2" /> Duplicate</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => archive(f)}><Archive className="w-4 h-4 mr-2" /> {f.is_archived ? "Restore" : "Archive"}</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => del(f)} className="text-red-600"><Trash2 className="w-4 h-4 mr-2" /> Delete</DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <h3 className="font-heading font-semibold text-lg text-slate-900 line-clamp-1">{f.title}</h3>
                <p className="text-sm text-slate-500 mt-1 line-clamp-2 min-h-[40px]">{f.description || "No description"}</p>
                <div className="flex items-center gap-2 text-xs text-slate-400 mt-3 flex-wrap">
                  <span>{(f.fields || []).length} fields</span>
                  <span>·</span>
                  <span>Updated {formatDate(f.updated_at)}</span>
                  {(f.owner_name || f.owner_email) && (
                    <>
                      <span>·</span>
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-600"
                        title={`Created by ${f.owner_name || f.owner_email}`}
                        data-testid={`form-owner-${f.form_id}`}
                      >
                        <UserIcon className="w-3 h-3" />
                        {f.owner_name || f.owner_email}
                      </span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-4">
                  {canEditForms && (
                    <Button data-testid={`edit-${f.form_id}`} variant="outline" className="flex-1 h-9" onClick={() => nav(`/forms/${f.form_id}/build`)}>
                      <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
                    </Button>
                  )}
                  <Button data-testid={`view-subs-${f.form_id}`} variant="outline" className="flex-1 h-9" onClick={() => nav(`/forms/${f.form_id}/submissions`)}>
                    <PieChart className="w-3.5 h-3.5 mr-1.5" /> Subs
                  </Button>
                  <Button variant="outline" className="h-9 px-3" onClick={() => setShareTarget({ item: f, type: "form" })} title="Share Options & Plant Override">
                    <Share2 className="w-3.5 h-3.5 text-blue-600" />
                  </Button>
                </div>
              </Card>
            ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      <ShareFormModal
        item={shareTarget?.item}
        type={shareTarget?.type}
        open={!!shareTarget}
        onOpenChange={(v) => !v && setShareTarget(null)}
      />
    </AppLayout>
  );
}

/* ---------------- Share & Plant Override Modal ---------------- */
function ShareFormModal({ item, type, open, onOpenChange }) {
  const [selectedPlant, setSelectedPlant] = useState("");
  const [sites, setSites] = useState([]);
  const [loadingSites, setLoadingSites] = useState(false);

  useEffect(() => {
    if (open) {
      setLoadingSites(true);
      api.get("/sites")
        .then((r) => setSites(r.data || []))
        .catch(() => setSites([]))
        .finally(() => setLoadingSites(false));
    } else {
      setSelectedPlant("");
    }
  }, [open]);

  // Check if form has any field mapped to site_name
  const siteField = useMemo(() => {
    const fields = item?.fields || [];
    const SITE_KEYS = ["site_name", "plant_name", "site_code", "asset_id", "site", "plant"];
    return fields.find(f => {
      const lbl = (f.label || "").toLowerCase().trim();
      const name = (f.name || f.id || "").toLowerCase().trim();
      return SITE_KEYS.includes(lbl) || SITE_KEYS.includes(name) || f.is_site_name === true;
    });
  }, [item]);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const rawPath = type === "pdf" ? `/p/${item?.slug || item?.template_id}` : `/f/${item?.slug || item?.form_id}`;

  const shareUrl = useMemo(() => {
    let url = `${baseUrl}${rawPath}`;
    if (selectedPlant) {
      url += `?site_name=${encodeURIComponent(selectedPlant)}`;
    }
    return url;
  }, [baseUrl, rawPath, selectedPlant]);

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    toast.success("Share link copied to clipboard!");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
            <Share2 className="w-5 h-5 text-blue-600" />
            Share &amp; Plant Options — {item?.title}
          </DialogTitle>
          <DialogDescription>
            Configure public share link and plant binding for this {type === "pdf" ? "PDF Form" : "Standard Form"}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Site Field Status Badge */}
          {siteField ? (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center gap-2.5 text-xs text-emerald-800 dark:text-emerald-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div>
                <span className="font-bold">Compulsory site_name Field Present:</span> Form contains field <code className="bg-emerald-100 dark:bg-emerald-900 px-1 py-0.5 rounded font-mono font-bold text-emerald-900 dark:text-emerald-100">{siteField.label || siteField.name || siteField.id}</code>.
              </div>
            </div>
          ) : (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/80 border border-amber-200 dark:border-amber-800 rounded-xl flex items-center gap-2.5 text-xs text-amber-800 dark:text-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <div>
                <span className="font-bold">No site_name field in schema:</span> Select a plant below to override and bind form submissions to a specific plant.
              </div>
            </div>
          )}

          {/* Plant Override Section */}
          <div className="space-y-2 p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-blue-600" />
                <span>Override Plant for Respective Form</span>
              </Label>
              {selectedPlant && (
                <span className="text-[10px] bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200 px-1.5 py-0.5 rounded font-bold">OVERRIDE ACTIVE</span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Select a plant to override submission binding for this form link.
            </p>
            <div className="pt-1">
              <SearchableDropdown
                options={sites.map((s) => ({ label: `${s.site_name || s.site_code} (${s.region || "No Region"})`, value: s.site_name || s.site_code }))}
                value={selectedPlant}
                onChange={setSelectedPlant}
                placeholder="Select Plant / Site to override..."
                className="h-9 text-xs"
              />
            </div>
          </div>

          {/* Generated Share Link Box */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Public Share URL</Label>
            <div className="flex gap-2">
              <Input value={shareUrl} readOnly className="text-xs h-9 font-mono bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-100" />
              <Button size="sm" onClick={copyLink} className="h-9 px-3 bg-blue-600 hover:bg-blue-700 text-white shrink-0">
                <Copy className="w-3.5 h-3.5 mr-1" /> Copy
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => window.open(shareUrl, "_blank")} className="h-9 text-xs">
            <Globe className="w-3.5 h-3.5 mr-1" /> Open Form
          </Button>
          <Button onClick={() => onOpenChange(false)} className="h-9 text-xs bg-slate-900 dark:bg-slate-800 text-white">
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
