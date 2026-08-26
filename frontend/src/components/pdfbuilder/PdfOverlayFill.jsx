import React, { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page } from "react-pdf";
import { authPdfFile } from "@/lib/pdfWorker";
import { api, API } from "@/lib/api";
import { Upload, FileType2, X, PenLine, RotateCcw, Check } from "lucide-react";
import { toast } from "sonner";
import { resolveOptionBoxes } from "@/lib/pdfFieldTypes";
import { SearchableDropdown } from "@/components/ui/SearchableDropdown";
import SignaturePad from "signature_pad";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Read-only PDF viewer with fillable overlay inputs for the public submitter.
 * Fields are absolutely positioned using their normalised x/y/width/height
 * (0..1 relative to the PDF page). Used when a PDF form is shared with
 * `settings.public_view_mode === "pdf"`.
 */
export default function PdfOverlayFill({
  fileUrl, fields, values, onChange, disabled = false,
}) {
  const file = useMemo(() => authPdfFile(fileUrl), [fileUrl]);
  const [numPages, setNumPages] = useState(0);

  return (
    <div className="bg-slate-100 rounded-xl overflow-y-auto max-h-[calc(100vh-220px)] min-h-[450px] border border-slate-200 shadow-inner p-4 nice-scroll" data-testid="pdf-overlay-fill">
      <div className="py-4 flex flex-col items-center gap-6">
        <Document
          file={file}
          onLoadSuccess={({ numPages: n }) => setNumPages(n)}
          loading={<div className="text-slate-400 text-sm py-8">Loading PDF…</div>}
        >
          {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
            <PdfPageWithOverlay
              key={pageNum}
              pageNum={pageNum}
              fields={fields.filter((f) => Number(f.page) === pageNum)}
              values={values}
              onChange={onChange}
              disabled={disabled}
            />
          ))}
        </Document>
      </div>
    </div>
  );
}

