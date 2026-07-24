import React, { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils2";
import { Upload, Folder, Plus, Archive, DownloadCloud, RotateCcw, Trash2 } from "lucide-react";

export default function SettingsPage() {
  const { reloadBranding } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    api.get("/settings").then((r) => setData(r.data)).catch(() => setData(null)).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.put("/settings", data);
      setData(r.data);
      toast.success("Settings saved");
      reloadBranding && reloadBranding();
    } catch (e) { void e; toast.error("Save failed"); }
    finally { setSaving(false); }
  };

  const uploadLogo = async (file) => {
    if (!file) return;
    setUploadingLogo(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await api.post("/settings/logo", form,
        { headers: { "Content-Type": "multipart/form-data" } });
      setData((d) => ({ ...d, company_logo_url: r.data.logo_url }));
      reloadBranding && reloadBranding();
      toast.success("Logo uploaded");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Upload failed");
    } finally { setUploadingLogo(false); }
  };

  if (loading || !data) return <AppLayout><div className="text-slate-400">Loading…</div></AppLayout>;

  const updSmtp = (patch) => setData({ ...data, smtp: { ...data.smtp, ...patch } });

  return (
    <AppLayout>
      <div className="max-w-3xl">
        <h1 className="text-3xl sm:text-4xl font-heading font-bold tracking-tight">Settings</h1>
        <p className="text-slate-500 mt-1">Configure your workspace.</p>

        <Card className="mt-6 p-6 rounded-2xl border-slate-100 card-soft space-y-4">
          <div>
            <h2 className="text-lg font-heading font-semibold">Workspace branding</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Shown on the sidebar, browser tab and login screen. Public — visitors see it before signing in.
            </p>
          </div>

          <div>
            <Label>App name</Label>
            <Input
              value={data.company_name}
              onChange={(e) => setData({ ...data, company_name: e.target.value })}
              placeholder="FormForge"
              data-testid="settings-company"
            />
          </div>

          <div>
            <Label>Logo</Label>
            <div className="mt-2 flex items-start gap-4">
              {data.company_logo_url ? (
                <img
                  src={data.company_logo_url.startsWith("http")
                    ? data.company_logo_url
                    : `${process.env.REACT_APP_BACKEND_URL || ""}${data.company_logo_url}`}
                  alt="logo preview"
                  className="w-16 h-16 rounded-lg object-contain border border-slate-200 bg-slate-50"
                  data-testid="settings-logo-preview"
                />
              ) : (
                <div className="w-16 h-16 rounded-lg border border-dashed border-slate-300 flex items-center justify-center text-slate-400 text-xs">
                  No logo
                </div>
              )}
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <label
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-slate-200 cursor-pointer hover:bg-slate-50"
                    data-testid="settings-logo-upload"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {uploadingLogo ? "Uploading…" : "Upload image"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => uploadLogo(e.target.files?.[0])}
                    />
                  </label>
                  {data.company_logo_url && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setData({ ...data, company_logo_url: "" })}
                      className="text-xs text-red-600 hover:bg-red-50"
                      data-testid="settings-logo-clear"
                    >Remove</Button>
                  )}
                </div>
                <div className="text-xs text-slate-400">— or paste a URL —</div>
                <Input
                  value={data.company_logo_url}
                  onChange={(e) => setData({ ...data, company_logo_url: e.target.value })}
                  placeholder="https://example.com/logo.png"
                  data-testid="settings-logo-url"
                />
              </div>
            </div>
          </div>

          <div>
            <Label>Primary color</Label>
            <div className="flex items-center gap-2">
              <Input value={data.primary_color} onChange={(e) => setData({ ...data, primary_color: e.target.value })} className="max-w-[160px]" />
              <div className="w-8 h-8 rounded-md border border-slate-200" style={{ background: data.primary_color }} />
            </div>
          </div>
        </Card>

        <Card className="mt-6 p-6 rounded-2xl border-slate-100 card-soft space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-heading font-semibold">SMTP Email</h2>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-slate-500">Enabled</Label>
              <Switch checked={data.smtp?.enabled} onCheckedChange={(v) => updSmtp({ enabled: v })} data-testid="smtp-enabled" />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div><Label>Host</Label><Input value={data.smtp?.host || ""} onChange={(e) => updSmtp({ host: e.target.value })} placeholder="smtp.gmail.com" /></div>
            <div><Label>Port</Label><Input type="number" value={data.smtp?.port || 587} onChange={(e) => updSmtp({ port: Number(e.target.value) })} /></div>
            <div><Label>Username</Label><Input value={data.smtp?.username || ""} onChange={(e) => updSmtp({ username: e.target.value })} /></div>
            <div><Label>Password</Label><Input type="password" value={data.smtp?.password || ""} onChange={(e) => updSmtp({ password: e.target.value })} /></div>
            <div><Label>From email</Label><Input value={data.smtp?.from_email || ""} onChange={(e) => updSmtp({ from_email: e.target.value })} placeholder="noreply@example.com" /></div>
            <div className="flex items-end gap-2">
              <Label className="text-xs">TLS</Label>
              <Switch checked={!!data.smtp?.use_tls} onCheckedChange={(v) => updSmtp({ use_tls: v })} />
            </div>
          </div>
          <p className="text-xs text-slate-400">Configure outbound notifications (Gmail, Office 365 or custom SMTP). The credentials are stored securely on this server.</p>
        </Card>

        <PlantDocsTemplateCard />
        <BackupRestoreCard />

        <div className="mt-6 flex justify-end">
          <Button data-testid="save-settings" onClick={save} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
            {saving ? "Saving…" : "Save settings"}
          </Button>
        </div>
      </div>
    </AppLayout>
  );

