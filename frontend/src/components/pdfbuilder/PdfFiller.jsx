import React, { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page } from "react-pdf";
import { authPdfFile } from "@/lib/pdfWorker";
import SignaturePadField from "@/components/pdfbuilder/SignaturePadField";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

/**
 * PDF Filler — renders the PDF with native form controls overlaid in place
 * of the blue rectangles. Used by Preview mode and the public form page.
 *
 *   values is a controlled dict { field_id: value }.
 */
export default function PdfFiller({ fileUrl, fields, values, onChange }) {
  const [numPages, setNumPages] = useState(0);
  const set = (id, v) => onChange({ ...values, [id]: v });
  const file = useMemo(() => authPdfFile(fileUrl), [fileUrl]);

  // helpers for conditional logic
  const visibleFields = fields.filter((f) => isVisible(f, values));

  return (
    <div className="overflow-auto bg-slate-100 nice-scroll">
      <div className="py-6 flex flex-col items-center gap-6">
        <Document file={file} onLoadSuccess={({ numPages: n }) => setNumPages(n)}
                  loading={<div className="text-slate-400 text-sm">Loading PDF…</div>}>
          {Array.from({ length: numPages }, (_, i) => i + 1).map((p) => (
            <FillerPage key={p} pageNum={p}
                        fields={visibleFields.filter((f) => Number(f.page) === p)}
                        values={values} set={set} />
          ))}
        </Document>
      </div>
    </div>
  );
}

function isVisible(f, values) {
  if (!f.visible) return false;
  const cl = f.conditional_logic;
  if (!cl || !cl.field_id) return true;
  const v = values?.[cl.field_id];
  switch (cl.operator) {
    case "equals":     return String(v ?? "") === String(cl.value ?? "");
    case "not_equals": return String(v ?? "") !== String(cl.value ?? "");
    case "contains":   return String(v ?? "").includes(String(cl.value ?? ""));
    case "filled":     return v !== null && v !== undefined && v !== "";
    default:           return true;
  }
}

function FillerPage({ pageNum, fields, values, set }) {
  const wrapRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  return (
    <div ref={wrapRef} className="relative shadow-xl bg-white"
         style={{ width: size.w || undefined, height: size.h || undefined }}>
      <Page pageNumber={pageNum} renderTextLayer={false} renderAnnotationLayer={false}
            onRenderSuccess={({ width, height }) => setSize({ w: width, h: height })} />
      {size.w > 0 && fields.map((f) => (
        <FieldControl key={f.id} f={f} containerW={size.w} containerH={size.h}
                      value={values[f.id]} onChange={(v) => set(f.id, v)} />
      ))}
    </div>
  );
}

function FieldControl({ f, containerW, containerH, value, onChange }) {
  // Auto-fit font size when enabled — same rule as the builder canvas.
  const heightPx = f.height * containerH;
  const autoFitPx = Math.max(9, Math.min(28, heightPx * 0.55));
  const effectiveFontSize = f.font_auto_fit === false ? (f.font_size || 12) : autoFitPx;
  const style = {
    position: "absolute",
    left: f.x * containerW,
    top: f.y * containerH,
    width: f.width * containerW,
    height: ["long_text", "paragraph", "signature", "image", "checkbox", "radio"].includes(f.type)
      ? f.height * containerH : undefined,
    minHeight: f.height * containerH,
    zIndex: 10 + (f.z_index || 0),
    fontSize: effectiveFontSize,
    fontFamily: f.font_family,
    color: f.font_color,
  };

  if (!f.visible) return null;
  if (["heading", "paragraph", "static_text"].includes(f.type)) {
    return (
      <div style={style} className="px-1">
        <div style={{ fontSize: f.type === "heading" ? Math.max(effectiveFontSize, 16) : effectiveFontSize }}>
          {f.static_text || f.label}
        </div>
      </div>
    );
  }
  if (f.type === "divider") {
    return <div style={style} className="border-t border-slate-300" />;
  }
  if (f.type === "hidden") return null;

  const common = {
    "data-testid": `fill-${f.id}`,
    "aria-label": f.label,
    placeholder: f.placeholder,
    required: f.required,
    readOnly: f.read_only,
    value: value ?? "",
    onChange: (e) => onChange(e.target.value),
    className: "w-full h-full bg-white border border-blue-500 rounded px-1.5 outline-none focus:ring-2 focus:ring-blue-300",
    style: { fontSize: effectiveFontSize, color: f.font_color, textAlign: f.alignment },
  };

  switch (f.type) {
    case "long_text":
      return <div style={style}><Textarea {...common} rows={3} /></div>;
    case "number":
      return <div style={style}><input type="number" {...common} /></div>;
    case "email":
      return <div style={style}><input type="email" {...common} /></div>;
    case "phone":
      return <div style={style}><input type="tel" {...common} /></div>;
    case "date":
      return <div style={style}><input type="date" {...common} /></div>;
    case "time":
      return <div style={style}><input type="time" {...common} /></div>;
    case "dropdown":
      return (
        <div style={style}>
          <DropdownControl f={f} common={common} />
        </div>
      );
    case "checkbox":
      return (
        <div style={style} className="px-1 space-y-1">
          <CheckboxControl f={f} value={value} onChange={onChange} />
        </div>
      );
    case "radio":
      return (
        <div style={style} className="px-1 space-y-1">
          <RadioControl f={f} value={value} onChange={onChange} />
        </div>
      );
    case "signature":
    case "initial":
      return (
        <div style={style}>
          <SignaturePadField label={f.label} value={value} onChange={onChange}
                             testid={`fill-sig-${f.id}`} />
        </div>
      );
    case "image":
      return (
        <div style={style}>
          <FileToDataUrl accept="image/*" current={value} onChange={onChange} testid={`fill-img-${f.id}`} />
        </div>
      );
    case "file":
      return (
        <div style={style}>
          <input type="file" data-testid={`fill-${f.id}`} onChange={(e) => onChange(e.target.files?.[0]?.name || "")} />
        </div>
      );
    case "qr_code":
    case "barcode":
      return <div style={style}><Input {...common} placeholder={f.placeholder || "Enter code value"} /></div>;
    case "auto_number":
    case "calculation":
      return <div style={style}><Input {...common} readOnly /></div>;
    default:
      return <div style={style}><Input {...common} /></div>;
  }
}

