import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, ShieldCheck, CheckCircle2, AlertTriangle, Lock, Server, Globe, KeyRound, Save, RefreshCw, Layers, Info, ShieldAlert, Check, Copy, Laptop, Rocket, Code2 } from "lucide-react";
import { toast } from "sonner";

export default function SecuritySettingsPage() {
  const navigate = useNavigate();
  const [cfg, setCfg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState(null);
  const [showStrictDetails, setShowStrictDetails] = useState(false);
  const [showNginxModal, setShowNginxModal] = useState(false);

  // Form field states for inline resolutions
  const [deploymentMode, setDeploymentMode] = useState("local");
  const [productionDomain, setProductionDomain] = useState("https://forms.cleanmax.com");
  const [corsOrigins, setCorsOrigins] = useState("*");
  const [securityHttps, setSecurityHttps] = useState(false);
  const [securityStrict, setSecurityStrict] = useState(true);
  const [maxUploadMb, setMaxUploadMb] = useState(25);
  const [loginMaxAttempts, setLoginMaxAttempts] = useState(8);

  const loadSettings = async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const res = await api.get("/security/settings");
      setCfg(res.data);
      if (res.data.values) {
        setDeploymentMode(res.data.deployment_mode || "local");
        setProductionDomain(res.data.production_domain || "https://forms.cleanmax.com");
        setCorsOrigins(res.data.values.cors_origins || "*");
        setSecurityHttps(!!res.data.values.security_https);
        setSecurityStrict(!!res.data.values.security_strict);
        setMaxUploadMb(res.data.values.max_upload_mb || 25);
        setLoginMaxAttempts(res.data.values.login_max_attempts || 8);
      }
    } catch {
      toast.error("Failed to load security settings");
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  useEffect(() => { loadSettings(true); }, []);

  // Quick single-setting save handler
  const saveSetting = async (key, payload, successMessage) => {
    setSavingKey(key);
    try {
      await api.post("/security/settings", payload);
      toast.success(successMessage || "Security setting updated successfully");
      await loadSettings(false);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to save setting");
    } finally {
      setSavingKey(null);
    }
  };

  const handleApplyProductionMode = () => {
    if (!productionDomain || productionDomain.trim().length < 5) {
      toast.error("Please enter a valid website domain link (e.g. https://forms.cleanmax.com)");
      return;
    }
    const cleanDomain = productionDomain.trim().rstrip ? productionDomain.trim().rstrip('/') : productionDomain.trim();
    saveSetting(
      "deploy",
      { deployment_mode: "production", production_domain: cleanDomain },
      `Switched to Online Production Mode! CORS set to ${cleanDomain}, HTTPS HSTS enabled, and Strict Mode activated.`
    );
  };

  const handleSwitchToLocalDev = () => {
    saveSetting(
      "deploy",
      { deployment_mode: "local" },
      "Switched to Local Development Mode (HTTP, CORS: http://localhost:3000)."
    );
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    toast.success(`Copied ${label} to clipboard!`);
  };

  const generateRandomSecret = () => {
    const array = new Uint8Array(32);
    window.crypto.getRandomValues(array);
    const hex = Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
    saveSetting("jwt", { jwt_secret: hex }, "Generated & applied new 64-byte random JWT secret key");
  };

  if (loading || !cfg) {
    return <AppLayout><div className="text-slate-400 p-8">Loading security configuration status…</div></AppLayout>;
  }

  const strictFeatures = [
    { title: "JWT High Entropy Enforcement", desc: "Hard fails server startup if JWT_SECRET is default 'dev-secret' or under 32 characters." },
    { title: "CORS Wildcard Rejection", desc: "Prohibits wildcard '*' origins in non-development mode to block malicious cross-origin scripts." },
    { title: "HSTS & Security Headers Middleware", desc: "Injects Strict-Transport-Security, X-Frame-Options: DENY, X-Content-Type-Options: nosniff, and CSP." },
    { title: "Brute Force Lockout Limiter", desc: "Tracks authentication failures per IP and locks out IP addresses exceeding attempt thresholds." },
    { title: "Binary Magic Bytes Signature Validation", desc: "Inspects file byte signatures during upload to prevent disguised executable payloads." },
    { title: "Ollama / AI Service Fault Isolation", desc: "Ensures core application (forms, submissions, PDFs, workflows) operates even if AI models fail." }
  ];

  const isProduction = deploymentMode === "production";

  return (
    <AppLayout>
      <div className="max-w-5xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/security")}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Security Center
          </Button>

          <Button
            onClick={() => setShowStrictDetails(!showStrictDetails)}
            variant="outline"
            className="text-xs font-semibold border-slate-200 hover:bg-slate-50"
          >
            <Info className="w-4 h-4 mr-1.5 text-blue-600" />
            {showStrictDetails ? "Hide Strict Security Specs" : "What is included in Strict Mode?"}
          </Button>
        </div>

        <div>
          <h1 className="text-3xl font-heading font-bold text-slate-900 flex items-center gap-2">
            <Lock className="w-7 h-7 text-blue-600" />
            Security & Deployment Mode Center
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            Switch between <strong>Local Development</strong> and <strong>Online Production</strong>. Entering your domain link automatically configures HTTPS HSTS, CORS restrictions, and Strict Security Mode.
          </p>
        </div>

        {/* Deployment Environment Switcher Card */}
        <Card className="p-6 rounded-2xl border-slate-200 bg-white space-y-5 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <div className="text-base font-bold text-slate-900 flex items-center gap-2">
                {isProduction ? <Rocket className="w-5 h-5 text-emerald-600" /> : <Laptop className="w-5 h-5 text-blue-600" />}
                Active Deployment Mode: <span className={isProduction ? "text-emerald-700 font-extrabold" : "text-blue-700 font-extrabold"}>
                  {isProduction ? "Online Production Deployment 🌐" : "Local Development Mode 💻"}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {isProduction
                  ? `Configured for production domain: ${cfg.production_domain || productionDomain}`
                  : "Running in local development environment (http://localhost:3000)."
                }
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant={!isProduction ? "default" : "outline"}
                size="sm"
                onClick={handleSwitchToLocalDev}
                disabled={savingKey === "deploy"}
                className={!isProduction ? "bg-blue-600 text-white font-bold" : "text-slate-700"}
              >
                <Laptop className="w-3.5 h-3.5 mr-1" /> Local Dev
              </Button>
              <Button
                variant={isProduction ? "default" : "outline"}
                size="sm"
                onClick={() => setDeploymentMode("production")}
                disabled={savingKey === "deploy"}
                className={isProduction ? "bg-emerald-600 hover:bg-emerald-700 text-white font-bold" : "text-slate-700"}
              >
                <Rocket className="w-3.5 h-3.5 mr-1" /> Online Production
              </Button>
            </div>
          </div>

          {/* Online Production Setup Form */}
          <div className="space-y-4 pt-1">
            <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
              <Globe className="w-4 h-4 text-emerald-600" />
              Website Domain / DNS Link Configuration
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div className="sm:col-span-2 space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Production Domain or DNS Link</Label>
                <Input
                  value={productionDomain}
                  onChange={(e) => setProductionDomain(e.target.value)}
                  placeholder="https://forms.cleanmax.com"
                  className="font-mono text-xs"
                />
                <div className="text-[11px] text-slate-500 flex items-center gap-2">
                  <span>Examples / Defaults:</span>
                  <button
                    type="button"
                    onClick={() => setProductionDomain("https://forms.cleanmax.com")}
                    className="text-blue-600 underline font-mono"
                  >
                    https://forms.cleanmax.com
                  </button>
                  <button
                    type="button"
                    onClick={() => setProductionDomain("https://forms.yourcompany.com")}
                    className="text-blue-600 underline font-mono"
                  >
                    https://forms.yourcompany.com
                  </button>
                </div>
              </div>

              <Button
                onClick={handleApplyProductionMode}
                disabled={savingKey === "deploy"}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 w-full shadow-sm"
              >
                <Rocket className="w-4 h-4 mr-1.5" />
                {savingKey === "deploy" ? "Applying..." : "Apply & Bring Online"}
              </Button>
            </div>

            {/* Cascading Effects Callout */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600 space-y-1">
              <div className="font-bold text-slate-800 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                Automated Cascading Security Updates when switching Online:
              </div>
              <ul className="list-disc pl-5 space-y-0.5 text-[11px] text-slate-600">
                <li><strong>CORS Allowed Origins</strong> automatically updates to <code className="bg-white px-1 py-0.5 rounded border border-slate-200 font-mono">{productionDomain || "https://forms.cleanmax.com"}</code></li>
                <li><strong>HTTPS / HSTS Enforcement</strong> automatically turns <strong className="text-emerald-700">ON (Enabled ✓)</strong></li>
                <li><strong>Strict Security Mode</strong> automatically turns <strong className="text-emerald-700">ON (Strict ✓)</strong></li>
              </ul>
            </div>
          </div>
        </Card>

        {/* Nginx & Certbot Online Deployment Helper Modal / Section */}
        <Card className="p-5 rounded-2xl border-slate-200 bg-slate-900 text-slate-100 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Code2 className="w-5 h-5 text-emerald-400" />
              <div>
                <div className="font-bold text-sm text-white">Online Reverse Proxy & SSL Setup Details</div>
                <div className="text-xs text-slate-400">Nginx configuration and Let's Encrypt Certbot SSL command generator.</div>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowNginxModal(!showNginxModal)}
              className="text-xs bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
            >
              {showNginxModal ? "Hide Setup Snippets" : "Show Setup Details & Commands"}
            </Button>
          </div>

          {showNginxModal && (
            <div className="space-y-4 pt-3 border-t border-slate-800 text-xs">
              {/* Certbot SSL Command */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-slate-300 font-bold">
                  <span>1. SSL / TLS Certificate Command (Certbot)</span>
                  <button
                    onClick={() => copyToClipboard(cfg.certbot_cmd || `sudo certbot --nginx -d ${cfg.domain_host || "forms.cleanmax.com"}`, "Certbot command")}
                    className="text-emerald-400 text-xs flex items-center gap-1 hover:underline font-mono"
                  >
                    <Copy className="w-3 h-3" /> Copy Command
                  </button>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 font-mono text-[11px] text-emerald-400 border border-slate-800">
                  {cfg.certbot_cmd || `sudo certbot --nginx -d ${cfg.domain_host || "forms.cleanmax.com"}`}
                </div>
              </div>

              {/* Nginx Configuration Snippet */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-slate-300 font-bold">
                  <span>2. Nginx Reverse Proxy Config (/etc/nginx/sites-available/formforge)</span>
                  <button
                    onClick={() => copyToClipboard(cfg.nginx_snippet || "", "Nginx configuration")}
                    className="text-emerald-400 text-xs flex items-center gap-1 hover:underline font-mono"
                  >
                    <Copy className="w-3 h-3" /> Copy Nginx Config
                  </button>
                </div>
                <pre className="p-3.5 rounded-xl bg-slate-950 font-mono text-[11px] text-slate-300 border border-slate-800 overflow-x-auto max-h-60">
                  {cfg.nginx_snippet}
                </pre>
              </div>
            </div>
          )}
        </Card>

        {/* What is Included in Strict Security Mode Banner */}
        {showStrictDetails && (
          <Card className="p-6 rounded-2xl border-blue-100 bg-gradient-to-br from-blue-50/70 to-indigo-50/50 space-y-4">
            <div className="flex items-center gap-2 font-bold text-blue-900 text-base">
              <ShieldCheck className="w-6 h-6 text-blue-600" />
              FormForge Strict Security Mode Architecture
            </div>
            <p className="text-xs text-slate-600">
              When <strong>Strict Security Mode</strong> is enabled, FormForge enforces 6 mandatory security controls across application startup and runtime:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              {strictFeatures.map((feat, idx) => (
                <div key={idx} className="p-3 rounded-xl bg-white/80 border border-blue-100/80 space-y-1">
                  <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    {feat.title}
                  </div>
                  <div className="text-[11px] text-slate-500 pl-5">{feat.desc}</div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Resolution Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          
          {/* Card 1: JWT Secret Key */}
          <Card className="p-5 rounded-2xl border-slate-100 bg-white space-y-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-slate-900 text-sm">JWT Secret Key</div>
                  <div className="text-xs text-slate-500 font-mono">
                    Key: {cfg.values?.jwt_secret_masked || "••••••••"}
                  </div>
                </div>
              </div>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1 ${
                cfg.jwt_secret?.configured ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
              }`}>
                {cfg.jwt_secret?.configured ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                {cfg.jwt_secret?.status}
              </span>
            </div>

            <div className="pt-3 border-t border-slate-100 space-y-2">
              <div className="text-xs font-bold text-slate-700">Inline Resolution</div>
              <Button
                onClick={generateRandomSecret}
                disabled={savingKey === "jwt"}
                size="sm"
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${savingKey === "jwt" ? "animate-spin" : ""}`} />
                {savingKey === "jwt" ? "Generating Key…" : "Generate & Apply 64-Byte Random Key"}
              </Button>
            </div>
          </Card>

          {/* Card 2: CORS Origin Policy */}
          <Card className="p-5 rounded-2xl border-slate-100 bg-white space-y-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Globe className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-slate-900 text-sm">CORS Origin Restriction</div>
                  <div className="text-xs text-slate-500 font-mono truncate max-w-[200px]">
                    Allowed: {corsOrigins}
                  </div>
                </div>
              </div>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1 ${
                cfg.cors?.configured ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
              }`}>
                {cfg.cors?.configured ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                {cfg.cors?.status}
              </span>
            </div>

            <div className="pt-3 border-t border-slate-100 space-y-2 text-xs">
              <div className="text-xs font-bold text-slate-700">Inline Resolution / Update Origin</div>
              <div className="flex items-center gap-2">
                <Input
                  value={corsOrigins}
                  onChange={(e) => setCorsOrigins(e.target.value)}
                  placeholder="https://forms.cleanmax.com"
                  className="font-mono text-xs h-8"
                />
                <Button
                  onClick={() => saveSetting("cors", { cors_origins: corsOrigins }, `CORS origins updated to ${corsOrigins}`)}
                  disabled={savingKey === "cors"}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold h-8 text-xs shrink-0"
                >
                  <Save className="w-3.5 h-3.5 mr-1" /> Save
                </Button>
              </div>
            </div>
          </Card>

          {/* Card 3: HTTPS / TLS Encryption */}
          <Card className="p-5 rounded-2xl border-slate-100 bg-white space-y-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-slate-900 text-sm">HTTPS / TLS Encryption</div>
                  <div className="text-xs text-slate-500">
                    HSTS: {securityHttps ? "Enforced (Strict)" : "HTTP Dev Mode"}
                  </div>
                </div>
              </div>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1 ${
                cfg.https?.configured ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
              }`}>
                {cfg.https?.configured ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                {cfg.https?.status}
              </span>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <div>
                <div className="font-bold text-slate-800">Enforce HTTPS / HSTS Header</div>
                <div className="text-[11px] text-slate-400">Injects Strict-Transport-Security headers.</div>
              </div>
              <Switch
                checked={securityHttps}
                onCheckedChange={(val) => {
                  setSecurityHttps(val);
                  saveSetting("https", { security_https: val }, `HTTPS HSTS enforcement set to ${val ? "ON" : "OFF"}`);
                }}
              />
            </div>
          </Card>

          {/* Card 4: Strict Security Mode */}
          <Card className="p-5 rounded-2xl border-slate-100 bg-white space-y-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-slate-900 text-sm">Strict Security Mode</div>
                  <div className="text-xs text-slate-500">
                    Startup Assertions: {securityStrict ? "Strict Enabled" : "Bypassed"}
                  </div>
                </div>
              </div>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1 ${
                cfg.strict_mode?.configured ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
              }`}>
                {cfg.strict_mode?.configured ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                {cfg.strict_mode?.status}
              </span>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <div>
                <div className="font-bold text-slate-800">Enable Strict Security Mode</div>
                <div className="text-[11px] text-slate-400">Hard fail startup on weak secrets or wildcard CORS.</div>
              </div>
              <Switch
                checked={securityStrict}
                onCheckedChange={(val) => {
                  setSecurityStrict(val);
                  saveSetting("strict", { security_strict: val }, `Strict Security Mode set to ${val ? "ON" : "OFF"}`);
                }}
              />
            </div>
          </Card>

          {/* Card 5: Max File Upload Size */}
          <Card className="p-5 rounded-2xl border-slate-100 bg-white space-y-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-slate-900 text-sm">Max File Upload Size</div>
                  <div className="text-xs text-slate-500 font-mono">
                    Cap: {maxUploadMb} MB
                  </div>
                </div>
              </div>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Enforced ✓
              </span>
            </div>

            <div className="pt-3 border-t border-slate-100 space-y-2 text-xs">
              <div className="text-xs font-bold text-slate-700">Inline Resolution / Set Cap (MB)</div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={maxUploadMb}
                  onChange={(e) => setMaxUploadMb(e.target.value)}
                  min={1}
                  max={500}
                  className="font-mono text-xs h-8"
                />
                <Button
                  onClick={() => saveSetting("upload", { max_upload_mb: Number(maxUploadMb) }, `Max upload cap updated to ${maxUploadMb} MB`)}
                  disabled={savingKey === "upload"}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold h-8 text-xs shrink-0"
                >
                  <Save className="w-3.5 h-3.5 mr-1" /> Update Cap
                </Button>
              </div>
            </div>
          </Card>

          {/* Card 6: Login Lockout Threshold */}
          <Card className="p-5 rounded-2xl border-slate-100 bg-white space-y-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-slate-900 text-sm">Login Lockout Attempts</div>
                  <div className="text-xs text-slate-500 font-mono">
                    Threshold: {loginMaxAttempts} attempts / 15m
                  </div>
                </div>
              </div>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Enforced ✓
              </span>
            </div>

            <div className="pt-3 border-t border-slate-100 space-y-2 text-xs">
              <div className="text-xs font-bold text-slate-700">Inline Resolution / Lockout Threshold</div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={loginMaxAttempts}
                  onChange={(e) => setLoginMaxAttempts(e.target.value)}
                  min={3}
                  max={50}
                  className="font-mono text-xs h-8"
                />
                <Button
                  onClick={() => saveSetting("lockout", { login_max_attempts: Number(loginMaxAttempts) }, `Lockout threshold set to ${loginMaxAttempts} attempts`)}
                  disabled={savingKey === "lockout"}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold h-8 text-xs shrink-0"
                >
                  <Save className="w-3.5 h-3.5 mr-1" /> Update Threshold
                </Button>
              </div>
            </div>
          </Card>

        </div>
      </div>
    </AppLayout>
  );
}
