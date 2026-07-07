/**
 * PDF Form Builder — Field Properties Panel
 *
 * By popular demand this now uses the **exact same** tabbed properties layout
 * as the standard Form Builder (General / Data / Lookup / Formula / Validation
 * / Adv), plus one extra "PDF" tab for PDF-only settings (position, colors,
 * font, lock, auto-fit-text, uniform-height override).
 */
import React from "react";
import {
  FieldPropertiesTabs,
  EmptyPropertiesAside,
} from "@/components/builder/PropertiesPanel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  ArrowUp, ArrowDown, Lock, Unlock, Eye, EyeOff, Copy, Trash2, ImageIcon,
  ArrowsUpFromLine,
} from "lucide-react";

export default function PdfProperties({
  field, fields, onChange, onDuplicate, onDelete, onZ, onLock, onVisible,
}) {
  if (!field) {
    // Empty state — reuse the standard builder's empty aside for visual parity.
    return <EmptyPropertiesAside />;
  }

  // Wrap the (id, patch) API expected by PdfBuilder into the (patch) API used
  // by the shared FieldPropertiesTabs.
  const update = (patch) => onChange(field.id, patch);

  const pdfExtras = (
    <PdfAppearanceTab
      field={field}
      update={update}
      onDuplicate={() => onDuplicate?.(field.id)}
      onDelete={() => onDelete?.(field.id)}
      onZ={(d) => onZ?.(field.id, d)}
      onLock={() => onLock?.(field.id)}
      onVisible={() => onVisible?.(field.id)}
    />
  );

  return (
    <aside
      className="w-96 shrink-0 border-l border-slate-200 bg-white overflow-hidden flex flex-col"
      data-testid="properties-panel"
    >
      <FieldPropertiesTabs
        field={field}
        formFields={fields || []}
        onChange={update}
        extras={pdfExtras}
        extrasTab={{ key: "pdf", label: "PDF", icon: <ImageIcon className="w-3 h-3 mr-1.5" /> }}
      />
    </aside>
  );
}

/* -----------------------------------------------------------------------
   PDF-only tab: position, size, appearance, locking, uniform-height overrides
   ----------------------------------------------------------------------- */

function PdfAppearanceTab({ field, update, onDuplicate, onDelete, onZ, onLock, onVisible }) {
  const setNum = (k) => (e) => update({ [k]: Number(e.target.value) });
  const setVal = (k) => (e) => update({ [k]: e.target.value });
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" data-testid="prop-zup" onClick={() => onZ(+1)} title="Bring forward"><ArrowUp className="w-4 h-4"/></Button>
        <Button variant="ghost" size="icon" data-testid="prop-zdown" onClick={() => onZ(-1)} title="Send backward"><ArrowDown className="w-4 h-4"/></Button>
        <Button variant="ghost" size="icon" data-testid="prop-lock" onClick={onLock} title="Lock/unlock">
          {field.locked ? <Lock className="w-4 h-4"/> : <Unlock className="w-4 h-4"/>}
        </Button>
        <Button variant="ghost" size="icon" data-testid="prop-visible" onClick={onVisible} title="Show/hide">
          {field.visible ? <Eye className="w-4 h-4"/> : <EyeOff className="w-4 h-4"/>}
        </Button>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-2">Position & size (% of page)</div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-slate-500">X<Input type="number" step="0.01" value={field.x ?? 0} onChange={setNum("x")} className="mt-1 h-8"/></label>
          <label className="text-xs text-slate-500">Y<Input type="number" step="0.01" value={field.y ?? 0} onChange={setNum("y")} className="mt-1 h-8"/></label>
          <label className="text-xs text-slate-500">Width<Input type="number" step="0.01" value={field.width ?? 0.2} onChange={setNum("width")} className="mt-1 h-8"/></label>
          <label className="text-xs text-slate-500">Height<Input type="number" step="0.01" value={field.height ?? 0.04} onChange={setNum("height")} className="mt-1 h-8"/></label>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <label className="text-xs text-slate-500">Rotation°<Input type="number" step="1" value={field.rotation ?? 0} onChange={setNum("rotation")} className="mt-1 h-8"/></label>
          <label className="text-xs text-slate-500">Z-index<Input type="number" step="1" value={field.z_index ?? 0} onChange={setNum("z_index")} className="mt-1 h-8"/></label>
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-2">Font</div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-slate-500">Size (pt)
            <Input type="number" step="1" min="6" value={field.font_size ?? 12}
              disabled={field.font_auto_fit !== false}
              onChange={setNum("font_size")} className="mt-1 h-8"/>
          </label>
          <label className="text-xs text-slate-500">Family
            <Input value={field.font_family || "Helvetica"} onChange={setVal("font_family")} className="mt-1 h-8"/>
          </label>
        </div>
        <label className="flex items-center gap-2 mt-2 cursor-pointer">
          <Switch checked={field.font_auto_fit !== false} onCheckedChange={(v) => update({ font_auto_fit: v })} data-testid="prop-auto-fit-font"/>
          <span className="text-xs text-slate-600 flex items-center gap-1">
            <ArrowsUpFromLine className="w-3 h-3"/> Auto-fit text to field height
          </span>
        </label>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <label className="text-xs text-slate-500">Color
            <input type="color" value={field.font_color || "#111827"} onChange={setVal("font_color")}
              className="mt-1 h-8 w-full border border-slate-200 rounded" data-testid="prop-font-color"/>
          </label>
          <label className="text-xs text-slate-500">Alignment
            <select value={field.alignment || "left"} onChange={setVal("alignment")}
              className="mt-1 h-8 w-full border border-slate-200 rounded px-2 text-xs">
              <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
            </select>
          </label>
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-2">Frame</div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-slate-500">Border
            <input type="color" value={field.border_color || "#2563EB"} onChange={setVal("border_color")}
              className="mt-1 h-8 w-full border border-slate-200 rounded"/>
          </label>
          <label className="text-xs text-slate-500">Background
            <input type="color" value={field.background_color || "#DBEAFE"} onChange={setVal("background_color")}
              className="mt-1 h-8 w-full border border-slate-200 rounded"/>
          </label>
        </div>
        <label className="text-xs text-slate-500 mt-2 block">Opacity ({Math.round(((field.opacity ?? 0.4) * 100))}%)
          <input type="range" min="0" max="1" step="0.05" value={field.opacity ?? 0.4}
            onChange={setNum("opacity")} className="mt-1 w-full"/>
        </label>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-2">Interaction</div>
        <label className="flex items-center gap-2 cursor-pointer mb-2">
          <Switch checked={!!field.locked} onCheckedChange={(v) => update({ locked: v })} data-testid="prop-locked"/>
          <span className="text-xs text-slate-600">Lock this field (cannot be edited alone)</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer mb-2">
          <Switch checked={field.include_in_pdf !== false} onCheckedChange={(v) => update({ include_in_pdf: v })}/>
          <span className="text-xs text-slate-600">Include in generated PDF</span>
        </label>
      </div>

      <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
        <Button data-testid="prop-duplicate" variant="outline" className="flex-1" onClick={onDuplicate}>
          <Copy className="w-4 h-4 mr-1.5"/> Duplicate
        </Button>
        <Button data-testid="prop-delete" variant="outline" className="flex-1 text-red-600 hover:bg-red-50" onClick={onDelete}>
          <Trash2 className="w-4 h-4 mr-1.5"/> Delete
        </Button>
      </div>
    </div>
  );
}
