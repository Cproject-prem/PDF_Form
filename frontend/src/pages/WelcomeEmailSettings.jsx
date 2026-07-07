import React, { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { api, getErrorMessage } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Save, Eye, Mail as MailIcon, RefreshCcw } from "lucide-react";

const DEFAULT_SUBJECT = "Welcome to FormForge — your account is ready";
const DEFAULT_BODY = `<p>Hi {{name}},</p>
<p>Your account on FormForge has been created.</p>
<ul>
<li><b>Email:</b> {{email}}</li>
<li><b>Temporary password:</b> {{password}}</li>
</ul>
<p><a href="{{login_url}}">Sign in</a> and change your password on first login.</p>
<p>— The FormForge team</p>`;

/**
 * Settings → Welcome email.
 *
 * Persists a per-workspace subject + HTML template that is used when a new
 * user is created (see /api/settings/welcome-email).  Supports live preview
 * with the template's placeholders substituted.
 */
export default function WelcomeEmailSettingsPage() {
  const [form, setForm] = useState({ subject: "", body_html: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);

  const load = () => {
    setLoading(true);
    api.get("/settings/welcome-email")
      .then((r) => setForm({
        subject: r.data.subject || DEFAULT_SUBJECT,
        body_html: r.data.body_html || DEFAULT_BODY,
      }))
      .catch((e) => toast.error(getErrorMessage(e, "Failed to load template")))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/settings/welcome-email", form);
      toast.success("Welcome email template saved");
    } catch (e) { toast.error(getErrorMessage(e, "Save failed")); }
    finally { setSaving(false); }
  };

  const doPreview = async () => {
    try {
      const r = await api.post("/settings/welcome-email/preview", form);
      setPreview(r.data);
    } catch (e) { toast.error(getErrorMessage(e, "Preview failed")); }
  };

  const resetDefaults = () => {
    if (!confirm("Reset to the built-in default template?")) return;
    setForm({ subject: DEFAULT_SUBJECT, body_html: DEFAULT_BODY });
  };

  return (
    <AppLayout>
      <div className="max-w-4xl">
        <div className="mb-6">
          <div className="text-xs uppercase tracking-[0.1em] text-slate-400 font-bold mb-1">
            Settings
          </div>
          <h1 className="text-3xl sm:text-4xl font-heading font-bold tracking-tight flex items-center gap-2">
            <MailIcon className="w-7 h-7 text-blue-600" />
            Welcome email template
          </h1>
          <p className="text-slate-500 mt-1">
            Sent to newly-created users. Placeholders:
            {" "}<code className="text-xs bg-slate-100 px-1 rounded">{"{{name}}"}</code>{" · "}
            <code className="text-xs bg-slate-100 px-1 rounded">{"{{email}}"}</code>{" · "}
            <code className="text-xs bg-slate-100 px-1 rounded">{"{{password}}"}</code>{" · "}
            <code className="text-xs bg-slate-100 px-1 rounded">{"{{login_url}}"}</code>
          </p>
        </div>

        <Card className="rounded-2xl border-slate-100 card-soft bg-white">
          {loading ? (
            <div className="p-8 text-slate-400">Loading…</div>
          ) : (
            <div className="p-6 space-y-4">
              <div>
                <Label htmlFor="welcome-subject">Subject</Label>
                <Input
                  id="welcome-subject"
                  data-testid="welcome-subject"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="welcome-body">HTML body</Label>
                <Textarea
                  id="welcome-body"
                  data-testid="welcome-body"
                  rows={12}
                  value={form.body_html}
                  onChange={(e) => setForm({ ...form, body_html: e.target.value })}
                  className="mt-1 font-mono text-xs"
                />
                <div className="text-[11px] text-slate-400 mt-1">
                  Basic HTML supported (paragraphs, links, lists, bold/italic).
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                <Button
                  data-testid="welcome-save"
                  onClick={save}
                  disabled={saving}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Save className="w-4 h-4 mr-1.5" />
                  {saving ? "Saving…" : "Save changes"}
                </Button>
                <Button
                  data-testid="welcome-preview"
                  variant="outline"
                  onClick={doPreview}
                >
                  <Eye className="w-4 h-4 mr-1.5" /> Preview
                </Button>
                <Button
                  variant="ghost"
                  onClick={resetDefaults}
                  className="ml-auto text-slate-500"
                >
                  <RefreshCcw className="w-4 h-4 mr-1.5" /> Reset to default
                </Button>
              </div>
            </div>
          )}
        </Card>

        {preview && (
          <Card className="mt-6 rounded-2xl border-slate-100 card-soft bg-white" data-testid="welcome-preview-card">
            <div className="p-5 border-b border-slate-100">
              <div className="text-xs uppercase tracking-wider text-slate-400 mb-1">Preview</div>
              <div className="text-lg font-heading font-semibold text-slate-900">
                {preview.subject}
              </div>
            </div>
            <div
              className="p-6 prose prose-sm max-w-none prose-slate"
              dangerouslySetInnerHTML={{ __html: preview.body_html }}
            />
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
