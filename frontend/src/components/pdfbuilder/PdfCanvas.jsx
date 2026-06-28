import React, { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page } from "react-pdf";
import { authPdfFile } from "@/lib/pdfWorker";
import { Rnd } from "react-rnd";
import { getPdfFieldMeta } from "@/lib/pdfFieldTypes";

/**
 * Multi-page PDF canvas with overlaid field rectangles (drag/resize via react-rnd).
 *
 * Props:
 *   fileUrl         absolute URL of the PDF
 *   fields          field array
 *   pages           [{page,width,height}] from server
 *   zoom            number (1 = 100 %)
 *   rotation        0/90/180/270
 *   selectedId      currently selected field id
 *   showGrid        boolean
 *   snapToGrid      boolean (8-px grid)
 *   onSelect(id)
 *   onFieldChange(id, patch)
 *   onAddField(type, page, xPct, yPct)
 *   onDuplicate(id)
 *   onDelete(id)
 *   registerPageRef(page, ref)
 */
export default function PdfCanvas({
  fileUrl, fields, pages, zoom = 1, rotation = 0, selectedId,
  showGrid = false, snapToGrid = false,
  onSelect, onFieldChange, onAddField, onDuplicate, onDelete,
  registerPageRef,
}) {
  const [numPages, setNumPages] = useState(pages?.length || 0);
  const containerRef = useRef(null);
  const file = useMemo(() => authPdfFile(fileUrl), [fileUrl]);

  return (
    <div ref={containerRef} className="flex-1 overflow-auto bg-slate-100 nice-scroll"
         data-testid="pdf-canvas-scroll"
         onClick={() => onSelect && onSelect(null)}>
      <div className="py-8 flex flex-col items-center gap-8">
        <Document
          file={file}
          onLoadSuccess={({ numPages: n }) => setNumPages(n)}
          onLoadError={(e) => console.error("PDF load error", e)}
          loading={<div className="text-slate-400 text-sm">Loading PDF…</div>}
        >
          {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
            <PdfPageView
              key={pageNum}
              pageNum={pageNum}
              zoom={zoom}
              rotation={rotation}
              fields={fields.filter((f) => Number(f.page) === pageNum)}
              selectedId={selectedId}
              showGrid={showGrid}
              snapToGrid={snapToGrid}
              onSelect={onSelect}
              onFieldChange={onFieldChange}
              onAddField={onAddField}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
              registerPageRef={registerPageRef}
            />
          ))}
        </Document>
      </div>
    </div>
  );
}

