import React, { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page } from "react-pdf";
import { usePdfFile } from "@/lib/pdfWorker";
import { Rnd } from "react-rnd";
import { getPdfFieldMeta, resolveOptionBoxes } from "@/lib/pdfFieldTypes";

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
  fileUrl, fields, pages, zoom = 1, rotation = 0, selectedIds = [],
  showGrid = false, snapToGrid = false,
  onSelect, onFieldChange, onAddField, onDuplicate, onDelete,
  registerPageRef,
}) {
  const [numPages, setNumPages] = useState(pages?.length || 0);
  const containerRef = useRef(null);
  const { file, loading: pdfLoading, error: pdfError } = usePdfFile(fileUrl);

  return (
    <div ref={containerRef} className="w-full h-full min-h-[500px] max-h-[calc(100vh-160px)] overflow-y-auto bg-slate-100 nice-scroll"
         data-testid="pdf-canvas-scroll"
         onClick={() => onSelect && onSelect(null)}>
      <div className="py-8 flex flex-col items-center gap-8">
        {pdfLoading && <div className="text-slate-400 text-sm py-12">Loading PDF…</div>}
        {pdfError && <div className="text-rose-500 text-sm py-12">Failed to load PDF file.</div>}
        {file && (
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
              selectedIds={selectedIds}
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
        )}
      </div>
    </div>
  );
}

