import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// Handles return from Direct Google OAuth 2.0 (code, id_token, session_id)
export default function AuthCallbackPage() {
  const nav = useNavigate();
  const { authenticateGoogle, setSessionFromGoogle } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");
    
    const hash = window.location.hash || "";
    const sessionMatch = hash.match(/session_id=([^&]+)/);
    const idTokenMatch = hash.match(/id_token=([^&]+)/);
    
    const redirect_uri = window.location.origin + "/auth/callback";

    if (!code && !sessionMatch && !idTokenMatch) {
      nav("/login");
      return;
    }

    (async () => {
      try {
        if (code) {
          await authenticateGoogle({ code, redirect_uri });
        } else if (idTokenMatch) {
          await authenticateGoogle({ id_token: idTokenMatch[1] });
        } else if (sessionMatch) {
          await setSessionFromGoogle(sessionMatch[1]);
        }
        window.history.replaceState({}, "", "/dashboard");
        toast.success("Signed in with Google");
        nav("/dashboard", { replace: true });
      } catch (err) {
        toast.error(err?.response?.data?.detail || "Google sign-in failed");
        nav("/login", { replace: true });
      }
    })();
  }, [nav, authenticateGoogle, setSessionFromGoogle]);

  return (
    <div className="min-h-screen flex items-center justify-center text-slate-500 font-medium bg-slate-50">
      Signing you in with Google…
    </div>
  );
}