function PdfPageView({
  pageNum, zoom, rotation, fields, selectedId, showGrid, snapToGrid,
  onSelect, onFieldChange, onAddField, onDuplicate, onDelete, registerPageRef,
}) {
  const wrapRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (registerPageRef && wrapRef.current) registerPageRef(pageNum, wrapRef.current);
  }, [pageNum, registerPageRef]);

  const onRender = ({ width, height }) => setSize({ w: width, h: height });

  const onDropField = (e) => {
    e.preventDefault();
    const type = e.dataTransfer.getData("text/pdf-field-type");
    if (!type || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    let x = (e.clientX - rect.left) / rect.width;
    let y = (e.clientY - rect.top) / rect.height;
    if (snapToGrid) { x = Math.round(x * 100) / 100; y = Math.round(y * 100) / 100; }
    onAddField && onAddField(type, pageNum, Math.max(0, Math.min(0.95, x)), Math.max(0, Math.min(0.95, y)));
  };

  return (
    <div
      ref={wrapRef}
      data-testid={`pdf-page-${pageNum}`}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
      onDrop={onDropField}
      onClick={(e) => { e.stopPropagation(); onSelect && onSelect(null); }}
      className="relative shadow-xl bg-white"
      style={{ width: size.w || undefined, height: size.h || undefined }}
    >
      <Page
        pageNumber={pageNum}
        scale={zoom}
        rotate={rotation}
        renderTextLayer={false}
        renderAnnotationLayer={false}
        onRenderSuccess={onRender}
      />
      {/* badge */}
      <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-slate-900/70 text-white text-[10px] font-semibold tracking-wider z-10 pointer-events-none">
        PAGE {pageNum}
      </div>
      {/* grid */}
      {showGrid && size.w > 0 && (
        <div className="absolute inset-0 pointer-events-none opacity-30"
             style={{
               backgroundImage:
                 "linear-gradient(to right, #94a3b8 1px, transparent 1px), linear-gradient(to bottom, #94a3b8 1px, transparent 1px)",
               backgroundSize: "20px 20px",
             }} />
      )}
      {/* fields */}
      {size.w > 0 && fields.map((f) => (
        <FieldBox
          key={f.id}
          f={f}
          containerW={size.w}
          containerH={size.h}
          selected={selectedId === f.id}
          snapToGrid={snapToGrid}
          onSelect={onSelect}
          onFieldChange={onFieldChange}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

function FieldBox({ f, containerW, containerH, selected, snapToGrid,
                   onSelect, onFieldChange, onDuplicate, onDelete }) {
  const meta = getPdfFieldMeta(f.type);
  const Icon = meta.icon;
  const px = (pct) => pct * containerW;
  const py = (pct) => pct * containerH;
  const x = px(f.x), y = py(f.y), w = px(f.width), h = py(f.height);

  const handleDrag = (_e, d) => {
    let nx = d.x / containerW;
    let ny = d.y / containerH;
    if (snapToGrid) {
      nx = Math.round(nx * 100) / 100;
      ny = Math.round(ny * 100) / 100;
    }
    onFieldChange(f.id, { x: Math.max(0, Math.min(1 - f.width, nx)), y: Math.max(0, Math.min(1 - f.height, ny)) });
  };
  const handleResize = (_e, _dir, ref, _delta, position) => {
    const nw = ref.offsetWidth / containerW;
    const nh = ref.offsetHeight / containerH;
    const nx = position.x / containerW;
    const ny = position.y / containerH;
    onFieldChange(f.id, {
      x: Math.max(0, nx), y: Math.max(0, ny),
      width: Math.max(0.02, Math.min(1, nw)), height: Math.max(0.01, Math.min(1, nh)),
    });
  };

  if (!f.visible) return null;

  return (
    <Rnd
      size={{ width: w, height: h }}
      position={{ x, y }}
      onDragStop={handleDrag}
      onResizeStop={handleResize}
      bounds="parent"
      disableDragging={!!f.locked}
      enableResizing={!f.locked}
      onClick={(e) => { e.stopPropagation(); onSelect && onSelect(f.id); }}
      style={{
        zIndex: 50 + (f.z_index || 0),
        transform: `rotate(${f.rotation || 0}deg)`,
      }}
      className={`group ${selected ? "ring-2 ring-blue-500" : ""}`}
    >
      <div
        data-testid={`pdf-field-${f.id}`}
        className="w-full h-full relative border-2 cursor-move flex items-center text-[11px] overflow-hidden"
        style={{
          background: hexAlpha(f.background_color || "#DBEAFE", f.opacity ?? 0.4),
          borderColor: f.border_color || "#2563EB",
          color: f.font_color || "#111827",
        }}
      >
        <div className="px-1.5 truncate flex items-center gap-1 w-full">
          <Icon className="w-3 h-3 shrink-0 text-blue-700" />
          <span className="truncate font-medium" style={{ fontSize: Math.max(9, (f.font_size || 12) * 0.85) }}>
            {f.label || meta.label}
          </span>
          {f.required && <span className="text-red-500 ml-auto">*</span>}
        </div>
        {selected && (
          <div className="absolute -top-7 left-0 right-0 flex items-center gap-1 text-[10px] pointer-events-auto">
            <span className="px-1.5 py-0.5 bg-blue-600 text-white rounded">
              {meta.label}
            </span>
            <button data-testid={`pdf-field-dup-${f.id}`} onClick={(e) => { e.stopPropagation(); onDuplicate(f.id); }}
                    className="px-1.5 py-0.5 bg-white border border-slate-200 rounded hover:bg-slate-50">Duplicate</button>
            <button data-testid={`pdf-field-del-${f.id}`} onClick={(e) => { e.stopPropagation(); onDelete(f.id); }}
                    className="px-1.5 py-0.5 bg-white border border-red-200 text-red-600 rounded hover:bg-red-50">Delete</button>
          </div>
        )}
      </div>
    </Rnd>
  );
}

function hexAlpha(hex, alpha) {
  const h = (hex || "#DBEAFE").replace("#", "");
  const r = parseInt(h.length === 3 ? h[0] + h[0] : h.slice(0, 2), 16);
  const g = parseInt(h.length === 3 ? h[1] + h[1] : h.slice(2, 4), 16);
  const b = parseInt(h.length === 3 ? h[2] + h[2] : h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
