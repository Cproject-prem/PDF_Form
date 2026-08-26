import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("ff_user");
    return raw ? JSON.parse(raw) : null;
  });
  const [loading, setLoading] = useState(true);
  const [branding, setBranding] = useState(() => {
    // hydrate from previous run so the login screen renders instantly
    try {
      const raw = localStorage.getItem("ff_branding");
      return raw ? JSON.parse(raw) : { app_name: "FormForge", logo_url: "", primary_color: "#2563EB" };
    } catch {
      return { app_name: "FormForge", logo_url: "", primary_color: "#2563EB" };
    }
  });

  const reloadBranding = useCallback(async () => {
    try {
      const r = await api.get("/public/branding");
      setBranding(r.data);
      localStorage.setItem("ff_branding", JSON.stringify(r.data));
      if (r.data.app_name && typeof document !== "undefined") {
        document.title = r.data.app_name;
      }
    } catch { /* keep local fallback */ }
  }, []);

  const refresh = useCallback(async () => {
    const token = localStorage.getItem("ff_token");
    if (!token) { setUser(null); setLoading(false); return; }
    try {
      const r = await api.get("/auth/me");
      setUser(r.data);
      localStorage.setItem("ff_user", JSON.stringify(r.data));
    } catch {
      localStorage.removeItem("ff_token");
      localStorage.removeItem("ff_user");
      setUser(null);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    // Branding is public — always load it (used by login screen too)
    reloadBranding();
    // CRITICAL: skip /me check if coming back from Google OAuth, AuthCallback handles it.
    if (window.location.hash?.includes("session_id=")) { setLoading(false); return; }
    refresh();
  }, [refresh, reloadBranding]);

  const login = async (email, password) => {
    const r = await api.post("/auth/login", { email, password });
    localStorage.setItem("ff_token", r.data.token);
    localStorage.setItem("ff_user", JSON.stringify(r.data.user));
    setUser(r.data.user);
    return r.data.user;
  };
  const register = async (email, password, name) => {
    const r = await api.post("/auth/register", { email, password, name });
    localStorage.setItem("ff_token", r.data.token);
    localStorage.setItem("ff_user", JSON.stringify(r.data.user));
    setUser(r.data.user);
    return r.data.user;
  };
  const setSessionFromGoogle = async (session_id) => {
    const r = await api.post("/auth/google/session", { session_id });
    localStorage.setItem("ff_token", r.data.token);
    localStorage.setItem("ff_user", JSON.stringify(r.data.user));
    setUser(r.data.user);
    return r.data.user;
  };
  const authenticateGoogle = async (payload) => {
    const r = await api.post("/auth/google/callback", payload);
    localStorage.setItem("ff_token", r.data.token);
    localStorage.setItem("ff_user", JSON.stringify(r.data.user));
    setUser(r.data.user);
    return r.data.user;
  };
  const logout = () => {
    localStorage.removeItem("ff_token");
    localStorage.removeItem("ff_user");
    setUser(null);
  };

  return (
    <AuthCtx.Provider value={{ user, loading, login, register, logout, refresh, setSessionFromGoogle, authenticateGoogle, branding, reloadBranding }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
