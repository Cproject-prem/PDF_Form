import React, { useMemo, useRef, useState } from "react";
import { Document, Page } from "react-pdf";
import { authPdfFile } from "@/lib/pdfWorker";

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
    default:
      // short_text, phone, url, and everything else — plain text input
      return <input type="text" className={baseCls} {...commonProps} />;
  }
}
