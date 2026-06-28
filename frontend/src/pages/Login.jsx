import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Sparkles, Mail, Lock } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("Admin@12345");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const to = loc.state?.from?.pathname || "/dashboard";

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
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/auth/callback";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left visual */}
      <div className="hidden lg:flex relative bg-slate-900 text-white p-12 flex-col justify-between overflow-hidden">
        <div className="absolute inset-0 opacity-30" style={{
          backgroundImage: "url(https://images.pexels.com/photos/4253054/pexels-photo-4253054.jpeg)",
          backgroundSize: "cover", backgroundPosition: "center"
        }} />
        <div className="absolute inset-0 bg-gradient-to-tr from-blue-900/70 via-slate-900/80 to-slate-900" />
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center"><Sparkles className="w-5 h-5" /></div>
          <span className="font-heading font-bold text-2xl">FormForge</span>
        </div>
        <div className="relative z-10 space-y-4 max-w-md">
          <h1 className="text-4xl sm:text-5xl font-heading font-bold tracking-tight">Build forms that feel like apps.</h1>
          <p className="text-slate-300 text-base leading-relaxed">
            Drag, drop, publish. Collect submissions, files and approvals — all self-hosted, all yours.
          </p>
          <div className="flex gap-6 pt-4 text-sm">
            <div><div className="text-3xl font-bold">15+</div><div className="text-slate-400">Field types</div></div>
            <div><div className="text-3xl font-bold">∞</div><div className="text-slate-400">Submissions</div></div>
            <div><div className="text-3xl font-bold">4</div><div className="text-slate-400">User roles</div></div>
          </div>
        </div>
        <div className="relative z-10 text-xs text-slate-400">© FormForge — self-hosted form builder.</div>
      </div>

      {/* Right form */}
      <div className="flex items-center justify-center p-6 sm:p-12 bg-white">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <h2 className="text-3xl font-heading font-bold tracking-tight text-slate-900">Sign in</h2>
            <p className="text-slate-500 mt-2">Welcome back — enter your credentials.</p>
          </div>

          <form onSubmit={submit} className="space-y-5" data-testid="login-form">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input id="email" data-testid="login-email" type="email" required value={email}
                       onChange={(e) => setEmail(e.target.value)} className="pl-10 h-11" placeholder="you@example.com" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input id="password" data-testid="login-password" type="password" required value={password}
                       onChange={(e) => setPassword(e.target.value)} className="pl-10 h-11" placeholder="••••••••" />
              </div>
            </div>
            <Button type="submit" disabled={loading} data-testid="login-submit"
                    className="w-full h-11 bg-blue-600 hover:bg-blue-700 rounded-lg">
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
            <div className="relative flex justify-center text-xs"><span className="bg-white px-2 text-slate-400 uppercase tracking-wider">or</span></div>
          </div>

          <Button data-testid="google-login" variant="outline" onClick={googleLogin}
                  className="w-full h-11 rounded-lg border-slate-200 hover:bg-slate-50">
            <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A10.99 10.99 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.47 12c0-.73.13-1.44.36-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.93l3.66-2.83z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
            Continue with Google
          </Button>

          <p className="text-center text-sm text-slate-500 mt-8">
            New here? <Link to="/register" data-testid="register-link" className="text-blue-600 hover:underline font-medium">Create an account</Link>
          </p>
          <div className="mt-6 p-3 rounded-lg bg-slate-50 border border-slate-100 text-xs text-slate-500">
            <span className="font-semibold text-slate-600">Demo:</span> admin@example.com / Admin@12345
          </div>
        </div>
      </div>
    </div>
  );
}