/**
 * PlantDocsTemplateCard — super_admin edits the default folder list that
 * gets auto-created for every new plant.  Reads/writes /api/plant-docs/template.
 */
function PlantDocsTemplateCard() {
  const [folders, setFolders] = useState([]);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.get("/plant-docs/template")
      .then((r) => setFolders(r.data.folders || []))
      .catch(() => setFolders([]))
      .finally(() => setLoaded(true));
  }, []);

  const add = () => {
    const n = draft.trim();
    if (!n) return;
    if (folders.includes(n)) { setDraft(""); return; }
    setFolders([...folders, n]);
    setDraft("");
  };
  const remove = (n) => setFolders(folders.filter((x) => x !== n));

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.put("/plant-docs/template", { folders });
      const n = r?.data?.propagated_to_plants;
      toast.success(
        typeof n === "number"
          ? `Folder template saved · applied to ${n} plant${n === 1 ? "" : "s"}`
          : "Folder template saved"
      );
    } catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
    finally { setSaving(false); }
  };

  if (!loaded) return null;
  return (
    <Card className="p-5 rounded-2xl border-slate-100 card-soft mt-4 space-y-3 bg-white"
          data-testid="plant-docs-template-card">
      <div className="font-heading font-semibold flex items-center gap-2">
        <Folder className="w-4 h-4 text-blue-500" /> Plant document folders
      </div>
      <p className="text-xs text-slate-500 -mt-2">
        These sub-folders are auto-created for every plant. Saving here also back-fills the new folders on all existing plants (files & extra folders you added manually are never touched).
      </p>
      <div className="flex flex-wrap gap-1.5">
        {folders.map((f) => (
          <span key={f}
                className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-blue-50 text-blue-700 text-xs">
            {f}
            <button onClick={() => remove(f)}
                    className="w-4 h-4 rounded-full hover:bg-blue-200 flex items-center justify-center"
                    data-testid={`tpl-folder-del-${f}`}>×</button>
          </span>
        ))}
        {folders.length === 0 && (
          <span className="text-xs text-slate-400">No default folders configured.</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Input value={draft} onChange={(e) => setDraft(e.target.value)}
               placeholder="Add folder name…"
               className="h-8 text-sm max-w-xs"
               data-testid="tpl-folder-input"
               onKeyDown={(e) => e.key === "Enter" && add()} />
        <Button size="sm" variant="outline" onClick={add}
                data-testid="tpl-folder-add">
          <Plus className="w-3.5 h-3.5 mr-1" /> Add
        </Button>
        <Button size="sm" className="bg-blue-600 hover:bg-blue-700 ml-auto"
                onClick={save} disabled={saving}
                data-testid="tpl-folder-save">
          {saving ? "Saving…" : "Save template"}
        </Button>
      </div>
    </Card>
  );
}

}

/**
 * BackupRestoreCard — Settings pane where super_admin drives the Backup &
 * Restore feature (auto-schedule toggle + manual snapshot / restore /
 * delete / download).  Everything is served from /api/backups + /api/backup-config.
 */
