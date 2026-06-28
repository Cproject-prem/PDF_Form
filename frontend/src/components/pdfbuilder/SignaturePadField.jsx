import React, { useEffect, useRef, useState } from "react";
import SignaturePad from "signature_pad";
import { Button } from "@/components/ui/button";
import { RotateCcw, Check } from "lucide-react";

/**
 * Modal-friendly signature pad. Calls onSave(dataUrl) when user clicks "Use signature".
 */
export default function SignaturePadField({ value, onChange, label = "Signature", testid }) {
  const canvasRef = useRef(null);
  const padRef = useRef(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (editing && canvasRef.current && !padRef.current) {
      const c = canvasRef.current;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      c.width = c.offsetWidth * ratio;
      c.height = c.offsetHeight * ratio;
      c.getContext("2d").scale(ratio, ratio);
      padRef.current = new SignaturePad(c, { backgroundColor: "rgba(255,255,255,0)" });
    }
    if (!editing) padRef.current = null;
  }, [editing]);

  const clear = () => padRef.current?.clear();
  const save = () => {
    if (!padRef.current || padRef.current.isEmpty()) return;
    const url = padRef.current.toDataURL("image/png");
    onChange(url);
    setEditing(false);
  };

  return (
    <div className="border-2 border-dashed border-slate-300 rounded-lg p-2 bg-white">
      {!editing && (
        <button
          type="button"
          data-testid={testid || "sig-open"}
          onClick={() => setEditing(true)}
          className="w-full flex items-center justify-center min-h-[80px] text-slate-500 hover:bg-slate-50 rounded"
        >
          {value
            ? <img src={value} alt="signature" className="max-h-24" />
            : <span>Click to sign — {label}</span>}
        </button>
      )}
      {editing && (
        <div>
          <canvas ref={canvasRef} className="w-full h-32 bg-white rounded border border-slate-200" />
          <div className="flex items-center justify-end gap-1.5 mt-2">
            <Button type="button" variant="ghost" size="sm" onClick={clear} data-testid="sig-clear">
              <RotateCcw className="w-3.5 h-3.5 mr-1" /> Clear
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
            <Button type="button" size="sm" onClick={save} className="bg-blue-600 hover:bg-blue-700" data-testid="sig-save">
              <Check className="w-3.5 h-3.5 mr-1" /> Use signature
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
