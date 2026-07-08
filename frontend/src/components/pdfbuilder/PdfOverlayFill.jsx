import React, { useMemo, useRef, useState } from "react";
import { Document, Page } from "react-pdf";
import { authPdfFile } from "@/lib/pdfWorker";
import { api, API } from "@/lib/api";
import { Upload, FileType2, X } from "lucide-react";
import { toast } from "sonner";

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
    <div className="bg-slate-100 rounded-xl overflow-auto nice-scroll" data-testid="pdf-overlay-fill">
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
        <OverlayInput
          key={f.id}
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
      ))}
    </div>
  );
}

function OverlayInput({ field, box, value, onChange, disabled }) {
  const style = {
    position: "absolute",
    left: box.left, top: box.top, width: box.width, height: box.height,
    fontSize: Math.max(10, Math.min(box.height * 0.55, 16)),
  };
  const baseCls =
    "border border-blue-400/70 bg-blue-50/40 focus:bg-white focus:border-blue-500 " +
    "rounded-sm px-1.5 outline-none placeholder:text-slate-400 " +
    "focus:ring-1 focus:ring-blue-500 transition-colors";

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
        <select
          data-testid={`pdf-overlay-${field.id}`}
          style={style}
          value={value ?? ""}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={baseCls}
        >
          <option value="">{field.placeholder || "Select…"}</option>
          {(field.options || []).map((o, i) => (
            <option key={i} value={o}>{o}</option>
          ))}
        </select>
      );
    case "checkbox":
    case "tick": {
      const checked = value === true || value === "true" || value === 1;
      return (
        <label
          data-testid={`pdf-overlay-${field.id}`}
          style={style}
          className="flex items-center justify-center bg-blue-50/40 border border-blue-400/70 rounded-sm cursor-pointer"
        >
          <input
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
            className="w-4 h-4 accent-emerald-600"
          />
        </label>
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
      // short_text, phone, url, and everything else — plain text input
      return <input type="text" className={baseCls} {...commonProps} />;
  }
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

/* --------------------- Signature overlay (draw) --------------------- */
function SignatureOverlay({ field, style, value, onChange, disabled }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);

  const point = (e) => {
    const c = canvasRef.current;
    const rect = c.getBoundingClientRect();
    const x = ("touches" in e ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = ("touches" in e ? e.touches[0].clientY : e.clientY) - rect.top;
    return { x: (x / rect.width) * c.width, y: (y / rect.height) * c.height };
  };
  const start = (e) => {
    if (disabled) return;
    drawing.current = true;
    const { x, y } = point(e);
    const ctx = canvasRef.current.getContext("2d");
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const draw = (e) => {
    if (!drawing.current) return;
    const { x, y } = point(e);
    const ctx = canvasRef.current.getContext("2d");
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0F172A";
    ctx.lineTo(x, y);
    ctx.stroke();
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(canvasRef.current.toDataURL("image/png"));
  };
  const clear = () => {
    const c = canvasRef.current;
    c.getContext("2d").clearRect(0, 0, c.width, c.height);
    onChange("");
  };

  return (
    <div
      data-testid={`pdf-overlay-${field.id}`}
      style={style}
      className="relative border border-blue-400/70 bg-white rounded-sm"
    >
      <canvas
        ref={canvasRef}
        width={400}
        height={120}
        className="w-full h-full cursor-crosshair touch-none"
        onMouseDown={start}
        onMouseMove={draw}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={draw}
        onTouchEnd={end}
      />
      {value && !disabled && (
        <button
          type="button"
          onClick={clear}
          className="absolute -top-2 -right-2 bg-white shadow rounded-full p-0.5 border border-slate-200"
          title="Clear signature"
        >
          <X className="w-3 h-3 text-slate-600" />
        </button>
      )}
    </div>
  );
}