function PdfPageView({
  pageNum, zoom, rotation, fields, selectedIds, showGrid, snapToGrid,
  onSelect, onFieldChange, onAddField, onDuplicate, onDelete, registerPageRef,
}) {
  const wrapRef = useRef(null);
  const marqueeRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [marquee, setMarquee] = useState(null);

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

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('.react-rnd-handle') || e.target.closest('button')) return;

    if (!wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const mData = { startX: x, startY: y, currX: x, currY: y, targetEl: e.target };
    marqueeRef.current = mData;
    setMarquee(mData);
  };

  useEffect(() => {
    const handleMove = (e) => {
      if (!marqueeRef.current || !wrapRef.current) return;
      const rect = wrapRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      marqueeRef.current = { ...marqueeRef.current, currX: x, currY: y };
      setMarquee({ ...marqueeRef.current });
    };

    const handleUp = (e) => {
      const cur = marqueeRef.current;
      marqueeRef.current = null;
      setMarquee(null);

      if (!cur || !wrapRef.current) return;

      const rect = wrapRef.current.getBoundingClientRect();
      const endX = e.clientX - rect.left;
      const endY = e.clientY - rect.top;

      const domW = rect.width || 1;
      const domH = rect.height || 1;

      const dist = Math.hypot(endX - cur.startX, endY - cur.startY);

      if (dist > 4) {
        const mMinX = Math.min(cur.startX, endX);
        const mMaxX = Math.max(cur.startX, endX);
        const mMinY = Math.min(cur.startY, endY);
        const mMaxY = Math.max(cur.startY, endY);

        const newlySelected = [];
        for (const f of fields) {
          if (f.visible === false) continue;
          const fx1 = Number(f.x ?? 0) * domW;
          const fw = Number(f.width ?? 0.15) * domW;
          const fx2 = fx1 + fw;

          const fy1 = Number(f.y ?? 0) * domH;
          const fh = Number(f.height ?? 0.04) * domH;
          const fy2 = fy1 + fh;

          // AABB Bounding Box Overlap / Intersection in exact DOM pixels
          if (fx1 <= mMaxX && fx2 >= mMinX && fy1 <= mMaxY && fy2 >= mMinY) {
            newlySelected.push(f.id);
          }
        }

        if (onSelect) {
          const allSelected = e.shiftKey
            ? Array.from(new Set([...(selectedIds || []), ...newlySelected]))
            : newlySelected;
          onSelect(allSelected);
        }
      } else {
        const clickedField = cur.targetEl ? cur.targetEl.closest('.react-rnd') : null;
        if (!clickedField && !e.shiftKey && onSelect) {
          onSelect([]);
        }
      }
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [fields, selectedIds, onSelect]);

  return (
    <div
      ref={wrapRef}
      data-testid={`pdf-page-${pageNum}`}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
      onDrop={onDropField}
      onPointerDown={onPointerDown}
      className="relative shadow-xl bg-white select-none"
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
      {/* marquee */}
      {marquee && (
        <div
          className="absolute border border-blue-500 bg-blue-500/20 pointer-events-none z-50"
          style={{
            left: Math.min(marquee.startX, marquee.currX),
            top: Math.min(marquee.startY, marquee.currY),
            width: Math.abs(marquee.currX - marquee.startX),
            height: Math.abs(marquee.currY - marquee.startY),
          }}
        />
      )}
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
        <React.Fragment key={f.id}>
          <FieldBox
            f={f}
            containerW={size.w}
            containerH={size.h}
            selected={selectedIds.includes(f.id)}
            snapToGrid={snapToGrid}
            onSelect={onSelect}
            onFieldChange={onFieldChange}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
          />
          {(f.type === "checkbox" || f.type === "radio") && f.visible && !f.locked && (
            <OptionBoxes
              f={f}
              containerW={size.w}
              containerH={size.h}
              snapToGrid={snapToGrid}
              parentSelected={selectedIds.includes(f.id)}
              onSelect={onSelect}
              onFieldChange={onFieldChange}
            />
          )}
        </React.Fragment>
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
      onClick={(e) => { e.stopPropagation(); onSelect && onSelect(f.id, e.shiftKey); }}
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
          <span className="truncate font-medium" style={{ fontSize: computeFontSize(f, h) }}>
            {(f.auto_number?.enabled || f.type === "auto_number")
              ? `# ${f.label || meta.label} (${f.auto_number?.mode === "continuous" ? "1,2,3..." : `${new Date().getFullYear()}/001`})`
              : (f.label || meta.label)}
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

/**
 * Compute rendered font size for a PDF field.
 * When `font_auto_fit` is on (default), scale text to fill about 60% of the
 * field's pixel height so it always looks consistent regardless of the box
 * size. When off, honour the manual `font_size` (pt).
 */
function computeFontSize(f, heightPx) {
  if (f.font_auto_fit === false) return Math.max(8, f.font_size || 12);
  const target = Math.max(9, Math.min(28, heightPx * 0.55));
  return target;
}

/* -----------------------------------------------------------------------
   OptionBoxes — one draggable Rnd per checkbox / radio option.
   ----------------------------------------------------------------------- */
function OptionBoxes({ f, containerW, containerH, snapToGrid, parentSelected,
                       onSelect, onFieldChange }) {
  const boxes = useMemo(() => resolveOptionBoxes(f), [f]);

  const updatePos = (i, patch) => {
    const positions = boxes.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h }));
    positions[i] = { ...positions[i], ...patch };
    onFieldChange(f.id, { option_positions: positions });
  };

  const isCheckbox = f.type === "checkbox";
  return (
    <>
      {boxes.map((b, i) => {
        const x = b.x * containerW;
        const y = b.y * containerH;
        const w = b.w * containerW;
        const h = b.h * containerH;
        return (
          <Rnd
            key={`${f.id}-opt-${i}`}
            data-testid={`pdf-option-${f.id}-${i}`}
            size={{ width: w, height: h }}
            position={{ x, y }}
            bounds="parent"
            onDragStop={(_e, d) => {
              let nx = d.x / containerW;
              let ny = d.y / containerH;
              if (snapToGrid) {
                nx = Math.round(nx * 100) / 100;
                ny = Math.round(ny * 100) / 100;
              }
              updatePos(i, { x: Math.max(0, Math.min(1 - b.w, nx)),
                             y: Math.max(0, Math.min(1 - b.h, ny)) });
            }}
            onResizeStop={(_e, _dir, ref, _delta, position) => {
              updatePos(i, {
                x: Math.max(0, position.x / containerW),
                y: Math.max(0, position.y / containerH),
                w: Math.max(0.02, ref.offsetWidth / containerW),
                h: Math.max(0.015, ref.offsetHeight / containerH),
              });
            }}
            onClick={(e) => { e.stopPropagation(); onSelect && onSelect(f.id); }}
            style={{ zIndex: 60 + (f.z_index || 0) }}
            className={`group ${parentSelected ? "ring-1 ring-blue-400" : ""}`}
          >
            <div
              className="w-full h-full flex items-center gap-1 px-1 border border-dashed rounded-sm cursor-move overflow-hidden bg-white/60 hover:bg-white"
              style={{ borderColor: f.border_color || "#2563EB" }}
              title={`Option: ${b.value}`}
            >
              {/* Fake checkbox / radio glyph */}
              <span
                className={`shrink-0 border ${isCheckbox ? "rounded-sm" : "rounded-full"}`}
                style={{
                  width: Math.max(8, Math.min(18, h * 0.7)),
                  height: Math.max(8, Math.min(18, h * 0.7)),
                  borderColor: f.font_color || "#111827",
                }}
              />
              <span
                className="truncate text-[11px]"
                style={{
                  color: f.font_color || "#111827",
                  fontFamily: f.font_family || "Helvetica",
                  fontSize: computeFontSize(f, h),
                }}
              >
                {b.value}
              </span>
            </div>
          </Rnd>
        );
      })}
    </>
  );
}
