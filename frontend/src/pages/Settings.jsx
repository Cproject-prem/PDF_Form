import React, { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export default function SettingsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/settings").then((r) => setData(r.data)).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.put("/settings", data);
      setData(r.data);
      toast.success("Settings saved");
    } catch (e) { toast.error("Save failed"); }
    finally { setSaving(false); }
  };

  if (loading || !data) return <AppLayout><div className="text-slate-400">Loading…</div></AppLayout>;

  const updSmtp = (patch) => setData({ ...data, smtp: { ...data.smtp, ...patch } });

  return (
    <AppLayout>
      <div className="max-w-3xl">
        <h1 className="text-3xl sm:text-4xl font-heading font-bold tracking-tight">Settings</h1>
        <p className="text-slate-500 mt-1">Configure your workspace.</p>

        <Card className="mt-6 p-6 rounded-2xl border-slate-100 card-soft space-y-4">
          <h2 className="text-lg font-heading font-semibold">Workspace</h2>
          <div>
            <Label>Company name</Label>
            <Input value={data.company_name} onChange={(e) => setData({ ...data, company_name: e.target.value })} data-testid="settings-company" />
          </div>
          <div>
            <Label>Company logo URL</Label>
            <Input value={data.company_logo_url} onChange={(e) => setData({ ...data, company_logo_url: e.target.value })} />
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

        <div className="mt-6 flex justify-end">
          <Button data-testid="save-settings" onClick={save} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
            {saving ? "Saving…" : "Save settings"}
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
