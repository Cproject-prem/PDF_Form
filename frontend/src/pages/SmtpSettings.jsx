import React, { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Mail, Send, Lock, AlertCircle, CheckCircle2,
} from "lucide-react";

export default function SmtpSettingsPage() {
  const [cfg, setCfg] = useState(null);
  const [testTo, setTestTo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/settings/smtp").then((r) => setCfg(r.data));
  }, []);

  const set = (k, v) => setCfg((c) => ({ ...c, [k]: v }));

  const save = async () => {
    setBusy(true);
    try {
      const r = await api.put("/settings/smtp", cfg);
      setCfg(r.data);
      toast.success("SMTP settings saved");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    if (!testTo) { toast.error("Enter a recipient"); return; }
    setBusy(true);
    try {
      await save(); // persist first
      const r = await api.post("/settings/smtp/test", { to: testTo });
      if (r.data.status === "sent") toast.success("Test email sent");
      else if (r.data.status === "skipped_no_smtp") toast.error("SMTP disabled");
      else toast.error(r.data.error || `Status: ${r.data.status}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Send failed");
    } finally {
      setBusy(false);
    }
  };

  if (!cfg) return <AppLayout><div className="text-slate-400">Loading…</div></AppLayout>;

  return (
    <AppLayout>
      <div className="max-w-3xl">
        <div className="mb-6">
          <span className="text-xs uppercase tracking-[0.1em] text-slate-400 font-bold">System</span>
          <h1 className="text-3xl sm:text-4xl font-heading font-bold tracking-tight text-slate-900 mt-1">
            SMTP Configuration
          </h1>
          <p className="text-slate-500 mt-1">
            Used by every email action in workflow automation, plus approval invitations.
          </p>
        </div>

        <Card className="rounded-2xl border-slate-100 card-soft p-6 bg-white">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-100 mb-5">
            <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-800">
              Password is stored server-side and never returned to the client.
              Leave the password field blank when editing if you do not want to change it.
            </p>
          </div>

          <div className="flex items-center justify-between mb-5">
            <div>
              <Label className="text-sm font-medium">Enable outbound email</Label>
              <p className="text-xs text-slate-500">When disabled, emails are queued but not delivered.</p>
            </div>
            <Switch
              data-testid="smtp-enabled"
              checked={!!cfg.enabled}
              onCheckedChange={(v) => set("enabled", v)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <Label className="text-xs text-slate-500">SMTP host</Label>
              <Input
                data-testid="smtp-host"
                placeholder="smtp.sendgrid.net"
                value={cfg.host || ""}
                onChange={(e) => set("host", e.target.value)}
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <Label className="text-xs text-slate-500">Port</Label>
              <Input
                data-testid="smtp-port"
                type="number"
                value={cfg.port ?? 587}
                onChange={(e) => set("port", Number(e.target.value))}
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <Label className="text-xs text-slate-500">Username</Label>
              <Input
                data-testid="smtp-username"
                value={cfg.username || ""}
                onChange={(e) => set("username", e.target.value)}
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <Label className="text-xs text-slate-500">Password</Label>
              <Input
                data-testid="smtp-password"
                type="password"
                placeholder={cfg.password === "*****" ? "(unchanged — leave blank)" : ""}
                value={cfg.password === "*****" ? "" : (cfg.password || "")}
                onChange={(e) => set("password", e.target.value)}
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <Label className="text-xs text-slate-500">From email</Label>
              <Input
                data-testid="smtp-from"
                placeholder="no-reply@yourcompany.com"
                value={cfg.from_email || ""}
                onChange={(e) => set("from_email", e.target.value)}
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <Label className="text-xs text-slate-500">From name</Label>
              <Input
                data-testid="smtp-from-name"
                placeholder="FormForge"
                value={cfg.from_name || ""}
                onChange={(e) => set("from_name", e.target.value)}
              />
            </div>
            <div className="col-span-2 flex items-center justify-between p-3 rounded-lg bg-slate-50">
              <div>
                <Label className="text-sm">STARTTLS</Label>
                <p className="text-xs text-slate-500">Disable only for legacy SMTPS-on-465 servers.</p>
              </div>
              <Switch
                data-testid="smtp-tls"
                checked={!!cfg.use_tls}
                onCheckedChange={(v) => set("use_tls", v)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Button variant="outline" onClick={save} disabled={busy} data-testid="smtp-save">
              <Lock className="w-4 h-4 mr-1" /> Save
            </Button>
          </div>
        </Card>

        <Card className="rounded-2xl border-slate-100 card-soft p-6 bg-white mt-4">
          <div className="flex items-center gap-2 mb-3">
            <Mail className="w-4 h-4 text-blue-600" />
            <span className="font-medium text-slate-800">Send test email</span>
          </div>
          <div className="flex gap-2">
            <Input
              data-testid="smtp-test-to"
              placeholder="you@yourcompany.com"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
            />
            <Button onClick={sendTest} disabled={busy} className="bg-blue-600 hover:bg-blue-700" data-testid="smtp-test-send">
              <Send className="w-4 h-4 mr-1" /> Send
            </Button>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