function PdfPageWithOverlay({ pageNum, fields, values, onChange, disabled }) {
  const wrapRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  return (
    <div
      ref={wrapRef}
      className="relative bg-white shadow-sm ring-1 ring-slate-200"
      style={{ width: size.w || undefined, height: size.h || undefined }}
    >
      <Page
        pageNumber={pageNum}
        width={Math.min(900, window.innerWidth - 48)}
        onRenderSuccess={({ width, height }) => setSize({ w: width, h: height })}
        renderTextLayer={false}
        renderAnnotationLayer={false}
      />
      {/* Overlay */}
      {size.w > 0 && fields.map((f) => (
        <React.Fragment key={f.id}>
          <OverlayInput
            field={f}
            box={{
              left: (f.x || 0) * size.w,
              top: (f.y || 0) * size.h,
              width: (f.width || 0.15) * size.w,
              height: (f.height || 0.04) * size.h,
            }}
            value={values[f.id]}
            onChange={(v) => onChange?.(f.id, v)}
            disabled={disabled || !!f.read_only}
          />
          {(f.type === "checkbox" || f.type === "radio")
            && (f.option_positions || []).length > 0 && (
            <PositionedOptionsOverlay
              field={f}
              containerW={size.w}
              containerH={size.h}
              value={values[f.id]}
              onChange={(v) => onChange?.(f.id, v)}
              disabled={disabled || !!f.read_only}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function useAutoFontSize(text, width, height, preferredSize = 14, minSize = 7) {
  return useMemo(() => {
    const targetSize = preferredSize || 14;
    if (!height || !width) return targetSize;
    const str = String(text || "");
    if (!str) return targetSize;

    const len = str.length;
    if (len === 0) return targetSize;

    const availWidth = Math.max(10, width - 8);
    const availHeight = Math.max(10, height - 4);

    // 1. First check if text fits at preferredSize (the font size set in PDF editor)
    const charsPerLinePref = Math.max(1, Math.floor(availWidth / (targetSize * 0.55)));
    const linesNeededPref = Math.ceil(len / charsPerLinePref);
    const heightNeededPref = linesNeededPref * (targetSize * 1.18);

    if (heightNeededPref <= availHeight) {
      return targetSize; // FITS! Stick to given font size in PDF editor
    }

    // 2. Text is longer and unable to fit -> auto-scale down from preferredSize down to minSize
    for (let fs = targetSize - 0.5; fs >= minSize; fs -= 0.5) {
      const charsPerLine = Math.max(1, Math.floor(availWidth / (fs * 0.55)));
      const linesNeeded = Math.ceil(len / charsPerLine);
      const heightNeeded = linesNeeded * (fs * 1.18);
      if (heightNeeded <= availHeight) {
        return fs;
      }
    }
    return minSize;
  }, [text, width, height, preferredSize, minSize]);
}

function OverlayInput({ field, box, value, onChange, disabled }) {
  const displayVal = String(value ?? "");
  const preferredFont = field.font_size
    ? Number(field.font_size)
    : Math.max(10, Math.min(box.height * 0.6, 16));

  const autoFontSize = useAutoFontSize(
    displayVal || field.placeholder || field.label || "",
    box.width,
    box.height,
    preferredFont,
    7
  );

  const style = {
    position: "absolute",
    left: box.left, top: box.top, width: box.width, height: box.height,
    fontSize: `${autoFontSize}px`,
    color: field.font_color || "#0f172a",
    textAlign: field.alignment || "left",
    lineHeight: 1.18,
  };
  const baseCls =
    "border border-blue-400/80 bg-white/90 hover:bg-white focus:bg-white border border-blue-400 focus:border-blue-600 " +
    "rounded-sm px-1.5 py-0.5 outline-none text-slate-900 font-medium placeholder:text-slate-500 " +
    "focus:ring-1 focus:ring-blue-500 transition-colors whitespace-normal break-words overflow-y-auto resize-none nice-scroll leading-tight [color-scheme:light]";

  const commonProps = {
    "data-testid": `pdf-overlay-${field.id}`,
    style,
    value: value ?? "",
    onChange: (e) => onChange(e.target.value),
    disabled,
    placeholder: field.placeholder || field.label || "",
  };

  switch (field.type) {
    case "long_text":
      return <textarea className={`${baseCls} resize-none`} {...commonProps} />;
    case "date":
      return <input type="date" className={baseCls} {...commonProps} />;
    case "time":
      return <input type="time" className={baseCls} {...commonProps} />;
    case "email":
      return <input type="email" className={baseCls} {...commonProps} />;
    case "number":
      return <input type="number" className={baseCls} {...commonProps} />;
    case "dropdown":
      return (
        <DropdownOverlay
          field={field}
          style={style}
          baseCls={baseCls}
          value={value}
          disabled={disabled}
          onChange={onChange}
        />
      );
    case "checkbox":
    case "tick": {
      if ((field.option_positions || []).length > 0) {
        return (
          <div
            data-testid={`pdf-overlay-${field.id}`}
            style={style}
            className="flex items-center px-1 pointer-events-none"
          >
            <span className="text-[11px] italic text-slate-500 truncate">
              {field.label}
            </span>
          </div>
        );
      }
      if ((field.options || []).length > 1 && field.type !== "tick") {
        return (
          <StackedChoiceOverlay
            field={field}
            style={style}
            value={value}
            disabled={disabled}
            onChange={onChange}
          />
        );
      }
      const checked = value === true || value === "true" || value === 1;
      return (
        <label
          data-testid={`pdf-overlay-${field.id}`}
          style={style}
          className={`flex items-center justify-center rounded-sm ${
            disabled
              ? "bg-transparent border-transparent cursor-default"
              : "bg-blue-50/40 border border-blue-400/70 cursor-pointer"
          }`}
        >
          {disabled ? (
            checked && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-slate-800 w-4 h-4">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            )
          ) : (
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => onChange(e.target.checked)}
              className="w-4 h-4 accent-emerald-600 cursor-pointer"
            />
          )}
        </label>
      );
    }
    case "radio": {
      if ((field.option_positions || []).length > 0) {
        return (
          <div
            data-testid={`pdf-overlay-${field.id}`}
            style={style}
            className="flex items-center px-1 pointer-events-none"
          >
            <span className="text-[11px] italic text-slate-500 truncate">
              {field.label}
            </span>
          </div>
        );
      }
      return (
        <StackedChoiceOverlay
          field={field}
          style={style}
          value={value}
          disabled={disabled}
          onChange={onChange}
          isRadio
        />
      );
    }
    case "file":
    case "image":
      return (
        <FileUploadOverlay
          field={field}
          style={style}
          value={value}
          onChange={onChange}
          disabled={disabled}
          acceptImages={field.type === "image"}
        />
      );
    case "signature":
      return (
        <SignatureOverlay
          field={field}
          style={style}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      );
    default:
      // short_text, phone, url, and everything else — textarea with text wrapping enabled
      return <textarea className={`${baseCls} resize-none`} {...commonProps} />;
  }
}

/* --------------------- Data-source dropdown --------------------- */
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

function DropdownOverlay({ field, style, baseCls, value, disabled, onChange }) {
  const opts = useDynamicOptions(field);
  return (
    <SearchableDropdown
      options={opts}
      value={value ?? ""}
      onChange={onChange}
      placeholder={field.placeholder || field.label || "Select…"}
      disabled={disabled}
      testId={`pdf-overlay-${field.id}`}
      fontSize={style?.fontSize}
      fontColor={field.font_color}
      textAlign={field.alignment}
      style={style}
      className={baseCls}
    />
  );
}

/* --------------------- Multi-option choice overlays --------------------- */
function PositionedOptionsOverlay({ field, containerW, containerH, value, onChange, disabled }) {
  const opts = useDynamicOptions(field);
  const boxes = resolveOptionBoxes({ ...field, options: opts });
  const arr = Array.isArray(value) ? value : [];
  const isCheckbox = field.type === "checkbox";
  return (
    <>
      {boxes.map((b, i) => {
        const style = {
          position: "absolute",
          left: b.x * containerW,
          top: b.y * containerH,
          width: b.w * containerW,
          height: b.h * containerH,
          zIndex: 12,
        };
        const glyphSize = Math.max(10, Math.min(18, b.h * containerH * 0.7));
        const checked = isCheckbox ? arr.includes(b.value) : value === b.value;
        return (
          <label
            key={`${field.id}-opt-${i}`}
            style={style}
            className={`flex items-center gap-1 rounded-sm overflow-hidden ${
              disabled
                ? "bg-transparent border-transparent cursor-default px-0"
                : "border border-blue-400/70 bg-blue-50/40 hover:bg-blue-50 px-1 cursor-pointer"
            }`}
          >
            {disabled ? (
              checked ? (
                isCheckbox ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-slate-800 shrink-0" style={{ width: glyphSize, height: glyphSize }}>
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                ) : (
                  <div className="bg-slate-800 rounded-full shrink-0" style={{ width: glyphSize * 0.6, height: glyphSize * 0.6, margin: glyphSize * 0.2 }} />
                )
              ) : (
                <div style={{ width: glyphSize, height: glyphSize }} className="shrink-0" />
              )
            ) : (
              <input
                type={isCheckbox ? "checkbox" : "radio"}
                name={field.id}
                data-testid={`pdf-overlay-${field.id}-${i}`}
                checked={checked}
                onChange={(e) => {
                  if (isCheckbox) {
                    onChange(e.target.checked
                      ? [...arr, b.value]
                      : arr.filter((x) => x !== b.value));
                  } else {
                    onChange(b.value);
                  }
                }}
                style={{ width: glyphSize, height: glyphSize }}
                className="shrink-0 cursor-pointer"
              />
            )}
            <span
              className="truncate"
              style={{
                fontSize: Math.max(10, glyphSize * 0.85),
                color: field.font_color || "#111827",
              }}
            >
              {b.value}
            </span>
          </label>
        );
      })}
    </>
  );
}

function StackedChoiceOverlay({ field, style, value, disabled, onChange, isRadio = false }) {
  const opts = useDynamicOptions(field);
  const arr = Array.isArray(value) ? value : [];
  return (
    <div
      data-testid={`pdf-overlay-${field.id}`}
      style={style}
      className={`flex flex-col gap-0.5 px-1 rounded-sm overflow-auto ${
        disabled
          ? "bg-transparent border-transparent"
          : "border border-blue-400/70 bg-blue-50/40"
      }`}
    >
      {opts.map((o, i) => {
        const checked = isRadio ? value === o : arr.includes(o);
        return (
          <label key={i} className={`flex items-center gap-1 text-[11px] ${disabled ? "cursor-default" : "cursor-pointer"}`}>
            {disabled ? (
              checked ? (
                !isRadio ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-slate-800 w-3 h-3 shrink-0">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                ) : (
                  <div className="bg-slate-800 rounded-full shrink-0 m-[2px]" style={{ width: 8, height: 8 }} />
                )
              ) : (
                <div className="w-3 h-3 shrink-0" />
              )
            ) : (
              <input
                type={isRadio ? "radio" : "checkbox"}
                name={field.id}
                checked={checked}
                onChange={(e) => {
                  if (isRadio) onChange(o);
                  else onChange(e.target.checked ? [...arr, o] : arr.filter((x) => x !== o));
                }}
                className="cursor-pointer"
              />
            )}
            <span className="truncate" style={{ color: field.font_color || "#111827" }}>{o}</span>
          </label>
        );
      })}
    </div>
  );
}

/* --------------------- Upload widget (file / image) --------------------- */
function FileUploadOverlay({ field, style, value, onChange, disabled, acceptImages }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const isImage = value && typeof value === "object" &&
    (value.content_type || "").startsWith("image/");
  const previewUrl = isImage ? `${API}/files/${value.file_id}` : null;

  const handlePick = async (file) => {
    if (!file) return;
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const r = await api.post("/public/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onChange({
        file_id: r.data.file_id,
        filename: r.data.filename,
        size: r.data.size,
        content_type: r.data.content_type,
      });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const clear = () => onChange(null);

  return (
    <div
      data-testid={`pdf-overlay-${field.id}`}
      style={style}
      className="relative border border-blue-400/70 bg-blue-50/40 rounded-sm flex items-center overflow-hidden"
    >
      <input
        ref={inputRef}
        type="file"
        accept={acceptImages ? "image/*" : undefined}
        disabled={disabled}
        onChange={(e) => handlePick(e.target.files?.[0])}
        className="hidden"
      />
      {previewUrl && (
        // Show thumbnail so the submitter sees exactly what will land in the PDF
        <img
          src={previewUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-contain bg-white"
        />
      )}
      {!value && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || busy}
          className="flex items-center gap-1 px-1.5 text-blue-700 hover:text-blue-800 w-full h-full justify-center"
        >
          <Upload className="w-3 h-3" />
          <span className="truncate" style={{ fontSize: Math.max(9, style.fontSize - 2) }}>
            {busy ? "Uploading…" : acceptImages ? "Add image" : "Add file"}
          </span>
        </button>
      )}
      {value && !previewUrl && (
        <div className="flex items-center gap-1 px-1.5 w-full">
          <FileType2 className="w-3 h-3 text-blue-600 shrink-0" />
          <span className="truncate text-blue-800 flex-1"
                style={{ fontSize: Math.max(9, style.fontSize - 2) }}>
            {value.filename}
          </span>
        </div>
      )}
      {value && !disabled && (
        <button
          type="button"
          onClick={clear}
          className="absolute -top-2 -right-2 bg-white shadow rounded-full p-0.5 border border-slate-200 z-10"
          title="Remove"
        >
          <X className="w-3 h-3 text-slate-600" />
        </button>
      )}
    </div>
  );
}

/* --------------------- Signature overlay (collapsible modal draw) --------------------- */
function SignatureOverlay({ field, style, value, onChange, disabled }) {
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
    } else {
      onChange(padRef.current.toDataURL("image/png"));
    }
    setOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange("");
  };

  return (
    <>
      <div
        data-testid={`pdf-overlay-${field.id}`}
        style={style}
        onClick={() => !disabled && setOpen(true)}
        className={`relative border flex items-center justify-center rounded-sm overflow-hidden select-none transition-all ${
          disabled
            ? "border-transparent bg-transparent cursor-default"
            : "border-blue-400/80 bg-blue-50/40 hover:bg-blue-100/60 cursor-pointer"
        }`}
      >
        {value ? (
          <div className="relative w-full h-full flex items-center justify-center p-0.5">
            <img src={value} alt="Signature" className="max-w-full max-h-full object-contain" />
            {!disabled && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute -top-1 -right-1 bg-white hover:bg-red-50 text-slate-500 hover:text-red-600 rounded-full p-0.5 shadow-sm border border-slate-200 z-20"
                title="Clear signature"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1 text-blue-700 px-1 text-center font-medium truncate" style={{ fontSize: Math.max(9, (style.height || 20) * 0.45) }}>
            <PenLine className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Tap to sign</span>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg w-[95vw] bg-white p-5 rounded-2xl z-[100]">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <PenLine className="w-5 h-5 text-blue-600" />
              Draw Signature ({field.label || "Signature"})
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
