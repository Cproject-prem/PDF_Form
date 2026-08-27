import React, { useEffect, useRef, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { api, getErrorMessage } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils2";
import { Upload, Folder, Plus, Archive, DownloadCloud, RotateCcw, Trash2, UploadCloud, Settings2, Sparkles, Shield, ShieldCheck, KeyRound, Search, FolderPlus, CornerDownRight, X, FolderTree, Bot, Package2, AlertTriangle } from "lucide-react";
import LoadingScreen from "@/components/common/LoadingScreen";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";

export default function SettingsPage() {
  const { reloadBranding } = useAuth();
  const [data, setData] = useState(null);
  const [siteColumns, setSiteColumns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get("/settings"),
      api.get("/sites/columns?include_hidden=true")
    ])
    .then(([rSet, rCol]) => {
      setData(rSet.data);
      setSiteColumns(rCol.data || []);
    })
    .catch(() => setData(null))
    .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.put("/settings", data);
      setData(r.data);
      toast.success("Settings saved");
      reloadBranding && reloadBranding();
    } catch (e) { toast.error(getErrorMessage(e, "Save failed")); }
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
      toast.error(getErrorMessage(e, "Upload failed"));
    } finally { setUploadingLogo(false); }
  };

  const [uploadingAiLogo, setUploadingAiLogo] = useState(false);
  const [uploadingAiGif, setUploadingAiGif] = useState(false);
  const [uploadingLoginBg, setUploadingLoginBg] = useState(false);
  const [uploadingAppBg, setUploadingAppBg] = useState(false);
  const [uploadingErrorVideo, setUploadingErrorVideo] = useState(false);

  const uploadAiAvatar = async (file, target) => {
    if (!file) return;
    if (target === "gif") setUploadingAiGif(true);
    else setUploadingAiLogo(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("target", target);
      const r = await api.post("/settings/ai-avatar", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const field = target === "gif" ? "ai_bot_gif_url" : "ai_bot_logo_url";
      setData((d) => ({ ...d, [field]: r.data.url }));
      reloadBranding && reloadBranding();
      toast.success(`${target === "gif" ? "Chatbot GIF" : "AI Bot Logo"} uploaded`);
    } catch (e) {
      toast.error(getErrorMessage(e, "Upload failed"));
    } finally {
      if (target === "gif") setUploadingAiGif(false);
      else setUploadingAiLogo(false);
    }
  };

  const isVideoUrl = (url) => {
    if (!url || typeof url !== "string") return false;
    const clean = url.split("?")[0].toLowerCase();
    return clean.endsWith(".mp4") || clean.endsWith(".webm") || clean.endsWith(".mov") || clean.endsWith(".ogg") || clean.endsWith(".m4v");
  };

  const renderBgPreview = (url, alt) => {
    if (!url) {
      return (
        <div className="w-24 h-16 rounded-lg border border-dashed border-slate-300 flex items-center justify-center text-slate-400 text-xs text-center p-1 shrink-0">
          Default background
        </div>
      );
    }
    const fullUrl = url.startsWith("http") ? url : `${process.env.REACT_APP_BACKEND_URL || ""}${url}`;
    if (isVideoUrl(url)) {
      return (
        <video
          src={fullUrl}
          autoPlay
          loop
          muted
          playsInline
          className="w-24 h-16 rounded-lg object-cover border border-slate-200 bg-slate-50 shrink-0"
        />
      );
    }
    return (
      <img
        src={fullUrl}
        alt={alt}
        className="w-24 h-16 rounded-lg object-cover border border-slate-200 bg-slate-50 shrink-0"
      />
    );
  };

  const uploadBackground = async (file, target) => {
    if (!file) return;
    if (target === "login") setUploadingLoginBg(true);
    else if (target === "error") setUploadingErrorVideo(true);
    else setUploadingAppBg(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("target", target);
      const r = await api.post("/settings/background", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const field = target === "login" ? "login_bg_url" : (target === "error" ? "error_video_url" : "bg_image_url");
      setData((d) => ({ ...d, [field]: r.data.url }));
      reloadBranding && reloadBranding();
      toast.success(`${target === "login" ? "Login page background" : (target === "error" ? "Error page video" : "App background")} uploaded`);
    } catch (e) {
      toast.error(getErrorMessage(e, "Upload failed"));
    } finally {
      if (target === "login") setUploadingLoginBg(false);
      else if (target === "error") setUploadingErrorVideo(false);
      else setUploadingAppBg(false);
    }
  };

  if (loading || !data) return <AppLayout><LoadingScreen message="Loading settings…" /></AppLayout>;

  const updSmtp = (patch) => setData({ ...data, smtp: { ...data.smtp, ...patch } });
  const updWa = (patch) => setData({ ...data, whatsapp: { ...data.whatsapp, ...patch } });
  const updRbac = (patch) => setData({ ...data, rbac: { ...(data.rbac || {}), ...patch } });

  return (
    <AppLayout>
      <div className="max-w-4xl">
        <h1 className="text-3xl sm:text-4xl font-heading font-bold tracking-tight">Settings</h1>
        <p className="text-slate-500 mt-1">Configure your workspace.</p>

        <Tabs defaultValue="general" className="mt-6">
          <TabsList className="mb-4 flex-wrap">
            <TabsTrigger value="general">General & Branding</TabsTrigger>
            {data.enable_ai !== false && (
              <TabsTrigger value="ai" className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-500" /> AI Assistant & Chatbot
              </TabsTrigger>
            )}
            <TabsTrigger value="rbac">RBAC & Roles</TabsTrigger>
            <TabsTrigger value="notifications">Notifications & API</TabsTrigger>
            <TabsTrigger value="advanced">Backup & Advanced</TabsTrigger>
          </TabsList>
          
          <TabsContent value="general" className="space-y-6">
            <Card className="p-6 rounded-2xl border-slate-100 card-soft space-y-4">
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

          {/* Google OAuth Credentials */}
          <div className="pt-2 border-t border-slate-100 space-y-3">
            <div>
              <Label className="font-semibold text-slate-800">Direct Google OAuth 2.0 Credentials</Label>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure your official Google Cloud OAuth Client ID &amp; Secret for direct "Continue with Google" authentication.
              </p>
            </div>

            <label className="flex items-center justify-between cursor-pointer p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
              <div>
                <span className="font-semibold text-xs text-slate-800 dark:text-slate-200">Enable "Continue with Google" on Login Screen</span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Show or hide the Google Sign-in button for visitors logging in.</p>
              </div>
              <input
                type="checkbox"
                checked={data.enable_google_login !== false}
                onChange={(e) => setData({ ...data, enable_google_login: e.target.checked })}
                className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
              />
            </label>

            <div className="grid sm:grid-cols-2 gap-4 pt-1">
              <div>
                <Label className="text-xs text-slate-600">Google Client ID</Label>
                <Input
                  value={data.google_client_id || ""}
                  onChange={(e) => setData({ ...data, google_client_id: e.target.value })}
                  placeholder="xxxx-yyyy.apps.googleusercontent.com"
                />
              </div>
              <div>
                <Label className="text-xs text-slate-600">Google Client Secret</Label>
                <Input
                  type="password"
                  value={data.google_client_secret || ""}
                  onChange={(e) => setData({ ...data, google_client_secret: e.target.value })}
                  placeholder="GOCSPX-xxxxxxxxxxxxxx"
                />
              </div>
            </div>
          </div>

          {/* Login Background */}
          <div className="pt-2 border-t border-slate-100">
            <Label className="font-semibold text-slate-800">Login Page Background (Image, GIF, or Video)</Label>
            <p className="text-xs text-slate-500 mb-2">Displayed on the left panel of the login screen (supports MP4, WebM, GIF, JPG, PNG).</p>
            <div className="flex items-start gap-4">
              {renderBgPreview(data.login_bg_url, "Login background preview")}
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-slate-200 cursor-pointer hover:bg-slate-50">
                    <Upload className="w-3.5 h-3.5" />
                    {uploadingLoginBg ? "Uploading…" : "Upload Image/GIF/Video"}
                    <input
                      type="file"
                      accept="image/*,.gif,video/*,.mp4,.webm,.mov,.ogg,.m4v"
                      className="hidden"
                      onChange={(e) => uploadBackground(e.target.files?.[0], "login")}
                    />
                  </label>
                  {data.login_bg_url && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setData({ ...data, login_bg_url: "" })}
                      className="text-xs text-red-600 hover:bg-red-50"
                    >Remove</Button>
                  )}
                </div>
                <Input
                  value={data.login_bg_url || ""}
                  onChange={(e) => setData({ ...data, login_bg_url: e.target.value })}
                  placeholder="https://example.com/bg.mp4 or bg.gif"
                />
              </div>
            </div>
          </div>

          {/* All Pages App Background */}
          <div className="pt-2 border-t border-slate-100">
            <Label className="font-semibold text-slate-800">All Pages App Background (Image, GIF, or Video)</Label>
            <p className="text-xs text-slate-500 mb-2">Displayed across all application pages behind content (supports MP4, WebM, GIF, JPG, PNG).</p>
            <div className="flex items-start gap-4">
              {renderBgPreview(data.bg_image_url, "App background preview")}
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-slate-200 cursor-pointer hover:bg-slate-50">
                    <Upload className="w-3.5 h-3.5" />
                    {uploadingAppBg ? "Uploading…" : "Upload Image/GIF/Video"}
                    <input
                      type="file"
                      accept="image/*,.gif,video/*,.mp4,.webm,.mov,.ogg,.m4v"
                      className="hidden"
                      onChange={(e) => uploadBackground(e.target.files?.[0], "app")}
                    />
                  </label>
                  {data.bg_image_url && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setData({ ...data, bg_image_url: "" })}
                      className="text-xs text-red-600 hover:bg-red-50"
                    >Remove</Button>
                  )}
                </div>
                <Input
                  value={data.bg_image_url || ""}
                  onChange={(e) => setData({ ...data, bg_image_url: e.target.value })}
                  placeholder="https://example.com/app-bg.mp4 or app-bg.gif"
                />
              </div>
            </div>
          </div>

          {/* Error Page Video / Animation */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <Label className="font-semibold text-slate-800 dark:text-slate-100">
                Error Page Video & Animation
              </Label>
              <Badge variant="secondary" className="text-[10px] bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300 font-bold px-2 py-0 border border-red-200 dark:border-red-900">
                Crash Protection
              </Badge>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              Displayed whenever a component or page crashes, instead of showing a blank screen. Supports MP4, WebM, GIF, WebP, PNG.
            </p>
            <div className="flex items-start gap-4">
              {renderBgPreview(data.error_video_url, "Error screen preview")}
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900 transition">
                    <Upload className="w-3.5 h-3.5" />
                    {uploadingErrorVideo ? "Uploading…" : "Upload Error Video/GIF"}
                    <input
                      type="file"
                      accept="image/*,.gif,video/*,.mp4,.webm,.mov,.ogg,.m4v"
                      className="hidden"
                      onChange={(e) => uploadBackground(e.target.files?.[0], "error")}
                    />
                  </label>
                  {data.error_video_url && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setData({ ...data, error_video_url: "" })}
                      className="text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                    >Remove</Button>
                  )}
                </div>
                <Input
                  value={data.error_video_url || ""}
                  onChange={(e) => setData({ ...data, error_video_url: e.target.value })}
                  placeholder="https://example.com/error-animation.gif or error-robot.mp4"
                  className="text-xs border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                />

                {/* Preset Error GIFs */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">Quick Error Presets:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { name: "Robot Cable Fixer", url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcGZrdmpzazF4enY5Y2p6ZGt6cGNxY2Q5Yzg1c2Fmb3YyOHpxMms0dyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3o7TKSjRrfIPjeiVyM/giphy.gif" },
                      { name: "Maintenance Bot", url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExeGJ3cmVsZGRtM2JzMHd3dnJ5ZzVzYml1bjMxc3lhODd6bzMxbGFsNSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/26EPe2Cq7n9q90qnm/giphy.gif" },
                      { name: "Glitch Sparkle Orb", url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3ZhcXlzc2N1ODRreGV0bHRoMnRhMnprMnA2d2tpaTZ1eDlvdXBwaSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/l378c04F2fjeZ7vG0/giphy.gif" }
                    ].map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => setData({ ...data, error_video_url: preset.url })}
                        className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/70 hover:text-blue-700 dark:hover:text-blue-300 text-slate-600 dark:text-slate-300 rounded-md text-[11px] font-medium border border-slate-200 dark:border-slate-700 transition-colors"
                      >
                        + {preset.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* ─── Feature & Module Controls ─── */}
        <Card className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 card-soft space-y-4 bg-white dark:bg-slate-900/90 text-slate-900 dark:text-white">
          <div>
            <h2 className="text-lg font-heading font-semibold text-slate-900 dark:text-white">Module & Feature Controls</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Enable or disable optional system modules across the portal.
            </p>
          </div>

          <div className="space-y-3">
            {/* AI Module Switch */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50/70 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-indigo-500" />
                  <Label className="font-semibold text-slate-800 dark:text-slate-100 text-sm">AI Assistant & Chatbot Module</Label>
                  <Badge variant="secondary" className={`text-[10px] px-2 py-0.5 ${data.enable_ai !== false ? "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800" : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400"}`}>
                    {data.enable_ai !== false ? "Active" : "Disabled"}
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Show or hide the floating AI Assistant chatbot widget, AI training tools, and automated form assistant across the workspace.
                </p>
              </div>
              <Switch
                checked={data.enable_ai !== false}
                onCheckedChange={(v) => setData({ ...data, enable_ai: v })}
                data-testid="toggle-enable-ai"
              />
            </div>

            {/* Inventory Switch */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50/70 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Package2 className="w-4 h-4 text-blue-500" />
                  <Label className="font-semibold text-slate-800 dark:text-slate-100 text-sm">Inventory Management Module</Label>
                  <Badge variant="secondary" className={`text-[10px] px-2 py-0.5 ${data.enable_inventory ? "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800" : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400"}`}>
                    {data.enable_inventory ? "Active" : "Disabled"}
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Show or hide the Inventory page, equipment tracking, and inter-plant movement registry for all users.
                </p>
              </div>
              <Switch
                checked={!!data.enable_inventory}
                onCheckedChange={(v) => setData({ ...data, enable_inventory: v })}
                data-testid="toggle-enable-inventory"
              />
            </div>
          </div>
        </Card>
        </TabsContent>

        {/* ─── AI Assistant & Chatbot Branding Tab ─── */}
        <TabsContent value="ai" className="space-y-6">
          {/* Master Enable/Disable Card */}
          <Card className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 card-soft space-y-4 bg-white dark:bg-slate-900/90 text-slate-900 dark:text-white">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-indigo-500" />
                  <h2 className="text-lg font-heading font-semibold text-slate-900 dark:text-white">
                    AI Assistant Master Toggle
                  </h2>
                  <Badge variant="secondary" className={`text-xs px-2.5 py-0.5 ${data.enable_ai !== false ? "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800" : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400"}`}>
                    {data.enable_ai !== false ? "AI Enabled" : "AI Disabled"}
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Master switch to show or hide the AI Chatbot drawer, floating bot trigger, and automated Copilot across the portal.
                </p>
              </div>
              <Switch
                checked={data.enable_ai !== false}
                onCheckedChange={(v) => setData({ ...data, enable_ai: v })}
                data-testid="toggle-ai-master"
              />
            </div>
            {data.enable_ai === false && (
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2">
                <Bot className="w-4 h-4 text-amber-600 shrink-0" />
                <span>AI Module is currently <b>Disabled</b>. The floating chatbot and AI assistants will be hidden from all users after saving.</span>
              </div>
            )}
          </Card>

          <Card className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 card-soft space-y-6 bg-white dark:bg-slate-900/90 text-slate-900 dark:text-white">
            <div>
              <h2 className="text-lg font-heading font-semibold flex items-center gap-2 text-slate-900 dark:text-white">
                <Settings2 className="w-5 h-5 text-indigo-500" />
                AI Assistant Name & Chatbot GIF Branding
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Customize the AI Assistant's name, brand logo, and animated Chatbot GIF shown in the AI chat playground, floating assistant drawer, and diagnostic tools.
              </p>
            </div>

            {/* AI Assistant Name */}
            <div>
              <Label className="font-semibold text-slate-800 dark:text-slate-100">AI Assistant Name</Label>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Display name for the AI bot across chat bubbles, headers, and notifications.</p>
              <Input
                value={data.ai_bot_name || "FormForge AI"}
                onChange={(e) => setData({ ...data, ai_bot_name: e.target.value })}
                placeholder="e.g. FormForge AI, SunBot, PlantAdvisor"
                className="max-w-md border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                data-testid="settings-ai-bot-name"
              />
            </div>

            {/* AI Bot Static Logo */}
            <div>
              <Label className="font-semibold text-slate-800 dark:text-slate-100">AI Bot Logo Image</Label>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Static logo or icon for AI assistant avatar bubbles.</p>
              <div className="flex items-start gap-4">
                {data.ai_bot_logo_url ? (
                  <img
                    src={data.ai_bot_logo_url.startsWith("http")
                      ? data.ai_bot_logo_url
                      : `${process.env.REACT_APP_BACKEND_URL || ""}${data.ai_bot_logo_url}`}
                    alt="AI Bot Logo"
                    className="w-16 h-16 rounded-2xl object-cover border-2 border-indigo-100 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/50 p-1 shadow-sm shrink-0"
                    data-testid="settings-ai-logo-preview"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-2xl border-2 border-dashed border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/30 flex items-center justify-center text-indigo-400 font-bold text-xs shrink-0">
                    AI Logo
                  </div>
                )}
                <div className="flex-1 space-y-2 max-w-md">
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900 transition">
                      <Upload className="w-3.5 h-3.5 text-indigo-500" />
                      {uploadingAiLogo ? "Uploading..." : "Upload Logo"}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => uploadAiAvatar(e.target.files?.[0], "logo")}
                      />
                    </label>
                    {data.ai_bot_logo_url && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setData({ ...data, ai_bot_logo_url: "" })}
                        className="text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                      >Remove</Button>
                    )}
                  </div>
                  <Input
                    value={data.ai_bot_logo_url || ""}
                    onChange={(e) => setData({ ...data, ai_bot_logo_url: e.target.value })}
                    placeholder="https://example.com/ai-bot-logo.png"
                    className="text-xs border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                    data-testid="settings-ai-logo-url"
                  />
                </div>
              </div>
            </div>

            {/* Chatbot Animated GIF */}
            <div>
              <Label className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <span>Chatbot Animated GIF</span>
                <span className="text-[10px] bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 font-bold px-2 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800">Animated</span>
              </Label>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Animated GIF avatar played when the chatbot is thinking, answering, or resting in the chat drawer.</p>
              <div className="flex items-start gap-4">
                {data.ai_bot_gif_url ? (
                  <img
                    src={data.ai_bot_gif_url.startsWith("http")
                      ? data.ai_bot_gif_url
                      : `${process.env.REACT_APP_BACKEND_URL || ""}${data.ai_bot_gif_url}`}
                    alt="Chatbot GIF"
                    className="w-20 h-20 rounded-2xl object-cover border-2 border-indigo-200 dark:border-indigo-800 bg-slate-900 p-1 shadow-md shrink-0"
                    data-testid="settings-ai-gif-preview"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-indigo-300 dark:border-indigo-800 bg-slate-900 flex flex-col items-center justify-center text-indigo-300 text-[10px] text-center p-1 font-mono shrink-0 shadow-inner">
                    <span className="text-lg">🤖</span>
                    <span>Bot GIF</span>
                  </div>
                )}
                <div className="flex-1 space-y-2 max-w-md">
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 cursor-pointer hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition">
                      <Upload className="w-3.5 h-3.5" />
                      {uploadingAiGif ? "Uploading GIF..." : "Upload Chatbot GIF"}
                      <input
                        type="file"
                        accept="image/gif,image/webp,image/*"
                        className="hidden"
                        onChange={(e) => uploadAiAvatar(e.target.files?.[0], "gif")}
                      />
                    </label>
                    {data.ai_bot_gif_url && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setData({ ...data, ai_bot_gif_url: "" })}
                        className="text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                      >Clear GIF</Button>
                    )}
                  </div>
                  <Input
                    value={data.ai_bot_gif_url || ""}
                    onChange={(e) => setData({ ...data, ai_bot_gif_url: e.target.value })}
                    placeholder="https://example.com/chatbot-animated.gif"
                    className="text-xs border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                    data-testid="settings-ai-gif-url"
                  />

                  {/* Preset GIF suggestions */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                    <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">Quick Sample Presets:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { name: "Neural Pulsing Bot", url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcGZrdmpzazF4enY5Y2p6ZGt6cGNxY2Q5Yzg1c2Fmb3YyOHpxMms0dyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3o7TKSjRrfIPjeiVyM/giphy.gif" },
                        { name: "Friendly Robot Assistant", url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExeGJ3cmVsZGRtM2JzMHd3dnJ5ZzVzYml1bjMxc3lhODd6bzMxbGFsNSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/26EPe2Cq7n9q90qnm/giphy.gif" },
                        { name: "AI Sparkle Orb", url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3ZhcXlzc2N1ODRreGV0bHRoMnRhMnprMnA2d2tpaTZ1eDlvdXBwaSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/l378c04F2fjeZ7vG0/giphy.gif" }
                      ].map((preset) => (
                        <button
                          key={preset.name}
                          type="button"
                          onClick={() => setData({ ...data, ai_bot_gif_url: preset.url })}
                          className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/70 hover:text-indigo-700 dark:hover:text-indigo-300 text-slate-600 dark:text-slate-300 rounded-md text-[11px] font-medium border border-slate-200 dark:border-slate-700 transition-colors"
                        >
                          + {preset.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Live Chatbot Preview Card */}
            <div className="p-4 rounded-xl bg-slate-900 text-white space-y-3 shadow-lg border border-slate-800">
              <div className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Live Chatbot Preview
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/80 border border-slate-700">
                {data.ai_bot_gif_url ? (
                  <img
                    src={data.ai_bot_gif_url.startsWith("http")
                      ? data.ai_bot_gif_url
                      : `${process.env.REACT_APP_BACKEND_URL || ""}${data.ai_bot_gif_url}`}
                    alt="Bot GIF"
                    className="w-10 h-10 rounded-xl object-cover border border-indigo-400 shrink-0"
                  />
                ) : data.ai_bot_logo_url ? (
                  <img
                    src={data.ai_bot_logo_url.startsWith("http")
                      ? data.ai_bot_logo_url
                      : `${process.env.REACT_APP_BACKEND_URL || ""}${data.ai_bot_logo_url}`}
                    alt="Bot Logo"
                    className="w-10 h-10 rounded-xl object-cover border border-indigo-400 shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold shrink-0 shadow-md">
                    🤖
                  </div>
                )}
                <div>
                  <div className="font-bold text-sm text-indigo-200">{data.ai_bot_name || "FormForge AI"}</div>
                  <div className="text-xs text-slate-300">"Hello! I am configured with your custom AI name and animated GIF branding."</div>
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>


        <TabsContent value="notifications" className="space-y-6">
        <Card className="p-6 rounded-2xl border-slate-100 card-soft space-y-4">
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

        <Card className="p-6 rounded-2xl border-slate-100 card-soft space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-heading font-semibold">Automated Schedule Notifications</h2>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-slate-500">Enabled</Label>
              <Switch checked={data.notifications?.enabled} onCheckedChange={(v) => setData({ ...data, notifications: { ...data.notifications, enabled: v } })} data-testid="notifications-enabled" />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>Time of Day</Label>
              <Input type="time" value={data.notifications?.time_of_day || "08:00"} onChange={(e) => setData({ ...data, notifications: { ...data.notifications, time_of_day: e.target.value } })} />
            </div>
            <div className="hidden sm:block"></div>
            <div>
              <Label>To Email Column</Label>
              <Select value={data.notifications?.email_to_column || "vendor_email"} onValueChange={(v) => setData({ ...data, notifications: { ...data.notifications, email_to_column: v } })}>
                <SelectTrigger><SelectValue placeholder="Select column" /></SelectTrigger>
                <SelectContent>
                  {siteColumns.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>CC Email Column</Label>
              <Select value={data.notifications?.email_cc_column || "cc_email"} onValueChange={(v) => setData({ ...data, notifications: { ...data.notifications, email_cc_column: v } })}>
                <SelectTrigger><SelectValue placeholder="Select column" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">-- None --</SelectItem>
                  {siteColumns.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2 mt-2">
              <Label>Missed Email Subject</Label>
              <Input value={data.notifications?.email_subject || "Schedule Missed - {{month_year}}"} onChange={(e) => setData({ ...data, notifications: { ...data.notifications, email_subject: e.target.value } })} placeholder="Schedule Missed - {{month_year}}" />
              <p className="text-[10px] text-slate-400 mt-1">Variables: <code className="bg-slate-100 px-1 rounded">{"{{month_year}}"}</code></p>
            </div>
            <div className="sm:col-span-2">
              <Label>Missed Email Body (HTML)</Label>
              <Textarea 
                value={data.notifications?.email_body_html || "<p>The following schedules are more than 7 days overdue:</p><br/>{{missed_table}}"} 
                onChange={(e) => setData({ ...data, notifications: { ...data.notifications, email_body_html: e.target.value } })} 
                placeholder="<p>The following schedules are overdue...</p><br/>{{missed_table}}" 
                rows={4}
              />
              <p className="text-[10px] text-slate-400 mt-1">Variables: <code className="bg-slate-100 px-1 rounded">{"{{missed_table}}"}</code>, <code className="bg-slate-100 px-1 rounded">{"{{month_year}}"}</code></p>
            </div>
          </div>
          <p className="text-xs text-slate-400 border-t border-slate-100 pt-3 mt-2">Sends in-app notifications to vendors for schedules delayed by >2 days, and daily HTML summary emails for schedules missed by >7 days.</p>
        </Card>

        <Card className="p-6 rounded-2xl border-slate-100 card-soft space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-heading font-semibold">WhatsApp Business API</h2>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-slate-500">Enabled</Label>
              <Switch checked={data.whatsapp?.enabled} onCheckedChange={(v) => updWa({ enabled: v })} data-testid="whatsapp-enabled" />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div><Label>Phone Number ID</Label><Input value={data.whatsapp?.phone_number_id || ""} onChange={(e) => updWa({ phone_number_id: e.target.value })} placeholder="e.g. 1029384756" /></div>
            <div><Label>API Version</Label><Input value={data.whatsapp?.api_version || ""} onChange={(e) => updWa({ api_version: e.target.value })} placeholder="v19.0" /></div>
            <div className="sm:col-span-2"><Label>Access Token</Label><Input type="password" value={data.whatsapp?.access_token || ""} onChange={(e) => updWa({ access_token: e.target.value })} placeholder={data.whatsapp?.access_token === "********" ? "(unchanged)" : "EAA..."} /></div>
          </div>
          <p className="text-xs text-slate-400">Configure WhatsApp Cloud API to send automated workflow messages via WhatsApp.</p>
        </Card>
        </TabsContent>

        {/* ─── RBAC & Access Control Tab ─── */}
        <TabsContent value="rbac" className="space-y-6">
          {/* Role Access Matrix */}
          <Card className="p-6 rounded-2xl border-slate-100 card-soft space-y-4">
            <div>
              <h2 className="text-lg font-heading font-semibold flex items-center gap-2 text-slate-900">
                <ShieldCheck className="w-5 h-5 text-blue-600" />
                Role-Based Access Control (RBAC) Overview
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Centralized capability matrix defining permissions across all user roles.
              </p>
            </div>

            <div className="overflow-x-auto">
              <Table className="text-xs border border-slate-100 rounded-lg">
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="font-bold text-slate-700">Role</TableHead>
                    <TableHead className="font-bold text-slate-700">Scope</TableHead>
                    <TableHead className="font-bold text-slate-700">Forms & Workflows</TableHead>
                    <TableHead className="font-bold text-slate-700">Site Master</TableHead>
                    <TableHead className="font-bold text-slate-700">Vendors & Team</TableHead>
                    <TableHead className="font-bold text-slate-700">Master Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-semibold text-slate-900">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 font-bold text-[10px]">
                        <Shield className="w-3 h-3" /> Super Admin
                      </span>
                    </TableCell>
                    <TableCell className="text-slate-600">🌍 Global (All)</TableCell>
                    <TableCell className="text-slate-600">Full (Create/Edit/Delete)</TableCell>
                    <TableCell className="text-slate-600">Full Edit & Manage</TableCell>
                    <TableCell className="text-slate-600">Full Manage</TableCell>
                    <TableCell className="text-slate-600">Full Edit</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-semibold text-slate-900">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 font-bold text-[10px]">
                        <Shield className="w-3 h-3" /> Admin
                      </span>
                    </TableCell>
                    <TableCell className="text-slate-600">🏢 Regional / Cluster</TableCell>
                    <TableCell className="text-slate-600">Full (Create/Edit/Delete)</TableCell>
                    <TableCell className="text-slate-600">Inline Edit (Scoped)</TableCell>
                    <TableCell className="text-slate-600">View / Manage Users</TableCell>
                    <TableCell className="text-slate-600">View Only</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-semibold text-slate-900">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-bold text-[10px]">
                        Vendor Admin
                      </span>
                    </TableCell>
                    <TableCell className="text-slate-600">🏭 Vendor Organization</TableCell>
                    <TableCell className="text-slate-600">Fill & Submit Only</TableCell>
                    <TableCell className="text-slate-600">View Own Fleet Only</TableCell>
                    <TableCell className="text-slate-600">Manage Own Team</TableCell>
                    <TableCell className="text-slate-600">No Access</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-semibold text-slate-900">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[10px]">
                        Vendor User
                      </span>
                    </TableCell>
                    <TableCell className="text-slate-600">👤 Assigned Plants Only</TableCell>
                    <TableCell className="text-slate-600">Fill & Submit Only</TableCell>
                    <TableCell className="text-slate-600">View Assigned Only</TableCell>
                    <TableCell className="text-slate-600">No Access</TableCell>
                    <TableCell className="text-slate-600">No Access</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-semibold text-slate-900">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold text-[10px]">
                        User / Member
                      </span>
                    </TableCell>
                    <TableCell className="text-slate-600">👤 Self Only</TableCell>
                    <TableCell className="text-slate-600">Fill & View Own</TableCell>
                    <TableCell className="text-slate-600">No Access</TableCell>
                    <TableCell className="text-slate-600">No Access</TableCell>
                    <TableCell className="text-slate-600">No Access</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* Module Access Policies */}
          <Card className="p-6 rounded-2xl border-slate-100 card-soft space-y-4">
            <div>
              <h2 className="text-lg font-heading font-semibold text-slate-900">Module Access Policies & Toggles</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Enable or disable specific operational controls for Admin and Vendor roles across system modules.
              </p>
            </div>

            <div className="space-y-3 divide-y divide-slate-100">
              <div className="flex items-center justify-between pt-3">
                <div>
                  <Label className="font-semibold text-slate-800 text-sm">Admin Site Master Inline Editing</Label>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Allow Regional & Cluster Managers with Admin role to edit Site Master rows inline.
                  </p>
                </div>
                <Switch
                  checked={data.rbac?.admin_can_edit_sites !== false}
                  onCheckedChange={(v) => updRbac({ admin_can_edit_sites: v })}
                  data-testid="toggle-admin-edit-sites"
                />
              </div>

              <div className="flex items-center justify-between pt-3">
                <div>
                  <Label className="font-semibold text-slate-800 text-sm">Vendor Admin Site Master View</Label>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Allow Vendor Admins to view Site Master for their vendor portfolio (Read-Only).
                  </p>
                </div>
                <Switch
                  checked={data.rbac?.vendor_admin_can_view_sites !== false}
                  onCheckedChange={(v) => updRbac({ vendor_admin_can_view_sites: v })}
                  data-testid="toggle-vendor-admin-view-sites"
                />
              </div>

              <div className="flex items-center justify-between pt-3">
                <div>
                  <Label className="font-semibold text-slate-800 text-sm">Vendor User Site Master View</Label>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Allow Vendor Users to view Site Master for their assigned plants (Read-Only).
                  </p>
                </div>
                <Switch
                  checked={data.rbac?.vendor_user_can_view_sites !== false}
                  onCheckedChange={(v) => updRbac({ vendor_user_can_view_sites: v })}
                  data-testid="toggle-vendor-user-view-sites"
                />
              </div>

              <div className="flex items-center justify-between pt-3">
                <div>
                  <Label className="font-semibold text-slate-800 text-sm">Admin Form & Workflow Creation</Label>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Allow Admins to build and modify custom forms, PDF templates, and automation workflows.
                  </p>
                </div>
                <Switch
                  checked={data.rbac?.admin_can_create_forms !== false}
                  onCheckedChange={(v) => updRbac({ admin_can_create_forms: v })}
                  data-testid="toggle-admin-create-forms"
                />
              </div>

              <div className="flex items-center justify-between pt-3">
                <div>
                  <Label className="font-semibold text-slate-800 text-sm">Admin Master Data Table Editing</Label>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Allow Admins to add/edit rows in lookup tables (by default only Super Admin can edit master data).
                  </p>
                </div>
                <Switch
                  checked={!!data.rbac?.admin_can_edit_master_data}
                  onCheckedChange={(v) => updRbac({ admin_can_edit_master_data: v })}
                  data-testid="toggle-admin-edit-master-data"
                />
              </div>
            </div>
          </Card>

          {/* Emergency Access Override Manager */}
          <EmergencyOverrideCard />
        </TabsContent>

        <TabsContent value="advanced" className="space-y-6">
          <PlantDocsTemplateCard />
          <BackupRestoreCard />
        </TabsContent>
        </Tabs>

        <div className="mt-6 flex justify-end">
          <Button data-testid="save-settings" onClick={save} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
            {saving ? "Saving…" : "Save settings"}
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}

/**
 * PlantDocsTemplateCard — super_admin edits the default folder and subfolder
 * hierarchy that gets auto-created for every new plant. Reads/writes /api/plant-docs/template.
 */
function PlantDocsTemplateCard() {
  const [folders, setFolders] = useState([]);
  const [subfolders, setSubfolders] = useState({});
  const [permissions, setPermissions] = useState({});
  const [draft, setDraft] = useState("");
  const [subDrafts, setSubDrafts] = useState({});
  const [activeSubInput, setActiveSubInput] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [settingsFolder, setSettingsFolder] = useState(null);

  useEffect(() => {
    api.get("/plant-docs/template")
      .then((r) => {
        setFolders(r.data.folders || []);
        setSubfolders(r.data.subfolders || {});
        setPermissions(r.data.permissions || {});
      })
      .catch(() => { setFolders([]); setSubfolders({}); setPermissions({}); })
      .finally(() => setLoaded(true));
  }, []);

  const addFolder = () => {
    const n = draft.trim();
    if (!n) return;
    if (folders.includes(n)) { setDraft(""); return; }
    setFolders([...folders, n]);
    setDraft("");
  };

  const removeFolder = (n) => {
    setFolders(folders.filter((x) => x !== n));
    const newPerms = { ...permissions };
    delete newPerms[n];
    setPermissions(newPerms);

    const newSubs = { ...subfolders };
    delete newSubs[n];
    setSubfolders(newSubs);
  };

  const addSubfolder = (folderName) => {
    const sName = (subDrafts[folderName] || "").trim();
    if (!sName) return;
    const current = subfolders[folderName] || [];
    if (current.includes(sName)) {
      setSubDrafts({ ...subDrafts, [folderName]: "" });
      setActiveSubInput(null);
      return;
    }
    setSubfolders({
      ...subfolders,
      [folderName]: [...current, sName]
    });
    setSubDrafts({ ...subDrafts, [folderName]: "" });
    setActiveSubInput(null);
  };

  const removeSubfolder = (folderName, subName) => {
    setSubfolders({
      ...subfolders,
      [folderName]: (subfolders[folderName] || []).filter(x => x !== subName)
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.put("/plant-docs/template", { folders, subfolders, permissions });
      const n = r?.data?.propagated_to_plants;
      toast.success(
        typeof n === "number"
          ? `Folder & subfolder template saved · applied to ${n} plant${n === 1 ? "" : "s"}`
          : "Folder & subfolder template saved"
      );
    } catch (e) { toast.error(getErrorMessage(e, "Save failed")); }
    finally { setSaving(false); }
  };

  const roles = [
    { id: "super_admin", label: "Super Admin (always has full access)" },
    { id: "admin", label: "Admin" },
    { id: "vendor_admin", label: "Vendor Admin" },
    { id: "user", label: "Internal User" },
    { id: "vendor_user", label: "Vendor User" }
  ];

  const handlePermChange = (role, action, checked) => {
    if (!settingsFolder) return;
    const fPerms = permissions[settingsFolder] || {};
    
    if (!fPerms.view) fPerms.view = ["admin", "user", "vendor_admin", "vendor_user", "super_admin"];
    if (!fPerms.edit) fPerms.edit = ["admin", "super_admin"];

    let list = fPerms[action] || [];
    if (checked) {
      if (!list.includes(role)) list.push(role);
    } else {
      list = list.filter(r => r !== role);
    }
    
    setPermissions({
      ...permissions,
      [settingsFolder]: { ...fPerms, [action]: list }
    });
  };

  const getPermValue = (role, action) => {
    if (!settingsFolder) return false;
    const fPerms = permissions[settingsFolder];
    if (fPerms && fPerms[action] !== undefined) {
      return fPerms[action].includes(role);
    }
    if (action === "view") return true;
    if (action === "edit") return role === "admin" || role === "super_admin";
    return false;
  };

  if (!loaded) return null;
  return (
    <Card className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 card-soft mt-4 space-y-4 bg-white dark:bg-slate-900/90 text-slate-900 dark:text-white"
          data-testid="plant-docs-template-card">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
        <div>
          <div className="font-heading font-semibold text-base flex items-center gap-2 text-slate-900 dark:text-white">
            <FolderTree className="w-5 h-5 text-blue-500" /> Plant Document Folder Hierarchy
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Configure default folders and subfolders auto-created for every plant. Saving also syncs folders across all existing plants.
          </p>
        </div>
        <Button size="sm" className="bg-blue-600 hover:bg-blue-500 text-white shadow-sm gap-1.5"
                onClick={save} disabled={saving}
                data-testid="tpl-folder-save">
          <FolderPlus className="w-4 h-4" />
          {saving ? "Saving…" : "Save Template"}
        </Button>
      </div>

      {/* Folders & Subfolders list */}
      <div className="space-y-2.5">
        {folders.map((f) => {
          const sfList = subfolders[f] || [];
          const isAddingSub = activeSubInput === f;

          return (
            <div key={f}
                 className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 hover:bg-slate-100/70 dark:hover:bg-slate-950/90 p-3.5 transition-all space-y-2.5">
              {/* Folder header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Folder className="w-4 h-4 text-blue-500 shrink-0" />
                  <span className="font-semibold text-sm text-slate-800 dark:text-slate-100 tracking-tight">{f}</span>
                  {sfList.length > 0 ? (
                    <Badge variant="secondary" className="text-[10px] px-2 py-0 bg-blue-100/70 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/60 font-medium">
                      {sfList.length} subfolder{sfList.length > 1 ? "s" : ""}
                    </Badge>
                  ) : (
                    <span className="text-[11px] text-slate-400 dark:text-slate-400">No subfolders</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <Button variant="ghost" size="sm" onClick={() => setSettingsFolder(f)}
                          className="h-7 text-xs text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 gap-1 px-2"
                          data-testid={`tpl-folder-settings-${f}`}>
                    <Settings2 className="w-3.5 h-3.5" /> Permissions
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => removeFolder(f)}
                          className="h-7 w-7 p-0 text-slate-400 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg"
                          title="Delete folder"
                          data-testid={`tpl-folder-del-${f}`}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              {/* Subfolders row */}
              <div className="pl-6 pt-2 border-t border-slate-200/60 dark:border-slate-800 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mr-1 flex items-center gap-1">
                  <CornerDownRight className="w-3 h-3 text-slate-400" /> Subfolders:
                </span>

                {sfList.map((sf) => (
                  <span key={sf}
                        className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs shadow-xs group">
                    <Folder className="w-3 h-3 text-amber-500 shrink-0" />
                    <span className="font-medium text-[11px]">{sf}</span>
                    <button onClick={() => removeSubfolder(f, sf)}
                            className="text-slate-400 hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400 rounded p-0.5 transition-colors"
                            title={`Remove subfolder ${sf}`}
                            data-testid={`tpl-subfolder-del-${f}-${sf}`}>
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}

                {isAddingSub ? (
                  <div className="inline-flex items-center gap-1 bg-white dark:bg-slate-900 border border-blue-400 dark:border-blue-500 rounded-md p-0.5 shadow-xs">
                    <Input
                      value={subDrafts[f] || ""}
                      onChange={(e) => setSubDrafts({ ...subDrafts, [f]: e.target.value })}
                      placeholder="Subfolder name…"
                      className="h-6 text-xs w-32 px-1.5 border-0 focus-visible:ring-0 bg-transparent text-slate-900 dark:text-white placeholder:text-slate-400"
                      autoFocus
                      data-testid={`tpl-subfolder-input-${f}`}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addSubfolder(f);
                        if (e.key === "Escape") { setActiveSubInput(null); setSubDrafts({ ...subDrafts, [f]: "" }); }
                      }}
                    />
                    <Button size="sm" className="h-6 px-2 text-[11px] bg-blue-600 hover:bg-blue-500 text-white"
                            onClick={() => addSubfolder(f)}
                            data-testid={`tpl-subfolder-add-btn-${f}`}>
                      Add
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 px-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                            onClick={() => { setActiveSubInput(null); setSubDrafts({ ...subDrafts, [f]: "" }); }}>
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setActiveSubInput(f); setSubDrafts({ ...subDrafts, [f]: "" }); }}
                    className="h-6 px-2 text-[11px] border-dashed border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-400 dark:hover:border-blue-500 bg-white dark:bg-slate-900"
                    data-testid={`tpl-subfolder-open-input-${f}`}
                  >
                    <Plus className="w-3 h-3 mr-1" /> Add subfolder
                  </Button>
                )}
              </div>
            </div>
          );
        })}

        {folders.length === 0 && (
          <div className="text-center py-6 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-slate-400 text-xs bg-slate-50/40 dark:bg-slate-950/40">
            No default folders configured. Add a folder below to get started.
          </div>
        )}
      </div>

      {/* Add New Root Folder bar */}
      <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
        <Input value={draft} onChange={(e) => setDraft(e.target.value)}
               placeholder="Add root folder name (e.g. Reports, Contracts)…"
               className="h-9 text-sm max-w-sm border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder:text-slate-400"
               data-testid="tpl-folder-input"
               onKeyDown={(e) => e.key === "Enter" && addFolder()} />
        <Button size="sm" variant="outline" onClick={addFolder}
                data-testid="tpl-folder-add" className="h-9 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800">
          <Plus className="w-3.5 h-3.5 mr-1" /> Add Folder
        </Button>
      </div>

      {/* Permissions Dialog */}
      <Dialog open={!!settingsFolder} onOpenChange={(o) => !o && setSettingsFolder(null)}>
        <DialogContent className="sm:max-w-md bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg text-slate-900 dark:text-white">
              <Settings2 className="w-5 h-5 text-slate-400" />
              Permissions: <span className="font-mono text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 px-2 py-0.5 rounded-md text-base">{settingsFolder}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-4">
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Select which roles can view this folder, and which roles can upload/edit files inside it.
            </p>
            <div className="grid grid-cols-[1fr_60px_60px] gap-3 text-sm font-medium border-b border-slate-100 dark:border-slate-800 pb-2 text-slate-600 dark:text-slate-300">
              <div>Role</div>
              <div className="text-center">View</div>
              <div className="text-center">Edit</div>
            </div>
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
              {roles.map(role => (
                <div key={role.id} className="grid grid-cols-[1fr_60px_60px] gap-3 items-center hover:bg-slate-50 dark:hover:bg-slate-800/60 p-1.5 -mx-1.5 rounded-lg transition-colors text-slate-700 dark:text-slate-200">
                  <div className="text-sm">
                    {role.label}
                    {role.id === "super_admin" && <span className="block text-[10px] text-slate-400">Can't be disabled</span>}
                  </div>
                  <div className="flex justify-center">
                    <Checkbox 
                      checked={role.id === "super_admin" ? true : getPermValue(role.id, "view")}
                      onCheckedChange={(c) => handlePermChange(role.id, "view", c)}
                      disabled={role.id === "super_admin"}
                    />
                  </div>
                  <div className="flex justify-center">
                    <Checkbox 
                      checked={role.id === "super_admin" ? true : getPermValue(role.id, "edit")}
                      onCheckedChange={(c) => handlePermChange(role.id, "edit", c)}
                      disabled={role.id === "super_admin"}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter className="sm:justify-between border-t border-slate-100 dark:border-slate-800 pt-4 mt-2">
            <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900/60 px-2 py-1 rounded-md self-center">
              Remember to "Save Template" on the settings page to apply changes.
            </span>
            <Button type="button" onClick={() => setSettingsFolder(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
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
  const fileInputRef = useRef(null);

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
    } catch (e) { toast.error(getErrorMessage(e, "Save failed")); }
  };

  const backupNow = async () => {
    const customPass = window.prompt("Enter Encryption Password for this RAR backup archive:\n\n(Optional: Leave blank to use system default password from .env)", "");
    if (customPass === null) return;
    setBusy(true);
    try {
      await api.post("/backups", { password: customPass });
      toast.success("Encrypted RAR backup snapshot created successfully");
      load();
    } catch (e) { toast.error(getErrorMessage(e, "Backup failed")); }
    finally { setBusy(false); }
  };

  /**
   * Create a fresh RAR snapshot AND download it in one click — the resulting
   * .rar file is compatible with restore on any FormForge instance.
   */
  const downloadMigrationBundle = async () => {
    const customPass = window.prompt("Enter Encryption Password for RAR Migration Bundle:\n\n(Optional: Leave blank to use system default password from .env)", "");
    if (customPass === null) return;
    setBusy(true);
    try {
      const created = await api.post("/backups", { password: customPass });
      const name = created?.data?.name;
      if (!name) throw new Error("Snapshot creation returned no name");
      const r = await api.get(`/backups/${encodeURIComponent(name)}/download`, { responseType: "blob" });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success("Encrypted RAR migration bundle downloaded");
      load();
    } catch (e) { toast.error(getErrorMessage(e, "Download failed")); }
    finally { setBusy(false); }
  };

  const restore = async (name) => {
    if (!window.confirm(`Restore "${name}"?\n\nThis will REPLACE current MongoDB data and uploaded files.`)) return;
    const pass = window.prompt(`Enter Decryption Password for "${name}":\n\n(Enter custom password if set, or leave blank to try system default password):`, "");
    if (pass === null) return;
    setBusy(true);
    try {
      await api.post(`/backups/${encodeURIComponent(name)}/restore`, { password: pass });
      toast.success("RAR backup restored successfully — please reload page");
    } catch (e) { toast.error(getErrorMessage(e, "Restore failed")); }
    finally { setBusy(false); }
  };

  /**
   * Upload-restore: user picks a `.rar` / `.tar.gz` from their own disk.
   */
  const restoreFromFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file later
    if (!file) return;
    if (!file.name.endsWith(".rar") && !file.name.endsWith(".tar.gz") && !file.name.endsWith(".tgz") && !file.name.endsWith(".enc")) {
      toast.error("Please pick a valid .rar, .tar.gz, or .enc backup file");
      return;
    }
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    if (!window.confirm(
      `Restore "${file.name}" (${mb} MB)?\n\n` +
      "This will REPLACE current MongoDB data and all uploaded files.\n" +
      "This action cannot be undone."
    )) return;
    const pass = window.prompt(`Enter Decryption Password for uploaded RAR file "${file.name}":\n\n(Enter password used when creating this backup file):`, "");
    if (pass === null) return;

    setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    if (pass) fd.append("password", pass);
    try {
      await api.post("/backups/upload-restore", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 15 * 60 * 1000,
      });
      toast.success("Restored from uploaded RAR file successfully — please reload page");
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, "Restore failed"));
    } finally {
      setBusy(false);
    }
  };

  const del = async (name) => {
    if (!window.confirm(`Delete snapshot "${name}"?`)) return;
    try {
      await api.delete(`/backups/${encodeURIComponent(name)}`);
      load();
    } catch (e) { toast.error(getErrorMessage(e, "Delete failed")); }
  };

  const download = async (name) => {
    try {
      const r = await api.get(`/backups/${encodeURIComponent(name)}/download`, { responseType: "blob" });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error(getErrorMessage(e, "Download failed")); }
  };

  return (
    <Card className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 card-soft mt-4 space-y-4 bg-white dark:bg-slate-900/90 text-slate-900 dark:text-white"
          data-testid="backup-restore-card">
      <div className="font-heading font-semibold flex items-center gap-2 text-slate-900 dark:text-white">
        <Archive className="w-4 h-4 text-blue-500" /> Backup &amp; Restore (RAR Format)
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 -mt-2">
        Snapshots are generated as password-protected <b>.rar</b> archives containing MongoDB + uploaded files. Retained for {cfg.retention_days} days.
      </p>

      {/* Auto backup */}
      <div className="flex flex-wrap items-end gap-3 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 bg-slate-50/70 dark:bg-slate-950/60">
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <input type="checkbox" checked={!!cfg.enabled}
                 data-testid="backup-auto-toggle"
                 onChange={(e) => saveCfg({ enabled: e.target.checked })}
                 className="w-4 h-4 accent-blue-600 rounded" />
          <span className="font-medium text-slate-700 dark:text-slate-200">Automatic daily backup (.rar)</span>
        </label>
        <div className="ml-4">
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">Time (UTC)</div>
          <div className="flex items-center gap-1">
            <Input type="number" min="0" max="23"
                   value={cfg.hour_utc}
                   data-testid="backup-hour"
                   onChange={(e) => saveCfg({ hour_utc: Number(e.target.value) })}
                   className="h-8 w-16 text-sm border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white" />
            <span className="text-slate-400">:</span>
            <Input type="number" min="0" max="59"
                   value={cfg.minute_utc}
                   data-testid="backup-minute"
                   onChange={(e) => saveCfg({ minute_utc: Number(e.target.value) })}
                   className="h-8 w-16 text-sm border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white" />
          </div>
        </div>
        <div className="ml-auto">
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">Last run</div>
          <div className="text-xs text-slate-700 dark:text-slate-300 font-medium">
            {cfg.last_run_at ? formatDate(cfg.last_run_at) : "—"}
          </div>
        </div>
        <Button size="sm" onClick={backupNow} disabled={busy}
                data-testid="backup-now"
                className="bg-blue-600 hover:bg-blue-500 text-white">
          <Archive className="w-3.5 h-3.5 mr-1" /> {busy ? "Working…" : "Backup now (.rar)"}
        </Button>
        <Button size="sm" variant="outline" onClick={downloadMigrationBundle}
                disabled={busy}
                data-testid="backup-migration-bundle"
                className="border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 bg-white dark:bg-slate-900"
                title="Create a fresh encrypted RAR snapshot and download it right away.">
          <DownloadCloud className="w-3.5 h-3.5 mr-1" /> Migration bundle (.rar)
        </Button>
        <Button size="sm" variant="outline"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
                data-testid="backup-upload-restore"
                className="border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 bg-white dark:bg-slate-900"
                title="Restore the whole app from a .rar backup file on your computer.">
          <UploadCloud className="w-3.5 h-3.5 mr-1" /> Restore from file…
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".rar,.tar.gz,.tgz,.enc,application/x-rar-compressed,application/octet-stream"
          className="hidden"
          onChange={restoreFromFile}
          data-testid="backup-upload-restore-input"
        />
      </div>

      {/* Snapshots list */}
      <div>
        <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
          Snapshots <span className="text-slate-400 font-normal">({snaps.length})</span>
        </div>
        {snaps.length === 0 ? (
          <div className="text-xs text-slate-400 dark:text-slate-400 py-6 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/40 dark:bg-slate-950/40">
            No snapshots yet — click "Backup now" to create one.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-950/40">
            {snaps.map((s) => (
              <div key={s.name} className="flex items-center gap-3 p-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition-colors"
                   data-testid={`snap-${s.name}`}>
                <Archive className="w-4 h-4 text-slate-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{s.name}</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">
                    {formatBytesLocal(s.size_bytes)} · {formatDate(s.created_at)}
                  </div>
                </div>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                        onClick={() => download(s.name)} title="Download">
                  <DownloadCloud className="w-3.5 h-3.5 mr-1" /> Download
                </Button>
                <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/50 bg-white dark:bg-slate-900"
                        onClick={() => restore(s.name)}
                        data-testid={`restore-${s.name}`}
                        title="Restore this snapshot">
                  <RotateCcw className="w-3.5 h-3.5 mr-1" /> Restore
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
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

function EmergencyOverrideCard() {
  const [adminUsers, setAdminUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = () => {
    setLoading(true);
    api
      .get("/users")
      .then((r) => setAdminUsers(r.data || []))
      .catch(() => setAdminUsers([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const toggleOverride = async (user) => {
    const next = !user.access_override;
    try {
      await api.put(`/users/${user.user_id}/access-override`, { access_override: next });
      toast.success(`${user.name || user.email}: Override ${next ? "ENABLED" : "DISABLED"}`);
      load();
    } catch (e) {
      toast.error(getErrorMessage(e, "Failed to update override"));
    }
  };

  const filtered = adminUsers.filter(
    (u) =>
      !q || `${u.name || ""} ${u.email || ""} ${u.role || ""}`.toLowerCase().includes(q.toLowerCase())
  );

  const overrideUsers = adminUsers.filter((u) => u.access_override);

  return (
    <Card className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 card-soft space-y-4 bg-white dark:bg-slate-900/90 text-slate-900 dark:text-white">
      <div>
        <h2 className="text-lg font-heading font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-amber-500" />
          Emergency Access Override Management
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Users flagged with <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded font-mono text-amber-700 dark:text-amber-400">access_override = true</code> bypass all region/vendor filters and gain Super Admin access.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search users by name, email, or role…"
            className="pl-9 h-9 text-xs border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder:text-slate-400"
          />
        </div>
        <span className="text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-2.5 py-1 rounded-full border border-amber-200 dark:border-amber-800">
          {overrideUsers.length} active override{overrideUsers.length !== 1 && "s"}
        </span>
      </div>

      {loading ? (
        <div className="text-xs text-slate-400 py-4">Loading user overrides…</div>
      ) : (
        <div className="max-h-60 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-950/40">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">No matching users found</div>
          ) : (
            filtered.map((u) => (
              <div key={u.user_id} className="flex items-center justify-between p-3 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
                <div>
                  <div className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    {u.name || u.email}
                    {u.access_override && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 text-[10px] font-bold border border-amber-200 dark:border-amber-800">
                        OVERRIDE ACTIVE
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">{u.email} · <span className="capitalize">{u.role}</span></div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Override</span>
                  <Switch
                    checked={!!u.access_override}
                    onCheckedChange={() => toggleOverride(u)}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </Card>
  );
}
