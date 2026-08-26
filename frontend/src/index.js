import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/index.css";
import App from "@/App";
import { ThemeProvider } from "@/contexts/ThemeContext";

// Patch HTMLCanvasElement.prototype.getContext to set willReadFrequently: true
// and eliminate Chrome Canvas2D performance warnings for PDF rendering
if (typeof window !== "undefined" && typeof HTMLCanvasElement !== "undefined" && HTMLCanvasElement.prototype) {
  const origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attributes) {
    if (type === "2d") {
      attributes = { willReadFrequently: true, ...(attributes || {}) };
    }
    return origGetContext.call(this, type, attributes);
  };
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * Suppress the CRA dev-mode red overlay for XMLHttpRequest / Axios
 * network errors.  These are caught in the Axios response interceptor
 * and shown as toast notifications — the overlay adds no value and
 * is confusing when the backend is briefly unavailable or the AI
 * microservice is offline.
 *
 * The filter is precise: it only hides events where the source is an
 * XHR (no filename, no lineno/colno) with a message of "Network Error"
 * or "Script error." — all other runtime JS errors still surface.
 */
if (process.env.NODE_ENV === "development") {
  window.addEventListener("error", (event) => {
    const msg = event?.message || "";
    // XHR / fetch network errors have no file/line context
    const isXhrNetworkError =
      !event.filename &&
      !event.lineno &&
      (msg === "Network Error" ||
        msg === "Script error." ||
        msg.includes("NetworkError") ||
        msg.includes("Failed to fetch"));
    if (isXhrNetworkError) {
      event.stopImmediatePropagation();
      // eslint-disable-next-line no-console
      console.warn("[dev] suppressed XHR network error overlay:", msg);
    }
  }, true /* capture phase — runs before CRA's overlay listener */);
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);

