import React from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Sparkles, Loader2 } from "lucide-react";

export default function LoadingScreen({ message = "Loading workspace…" }) {
  const { branding } = useAuth();
  const appName = branding?.app_name || "FormForge";
  const logoUrl = branding?.logo_url ? (
    branding.logo_url.startsWith("http")
      ? branding.logo_url
      : `${process.env.REACT_APP_BACKEND_URL || ""}${branding.logo_url}`
  ) : null;

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white p-6 relative overflow-hidden select-none">
      {/* Subtle background glow */}
      <div
        className="absolute w-96 h-96 rounded-full blur-3xl opacity-20 pointer-events-none animate-pulse"
        style={{
          background: branding?.primary_color || "#3b82f6",
          top: "30%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        }}
      />

      <div className="relative z-10 flex flex-col items-center text-center space-y-6 max-w-sm">
        {/* Animated Brand Logo Container */}
        <div className="relative">
          <div className="w-20 h-20 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl flex items-center justify-center p-3 transition-transform hover:scale-105">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={appName}
                className="w-full h-full object-contain"
              />
            ) : (
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-xl shadow-md"
                style={{ background: branding?.primary_color || "#2563EB" }}
              >
                <Sparkles className="w-7 h-7" />
              </div>
            )}
          </div>
          {/* Orbiting Spinner Ring */}
          <div className="absolute -inset-2 rounded-3xl border-2 border-blue-500/30 dark:border-blue-400/20 border-t-blue-600 dark:border-t-blue-400 animate-spin" />
        </div>

        {/* Brand App Name & Message */}
        <div className="space-y-2">
          <h2 className="text-xl font-heading font-bold text-slate-900 dark:text-white tracking-tight">
            {appName}
          </h2>
          <div className="flex items-center justify-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600 dark:text-blue-400" />
            <span>{message}</span>
          </div>
        </div>

        {/* Minimalist Progress Line */}
        <div className="w-36 h-1 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full animate-pulse bg-blue-600 dark:bg-blue-400 w-full"
            style={{ background: branding?.primary_color || "#2563EB" }}
          />
        </div>
      </div>
    </div>
  );
}
