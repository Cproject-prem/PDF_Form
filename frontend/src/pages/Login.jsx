import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Sparkles, Mail, Lock } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, branding } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  // Support two redirect sources: (a) the classic `state.from` set by our
  // <RequireAuth> guard, and (b) `?next=<url>` used by the public form
  // pages so the visitor is bounced back to the exact submission URL.
  const nextParam = new URLSearchParams(loc.search).get("next");
  const to = nextParam || loc.state?.from?.pathname || "/dashboard";

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success("Welcome back");
      nav(to, { replace: true });
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Login failed");
    } finally { setLoading(false); }
  };

  const googleLogin = () => {
    const redirectUrl = window.location.origin + "/auth/callback";
    const clientId = branding?.google_client_id;
    if (clientId) {
      const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUrl)}&response_type=code&scope=openid%20email%20profile&prompt=select_account`;
      window.location.href = googleAuthUrl;
    } else {
      toast.error("Google OAuth is not configured yet. Please configure your Google Client ID under Settings → General & Branding.");
    }
  };

  const loginBgUrl = branding?.login_bg_url
    ? (branding.login_bg_url.startsWith("http")
        ? branding.login_bg_url
        : `${process.env.REACT_APP_BACKEND_URL || ""}${branding.login_bg_url}`)
    : "https://images.pexels.com/photos/4253054/pexels-photo-4253054.jpeg";

  const cleanBg = (loginBgUrl || "").split("?")[0].toLowerCase();
  const isLoginVideo = cleanBg.endsWith(".mp4") || cleanBg.endsWith(".webm") || cleanBg.endsWith(".mov") || cleanBg.endsWith(".ogg") || cleanBg.endsWith(".m4v");

  return (
    <div className="relative min-h-screen w-full flex flex-col justify-between overflow-x-hidden bg-slate-950 text-white p-6 sm:p-10">
      {/* Full Page Background Video or Image */}
      {isLoginVideo ? (
        <video
          src={loginBgUrl}
          autoPlay
          loop
          muted
          playsInline
          className="fixed inset-0 w-full h-full object-cover z-0 opacity-50 pointer-events-none"
        />
      ) : (
        <div
          className="fixed inset-0 w-full h-full object-cover z-0 opacity-50 pointer-events-none"
          style={{
            backgroundImage: `url(${loginBgUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
      )}
      {/* Gradient Dark Overlay */}
      <div className="fixed inset-0 z-0 bg-gradient-to-t from-slate-950/90 via-slate-950/60 to-slate-950/80 pointer-events-none backdrop-blur-[1px]" />

      {/* Top Header Branding */}
      <header className="relative z-10 flex items-center justify-between w-full max-w-7xl mx-auto pt-2">
        <div className="flex items-center gap-3">
          {branding?.logo_url ? (
            <img
              src={branding.logo_url.startsWith("http")
                ? branding.logo_url
                : `${process.env.REACT_APP_BACKEND_URL || ""}${branding.logo_url}`}
              alt="logo"
              className="w-10 h-10 rounded-xl object-contain bg-white/10 p-1 backdrop-blur-md border border-white/20 shadow-lg"
            />
          ) : (
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg"
              style={{ background: branding?.primary_color || "#2563EB" }}
            ><Sparkles className="w-5 h-5 text-white" /></div>
          )}
          <span className="font-heading font-bold text-2xl tracking-tight text-white drop-shadow-md">
            {branding?.app_name || "FormForge"}
          </span>
        </div>
      </header>

      {/* Centered Floating Glassmorphism Form Card */}
      <main className="relative z-10 flex items-center justify-center my-8 w-full max-w-md mx-auto">
        <div className="w-full bg-slate-900/90 backdrop-blur-2xl border border-slate-700/60 rounded-3xl p-8 sm:p-10 shadow-2xl shadow-black/80 text-white">
          <div className="mb-6 text-center sm:text-left">
            <h2 className="text-3xl font-heading font-bold tracking-tight text-white">Sign in</h2>
            <p className="text-slate-400 mt-1.5 text-sm">Welcome back — enter your credentials.</p>
          </div>

          <form onSubmit={submit} className="space-y-4" data-testid="login-form">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-slate-300 font-medium text-xs">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  id="email"
                  data-testid="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 h-11 bg-slate-950/70 border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:bg-slate-950 rounded-xl"
                  placeholder="you@example.com"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-slate-300 font-medium text-xs">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  id="password"
                  data-testid="login-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 h-11 bg-slate-950/70 border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:bg-slate-950 rounded-xl"
                  placeholder="••••••••"
                />
              </div>
            </div>
            <Button
              type="submit"
              disabled={loading}
              data-testid="login-submit"
              className="w-full h-11 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl shadow-lg shadow-blue-600/30 transition-all mt-2"
            >
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          {branding?.enable_google_login !== false && (
            <>
              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-800" /></div>
                <div className="relative flex justify-center text-xs"><span className="bg-slate-900 px-3 text-slate-400 uppercase tracking-wider font-semibold">or</span></div>
              </div>

              <Button
                data-testid="google-login"
                variant="outline"
                onClick={googleLogin}
                className="w-full h-11 rounded-xl border-slate-700 bg-slate-950/50 hover:bg-slate-800 text-slate-200 hover:text-white font-medium"
              >
                <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A10.99 10.99 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.47 12c0-.73.13-1.44.36-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.93l3.66-2.83z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
                Continue with Google
              </Button>
            </>
          )}

          <p className="text-center text-sm text-slate-400 mt-6">
            New here? <Link to="/register" data-testid="register-link" className="text-blue-400 hover:text-blue-300 font-semibold hover:underline">Create an account</Link>
          </p>
        </div>
      </main>

      {/* Footer Branding */}
      <footer className="relative z-10 text-center text-xs text-slate-400 py-2">
        © {branding?.app_name || "FormForge"} — self-hosted form builder.
      </footer>
    </div>
  );
}
