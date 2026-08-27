import React from "react";
import { AlertTriangle, RotateCcw, Home, ArrowLeft, ChevronDown, ChevronUp, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

const DEFAULT_ERROR_GIF = "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcGZrdmpzazF4enY5Y2p6ZGt6cGNxY2Q5Yzg1c2Fmb3YyOHpxMms0dyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3o7TKSjRrfIPjeiVyM/giphy.gif";

function isVideoUrl(url) {
  if (!url || typeof url !== "string") return false;
  const clean = url.split("?")[0].toLowerCase();
  return clean.endsWith(".mp4") || clean.endsWith(".webm") || clean.endsWith(".mov") || clean.endsWith(".ogg") || clean.endsWith(".m4v");
}

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      const { branding } = this.props;
      const rawUrl = branding?.error_video_url || DEFAULT_ERROR_GIF;
      const errorMediaUrl = rawUrl.startsWith("http")
        ? rawUrl
        : `${process.env.REACT_APP_BACKEND_URL || ""}${rawUrl}`;
      const isVideo = isVideoUrl(rawUrl);

      return (
        <div className="min-h-screen w-full flex flex-col items-center justify-center bg-slate-900 text-white p-6 relative overflow-y-auto">
          {/* Subtle background glow */}
          <div className="absolute w-[500px] h-[500px] bg-red-600/10 rounded-full blur-3xl pointer-events-none top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />

          <div className="relative z-10 w-full max-w-lg bg-slate-950/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 text-center backdrop-blur-xl">
            {/* Error Video / GIF Player Box */}
            <div className="relative w-full aspect-video sm:h-56 rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 flex items-center justify-center shadow-inner group">
              {isVideo ? (
                <video
                  src={errorMediaUrl}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
              ) : (
                <img
                  src={errorMediaUrl}
                  alt="Error animation"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = DEFAULT_ERROR_GIF;
                  }}
                />
              )}
              <div className="absolute top-3 left-3 bg-red-600/90 text-white px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 shadow-md">
                <AlertTriangle className="w-3 h-3" /> System Alert
              </div>
            </div>

            {/* Error Message */}
            <div className="space-y-2">
              <h1 className="text-xl sm:text-2xl font-heading font-bold text-white tracking-tight">
                Oops! Something Went Wrong
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
                The page encountered an unexpected issue and couldn't finish rendering. Don't worry, your data is safe.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
              <Button
                onClick={() => window.location.reload()}
                className="bg-blue-600 hover:bg-blue-500 text-white shadow-md text-xs font-semibold gap-1.5 px-4 h-9"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Reload Page
              </Button>
              <Button
                variant="outline"
                onClick={() => (window.location.href = "/dashboard")}
                className="border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 text-xs font-semibold gap-1.5 px-4 h-9"
              >
                <Home className="w-3.5 h-3.5" /> Go to Dashboard
              </Button>
              <Button
                variant="ghost"
                onClick={() => window.history.back()}
                className="text-slate-400 hover:text-white hover:bg-slate-800 text-xs gap-1.5 px-3 h-9"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </Button>
            </div>

            {/* Collapsible Error Trace */}
            <div className="pt-2 border-t border-slate-800/80 text-left">
              <button
                type="button"
                onClick={() => this.setState((prev) => ({ showDetails: !prev.showDetails }))}
                className="flex items-center justify-between w-full text-slate-500 hover:text-slate-300 text-xs font-medium py-1"
              >
                <span className="flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-slate-400" /> Technical Details
                </span>
                {this.state.showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {this.state.showDetails && (
                <div className="mt-2 p-3 rounded-xl bg-black/60 border border-slate-800 text-red-400 font-mono text-[11px] max-h-48 overflow-y-auto space-y-1.5 select-text">
                  <div className="font-bold text-red-300">
                    {this.state.error?.toString() || "Unknown Error"}
                  </div>
                  {this.state.errorInfo?.componentStack && (
                    <pre className="text-[10px] text-slate-500 whitespace-pre-wrap">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function AppErrorBoundary({ children }) {
  const { branding } = useAuth();
  return <ErrorBoundary branding={branding}>{children}</ErrorBoundary>;
}