function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-"); }

// Load options from the field's `data_source` (Site Master / Vendors / Master
// Data) when the field is configured as a lookup — mirrors the standard-form
// behaviour in `FieldRenderer.jsx`.  Falls back to `field.options` for manual.
function useDynamicOptions(field) {
  const ds = field?.data_source;
  const isLookup = ds?.kind === "lookup" && ds?.source && (ds?.display || ds?.return);
  const [opts, setOpts] = useState(field?.options || []);
  const lookupBase = typeof window !== "undefined" && localStorage.getItem("ff_token")
    ? "/lookup" : "/public/lookup";
  useEffect(() => {
    if (!isLookup) { setOpts(field?.options || []); return; }
    const column = ds.display || ds.return;
    api.get(
      `${lookupBase}/options?source=${encodeURIComponent(ds.source)}` +
      `&column=${encodeURIComponent(column)}` +
      `${ds.show_all_sites ? "&show_all=true" : ""}`,
    )
      .then((r) => setOpts(r.data || []))
      .catch(() => setOpts([]));
  }, [isLookup, ds?.source, ds?.display, ds?.return, ds?.show_all_sites, field?.options, lookupBase]);
  return opts;
}

// Dropdown / Checkbox / Radio controls that resolve dynamic data-source
// options via `useDynamicOptions` and render inside the PDF overlay.
function DropdownControl({ f, common }) {
  const opts = useDynamicOptions(f);
  return (
    <select {...common}>
      <option value="">{f.placeholder || "Select…"}</option>
      {opts.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function CheckboxControl({ f, value, onChange }) {
  const opts = useDynamicOptions(f);
  const arr = Array.isArray(value) ? value : [];
  return (
    <>
      {opts.map((o) => (
        <label key={o} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            data-testid={`fill-${f.id}-${slug(o)}`}
            checked={arr.includes(o)}
            onChange={(e) => onChange(e.target.checked ? [...arr, o] : arr.filter((x) => x !== o))}
          />
          <span>{o}</span>
        </label>
      ))}
    </>
  );
}

function RadioControl({ f, value, onChange }) {
  const opts = useDynamicOptions(f);
  return (
    <>
      {opts.map((o) => (
        <label key={o} className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name={f.id}
            data-testid={`fill-${f.id}-${slug(o)}`}
            checked={value === o}
            onChange={() => onChange(o)}
          />
          <span>{o}</span>
        </label>
      ))}
    </>
  );
}

function FileToDataUrl({ accept, current, onChange, testid }) {
  const handle = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => onChange(r.result);
    r.readAsDataURL(file);
  };
  return (
    <div className="w-full h-full border-2 border-dashed border-slate-300 rounded bg-white flex items-center justify-center text-xs text-slate-500 overflow-hidden">
      {current ? <img src={current} alt="" className="max-h-full max-w-full" /> : "Click to upload"}
      <input type="file" accept={accept} onChange={handle} data-testid={testid}
             className="absolute opacity-0 inset-0 cursor-pointer" />
    </div>
  );
}
