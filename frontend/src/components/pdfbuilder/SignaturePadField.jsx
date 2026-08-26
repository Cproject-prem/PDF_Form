import React, { useEffect, useRef, useState } from "react";
import SignaturePad from "signature_pad";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RotateCcw, Check, PenLine, X } from "lucide-react";

/**
 * Collapsible & Modal-friendly Signature Pad.
 * Displays a clean trigger box when collapsed, expanding into a spacious canvas dialog on tap.
 */
export default function SignaturePadField({
  value,
  onChange,
  disabled = false,
  label = "Signature",
  testid,
}) {
  const [open, setOpen] = useState(false);
  const canvasRef = useRef(null);
  const padRef = useRef(null);

  useEffect(() => {
    if (!open) {
      padRef.current = null;
      return;
    }

    const timer = setTimeout(() => {
      if (!canvasRef.current) return;
      const c = canvasRef.current;
      const w = c.offsetWidth || 450;
      const h = c.offsetHeight || 180;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);

      c.width = w * ratio;
      c.height = h * ratio;
      const ctx = c.getContext("2d");
      ctx.scale(ratio, ratio);

      padRef.current = new SignaturePad(c, {
        backgroundColor: "rgba(255, 255, 255, 0)",
        penColor: "#0F172A",
        minWidth: 1.5,
        maxWidth: 3.5,
      });

      if (value && typeof value === "string" && value.startsWith("data:image")) {
        padRef.current.fromDataURL(value);
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [open, value]);

  const clear = () => padRef.current?.clear();

  const save = () => {
    if (!padRef.current || padRef.current.isEmpty()) {
      onChange("");
      setOpen(false);
      return;
    }
    const url = padRef.current.toDataURL("image/png");
    onChange(url);
    setOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange("");
  };

  return (
    <>
      <div className="relative group">
        <button
          type="button"
          disabled={disabled}
          data-testid={testid || "sig-open"}
          onClick={() => setOpen(true)}
          className={`w-full flex flex-col items-center justify-center min-h-[70px] p-2 border-2 border-dashed rounded-lg transition-all ${
            value
              ? "border-blue-300 bg-blue-50/20 hover:bg-blue-50/40"
              : "border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50/30"
          } ${disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
        >
          {value ? (
            <div className="relative w-full flex items-center justify-center">
              <img
                src={value}
                alt="Signature"
                className="max-h-16 object-contain py-1"
              />
              {!disabled && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="absolute top-0 right-0 p-1 bg-white hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-full shadow-xs border border-slate-200"
                  title="Clear signature"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1 text-slate-500 py-1">
              <PenLine className="w-5 h-5 text-blue-600" />
              <span className="text-xs font-medium">Tap to sign — {label}</span>
            </div>
          )}
        </button>
      </div>

      {/* Expanded Signature Pad Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg w-[95vw] bg-white p-5 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <PenLine className="w-5 h-5 text-blue-600" />
              Draw Signature ({label})
            </DialogTitle>
          </DialogHeader>

          <div className="mt-3 space-y-4">
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50 relative shadow-inner">
              <canvas
                ref={canvasRef}
                className="w-full h-44 bg-white touch-none cursor-crosshair"
              />
              <div className="absolute bottom-2 left-3 text-[10px] text-slate-400 select-none pointer-events-none">
                Sign inside the box above
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clear}
                data-testid="sig-clear"
                className="text-slate-600 hover:text-red-600"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Clear
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={save}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  data-testid="sig-save"
                >
                  <Check className="w-4 h-4 mr-1.5" /> Use Signature
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
