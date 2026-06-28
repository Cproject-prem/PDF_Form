import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await register(email, password, name);
      toast.success("Account created");
      nav("/dashboard");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Registration failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-100 card-soft p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center"><Sparkles className="w-5 h-5" /></div>
          <span className="font-heading font-bold text-xl">FormForge</span>
        </div>
        <h2 className="text-2xl font-heading font-bold tracking-tight">Create your account</h2>
        <p className="text-slate-500 text-sm mt-1 mb-6">Start building forms in minutes.</p>
        <form onSubmit={submit} className="space-y-4" data-testid="register-form">
          <div>
            <Label htmlFor="name">Full name</Label>
            <Input id="name" data-testid="register-name" required value={name} onChange={(e) => setName(e.target.value)} className="h-11 mt-1" />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" data-testid="register-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 mt-1" />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" data-testid="register-password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 mt-1" />
          </div>
          <Button type="submit" disabled={loading} data-testid="register-submit" className="w-full h-11 bg-blue-600 hover:bg-blue-700 rounded-lg">
            {loading ? "Creating…" : "Create account"}
          </Button>
        </form>
        <p className="text-center text-sm text-slate-500 mt-6">
          Already have an account? <Link to="/login" className="text-blue-600 hover:underline font-medium">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