function BackupRestoreCard() {
  const [cfg, setCfg] = useState(null);
  const [snaps, setSnaps] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.get("/backup-config").then((r) => setCfg(r.data)).catch(() => setCfg(null));
    api.get("/backups").then((r) => setSnaps(r.data.snapshots || [])).catch(() => setSnaps([]));
  };
  useEffect(() => { load(); }, []);

  if (!cfg) return null; // hidden for non-super-admin (403 → cfg stays null)

  const saveCfg = async (patch) => {
    try {
      const r = await api.put("/backup-config", { ...cfg, ...patch });
      setCfg(r.data);
      toast.success("Schedule updated");
    } catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
  };

  const backupNow = async () => {
    setBusy(true);
    try {
      await api.post("/backups");
      toast.success("Snapshot created");
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Backup failed"); }
    finally { setBusy(false); }
  };

  /**
   * Create a fresh snapshot AND download it in one click — the resulting
   * .tar.gz is compatible with `./migrate.sh import` on another machine.
   */
  const downloadMigrationBundle = async () => {
    setBusy(true);
    try {
      const created = await api.post("/backups");
      const name = created?.data?.name;
      if (!name) throw new Error("Snapshot creation returned no name");
      const r = await api.get(`/backups/${encodeURIComponent(name)}/download`, { responseType: "blob" });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success("Migration bundle downloaded");
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Download failed"); }
    finally { setBusy(false); }
  };

  const restore = async (name) => {
    if (!window.confirm(`Restore "${name}"?\n\nThis will REPLACE the current MongoDB data and all uploaded files.`)) return;
    setBusy(true);
    try {
      await api.post(`/backups/${encodeURIComponent(name)}/restore`);
      toast.success("Restored — reload the page");
    } catch (e) { toast.error(e?.response?.data?.detail || "Restore failed"); }
    finally { setBusy(false); }
  };

  const del = async (name) => {
    if (!window.confirm(`Delete snapshot "${name}"?`)) return;
    try {
      await api.delete(`/backups/${encodeURIComponent(name)}`);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Delete failed"); }
  };

  const download = async (name) => {
    try {
      const r = await api.get(`/backups/${encodeURIComponent(name)}/download`, { responseType: "blob" });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error(e?.response?.data?.detail || "Download failed"); }
  };

  return (
    <Card className="p-5 rounded-2xl border-slate-100 card-soft mt-4 space-y-4 bg-white"
          data-testid="backup-restore-card">
      <div className="font-heading font-semibold flex items-center gap-2">
        <Archive className="w-4 h-4 text-blue-500" /> Backup &amp; Restore
      </div>
      <p className="text-xs text-slate-500 -mt-2">
        Snapshots include MongoDB + all uploaded files. Retained for {cfg.retention_days} days (older auto-deleted).
      </p>

      {/* Auto backup */}
      <div className="flex flex-wrap items-end gap-3 border border-slate-100 rounded-xl p-3 bg-slate-50/60">
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <input type="checkbox" checked={!!cfg.enabled}
                 data-testid="backup-auto-toggle"
                 onChange={(e) => saveCfg({ enabled: e.target.checked })}
                 className="w-4 h-4 accent-blue-600" />
          <span className="font-medium text-slate-700">Automatic daily backup</span>
        </label>
        <div className="ml-4">
          <div className="text-[11px] text-slate-500 mb-0.5">Time (UTC)</div>
          <div className="flex items-center gap-1">
            <Input type="number" min="0" max="23"
                   value={cfg.hour_utc}
                   data-testid="backup-hour"
                   onChange={(e) => saveCfg({ hour_utc: Number(e.target.value) })}
                   className="h-8 w-16 text-sm" />
            <span className="text-slate-400">:</span>
            <Input type="number" min="0" max="59"
                   value={cfg.minute_utc}
                   data-testid="backup-minute"
                   onChange={(e) => saveCfg({ minute_utc: Number(e.target.value) })}
                   className="h-8 w-16 text-sm" />
          </div>
        </div>
        <div className="ml-auto">
          <div className="text-[11px] text-slate-500 mb-0.5">Last run</div>
          <div className="text-xs text-slate-600">
            {cfg.last_run_at ? formatDate(cfg.last_run_at) : "—"}
          </div>
        </div>
        <Button size="sm" onClick={backupNow} disabled={busy}
                data-testid="backup-now"
                className="bg-blue-600 hover:bg-blue-700">
          <Archive className="w-3.5 h-3.5 mr-1" /> {busy ? "Working…" : "Backup now"}
        </Button>
        <Button size="sm" variant="outline" onClick={downloadMigrationBundle}
                disabled={busy}
                data-testid="backup-migration-bundle"
                className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                title="Create a fresh snapshot and download it right away — compatible with ./migrate.sh import on another host.">
          <DownloadCloud className="w-3.5 h-3.5 mr-1" /> Migration bundle
        </Button>
      </div>

      {/* Snapshots list */}
      <div>
        <div className="text-xs font-semibold text-slate-600 mb-1.5">
          Snapshots <span className="text-slate-400 font-normal">({snaps.length})</span>
        </div>
        {snaps.length === 0 ? (
          <div className="text-xs text-slate-400 py-6 text-center border border-dashed border-slate-200 rounded-lg">
            No snapshots yet — click "Backup now" to create one.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
            {snaps.map((s) => (
              <div key={s.name} className="flex items-center gap-3 p-2.5 hover:bg-slate-50"
                   data-testid={`snap-${s.name}`}>
                <Archive className="w-4 h-4 text-slate-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-slate-800 truncate">{s.name}</div>
                  <div className="text-[10px] text-slate-400">
                    {formatBytesLocal(s.size_bytes)} · {formatDate(s.created_at)}
                  </div>
                </div>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]"
                        onClick={() => download(s.name)} title="Download">
                  <DownloadCloud className="w-3.5 h-3.5 mr-1" /> Download
                </Button>
                <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] border-amber-200 text-amber-700 hover:bg-amber-50"
                        onClick={() => restore(s.name)}
                        data-testid={`restore-${s.name}`}
                        title="Restore this snapshot">
                  <RotateCcw className="w-3.5 h-3.5 mr-1" /> Restore
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                        onClick={() => del(s.name)}
                        data-testid={`del-${s.name}`}
                        title="Delete">
                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function formatBytesLocal(n) {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
}

