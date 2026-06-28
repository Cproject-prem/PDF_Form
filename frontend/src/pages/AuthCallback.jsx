import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// Handles return from Emergent Google Auth: location.hash contains #session_id=...
export default function AuthCallbackPage() {
  const nav = useNavigate();
  const { setSessionFromGoogle } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;
    const hash = window.location.hash || "";
    const m = hash.match(/session_id=([^&]+)/);
    if (!m) { nav("/login"); return; }
    (async () => {
      try {
        await setSessionFromGoogle(m[1]);
        // clean hash
        window.history.replaceState({}, "", "/dashboard");
        toast.success("Signed in with Google");
        nav("/dashboard", { replace: true });
      } catch (err) {
        toast.error("Google sign-in failed");
        nav("/login", { replace: true });
      }
    })();
  }, [nav, setSessionFromGoogle]);

  return (
    <div className="min-h-screen flex items-center justify-center text-slate-500">
      Signing you in…
    </div>
  );
}
