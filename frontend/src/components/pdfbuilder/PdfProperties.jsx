/**
 * PDF Form Builder - Field Properties Panel
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
  ArrowsUpFromLine, LayoutList, LayoutGrid, RotateCcw, Settings2,
  AlignLeft, AlignRight, AlignCenter, AlignHorizontalSpaceAround, AlignVerticalSpaceAround,
  Bold, Italic
} from "lucide-react";
import { defaultOptionPositions, resolveOptionBoxes } from "@/lib/pdfFieldTypes";
import VaultPathInput from "@/components/VaultPathInput";

export default function PdfProperties({
  fields, selectedIds = [], onChange, onDuplicate, onDelete, onZ, onLock, onVisible,
  template, onTemplateChange,
}) {
  const selectedFields = selectedIds.map(id => fields.find(f => f.id === id)).filter(Boolean);

  if (selectedFields.length === 0) {
    return (
      <TemplateSettingsAside
        template={template}
        onTemplateChange={onTemplateChange}
      />
    );
  }

  if (selectedFields.length > 1) {
    return (
      <aside
        className="w-96 shrink-0 border-l border-slate-200 bg-white dark:bg-slate-900 overflow-hidden flex flex-col h-full max-h-[calc(100vh-3.5rem)]"
        data-testid="properties-panel"
      >
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div className="font-heading font-semibold text-slate-900 text-sm">
            Bulk Edit ({selectedFields.length} selected)
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 nice-scroll">
          <PdfBulkAppearanceTab
            fields={selectedFields}
            selectedIds={selectedIds}
            onChange={onChange}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
            onZ={onZ}
            onLock={onLock}
            onVisible={onVisible}
          />
        </div>
      </aside>
    );
  }

  const field = selectedFields[0];
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
      className="w-96 shrink-0 border-l border-slate-200 bg-white dark:bg-slate-900 overflow-hidden flex flex-col h-full max-h-[calc(100vh-3.5rem)]"
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
            <select value={field.font_family || "Helvetica"} onChange={setVal("font_family")}
              className="mt-1 h-8 w-full border border-slate-200 rounded px-2 text-xs">
              <option value="Helvetica">Helvetica</option>
              <option value="Times-Roman">Times-Roman</option>
              <option value="Courier">Courier</option>
            </select>
          </label>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Button variant={field.is_bold ? "secondary" : "outline"} size="sm" className="h-7 px-2"
            onClick={() => update({ is_bold: !field.is_bold })} title="Bold">
            <Bold className="w-3 h-3" />
          </Button>
          <Button variant={field.is_italic ? "secondary" : "outline"} size="sm" className="h-7 px-2"
            onClick={() => update({ is_italic: !field.is_italic })} title="Italic">
            <Italic className="w-3 h-3" />
          </Button>
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

      {(field.type === "checkbox" || field.type === "radio") && (
        <OptionLayoutSection field={field} update={update} />
      )}

      {field.type === "checkbox" && (
        <>
          <label className="flex items-center gap-2 mt-2 cursor-pointer">
            <Switch checked={field.allow_multiple} onCheckedChange={(v) => update({ allow_multiple: v })} />
            <span className="text-xs text-slate-600">Allow multiple selections</span>
          </label>
          <label className="flex items-center gap-2 mt-2 cursor-pointer">
            <Switch checked={field.no_border} onCheckedChange={(v) => update({ no_border: v })} />
            <span className="text-xs text-slate-600">No Border (Tick only)</span>
          </label>
        </>
      )}

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

function OptionLayoutSection({ field, update }) {
  const boxes = resolveOptionBoxes(field);
  const options = field.options || [];

  const applyPositions = (positions) => update({ option_positions: positions });

  const stackVertical = () => {
    const h = boxes[0]?.h ?? 0.03;
    const w = boxes[0]?.w ?? field.width;
    const startY = field.y + (field.height || 0.04);
    applyPositions(options.map((_, i) => ({
      x: field.x,
      y: Math.min(0.98, startY + i * h),
      w, h,
    })));
  };

  const stackHorizontal = () => {
    const h = boxes[0]?.h ?? 0.03;
    const perW = Math.max(0.08, Math.min(0.2, (1 - field.x) / Math.max(1, options.length)));
    applyPositions(options.map((_, i) => ({
      x: Math.min(0.98, field.x + i * (perW + 0.005)),
      y: field.y + (field.height || 0.04),
      w: perW, h,
    })));
  };

  const resetToDefault = () => applyPositions(defaultOptionPositions(field, options));

  const setBoxField = (i, key, value) => {
    const positions = boxes.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h }));
    positions[i] = { ...positions[i], [key]: value };
    applyPositions(positions);
  };

  return (
    <div data-testid="pdf-option-layout">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-2">
        Option positions
      </div>
      <p className="text-[11px] text-slate-500 mb-2 leading-relaxed">
        Each option below is a separate draggable box on the PDF page.
      </p>
      <div className="flex flex-wrap gap-1.5 mb-3">
        <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={stackVertical}>
          <LayoutList className="w-3 h-3 mr-1"/> Stack
        </Button>
        <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={stackHorizontal}>
          <LayoutGrid className="w-3 h-3 mr-1"/> Row
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] text-slate-500" onClick={resetToDefault}>
          <RotateCcw className="w-3 h-3 mr-1"/> Reset
        </Button>
      </div>
      {options.length === 0 && (
        <p className="text-[11px] text-amber-600">
          Add options in the General tab first.
        </p>
      )}
      <div className="space-y-2 max-h-64 overflow-y-auto pr-1 nice-scroll">
        {boxes.map((b, i) => (
          <div key={i} className="border border-slate-100 rounded-md p-2 bg-slate-50/50">
            <div className="text-[11px] font-medium text-slate-700 truncate mb-1.5">
              {i + 1}. {b.value}
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {["x", "y", "w", "h"].map((k) => (
                <label key={k} className="text-[10px] text-slate-500">
                  <span className="uppercase">{k}</span>
                  <Input
                    type="number" step="0.005" min="0" max="1"
                    value={Number(b[k]).toFixed(3)}
                    onChange={(e) => setBoxField(i, k, Number(e.target.value))}
                    className="mt-0.5 h-7 text-[11px] px-1.5"
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TemplateSettingsAside({ template, onTemplateChange }) {
  if (!template || !onTemplateChange) {
    return <EmptyPropertiesAside />;
  }
  return (
    <aside
      className="w-96 shrink-0 border-l border-slate-200 bg-white dark:bg-slate-900 overflow-hidden flex flex-col h-full max-h-[calc(100vh-3.5rem)]"
      data-testid="properties-panel"
    >
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <Settings2 className="w-4 h-4 text-slate-500" />
        <div className="font-heading font-semibold text-slate-900 text-sm">
          PDF form settings
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 nice-scroll space-y-5">
        <div>
          <Label className="text-xs text-slate-600">Download filename template</Label>
          <Input
            data-testid="pdf-filename-template"
            value={template.filename_template ?? ""}
            placeholder="{asset_id}_{submitter_name}_{datetime}"
            className="mt-1"
            onChange={(e) => onTemplateChange({ filename_template: e.target.value })}
          />
          <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
            Used when the submitter downloads the filled PDF. Placeholders:
          </p>
          <ul className="text-[11px] text-slate-500 space-y-0.5 mt-1 pl-2">
            <li><code className="bg-slate-100 px-1 rounded">{"{form_name}"}</code> - this template's title</li>
            <li><code className="bg-slate-100 px-1 rounded">{"{asset_id}"}</code> - site / plant code from the submission</li>
            <li><code className="bg-slate-100 px-1 rounded">{"{submitter_name}"}</code> - logged-in user's name</li>
            <li><code className="bg-slate-100 px-1 rounded">{"{datetime}"}</code> - YYYY-MM-DD_HHMM</li>
          </ul>
          <p className="text-[11px] text-slate-400 mt-1.5">
            Leave blank to fall back to <code className="bg-slate-100 px-1 rounded">{"{asset_id}_{submitter_name}_{datetime}"}</code>. Missing placeholders collapse silently.
          </p>
        </div>
        <div className="pt-4 border-t border-slate-100">
          <VaultPathInput 
            value={template.doc_vault_path} 
            onChange={(v) => onTemplateChange({ doc_vault_path: v })} 
            labelClass="text-xs text-slate-600 font-medium"
          />
        </div>
      </div>
    </aside>
  );
}

function PdfBulkAppearanceTab({ fields, selectedIds, onChange, onDuplicate, onDelete, onZ, onLock, onVisible }) {
  const update = (patch) => onChange(selectedIds, patch);
  const setNum = (k) => (e) => update({ [k]: Number(e.target.value) });
  const setVal = (k) => (e) => update({ [k]: e.target.value });

  const handleAlign = (type) => {
    if (fields.length < 2) return;
    if (type === 'left') {
      const minX = Math.min(...fields.map(f => f.x));
      update({ x: minX });
    } else if (type === 'right') {
      const maxEdge = Math.max(...fields.map(f => f.x + f.width));
      fields.forEach(f => onChange(f.id, { x: maxEdge - f.width }));
    } else if (type === 'top') {
      const minY = Math.min(...fields.map(f => f.y));
      update({ y: minY });
    } else if (type === 'bottom') {
      const maxEdge = Math.max(...fields.map(f => f.y + f.height));
      fields.forEach(f => onChange(f.id, { y: maxEdge - f.height }));
    } else if (type === 'v-dist') {
      const sorted = [...fields].sort((a, b) => a.y - b.y);
      const minY = sorted[0].y;
      const maxY = sorted[sorted.length - 1].y;
      const totalH = sorted.reduce((sum, f) => sum + f.height, 0);
      const gap = (maxY + sorted[sorted.length - 1].height - minY - totalH) / (sorted.length - 1);
      let currY = minY;
      sorted.forEach((f, i) => {
        if (i > 0 && i < sorted.length - 1) {
          onChange(f.id, { y: currY });
        }
        currY += f.height + gap;
      });
    }
  };

  const f0 = fields[0] || {}; 

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-1">
        <Button variant="ghost" size="icon" onClick={() => onZ(selectedIds, +1)} title="Bring forward"><ArrowUp className="w-4 h-4"/></Button>
        <Button variant="ghost" size="icon" onClick={() => onZ(selectedIds, -1)} title="Send backward"><ArrowDown className="w-4 h-4"/></Button>
        <Button variant="ghost" size="icon" onClick={() => onLock(selectedIds)} title="Lock/unlock"><Lock className="w-4 h-4"/></Button>
        <Button variant="ghost" size="icon" onClick={() => onVisible(selectedIds)} title="Show/hide"><Eye className="w-4 h-4"/></Button>
        <div className="w-[1px] h-4 bg-slate-200 mx-1"></div>
        <Button variant="ghost" size="icon" onClick={() => onDuplicate(selectedIds)} title="Duplicate"><Copy className="w-4 h-4 text-slate-500"/></Button>
        <Button variant="ghost" size="icon" onClick={() => onDelete(selectedIds)} title="Delete"><Trash2 className="w-4 h-4 text-red-500"/></Button>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-2">Alignment</div>
        <div className="grid grid-cols-4 gap-2">
          <Button variant="outline" size="sm" onClick={() => handleAlign('left')} title="Align Left"><AlignLeft className="w-4 h-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => handleAlign('right')} title="Align Right"><AlignRight className="w-4 h-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => handleAlign('top')} title="Align Top">Top</Button>
          <Button variant="outline" size="sm" onClick={() => handleAlign('v-dist')} title="Distribute Vertically"><AlignVerticalSpaceAround className="w-4 h-4" /></Button>
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-2">Bulk Size Override</div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-slate-500">Set Width<Input type="number" step="0.01" placeholder="e.g. 0.2" onChange={setNum("width")} className="mt-1 h-8"/></label>
          <label className="text-xs text-slate-500">Set Height<Input type="number" step="0.01" placeholder="e.g. 0.04" onChange={setNum("height")} className="mt-1 h-8"/></label>
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-2">Font</div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-slate-500">Size (pt)
            <Input type="number" step="1" min="6" value={f0.font_size ?? 12} onChange={setNum("font_size")} className="mt-1 h-8"/>
          </label>
          <label className="text-xs text-slate-500">Family
            <select value={f0.font_family || "Helvetica"} onChange={setVal("font_family")}
              className="mt-1 h-8 w-full border border-slate-200 rounded px-2 text-xs">
              <option value="Helvetica">Helvetica</option>
              <option value="Times-Roman">Times-Roman</option>
              <option value="Courier">Courier</option>
            </select>
          </label>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Button variant={f0.is_bold ? "secondary" : "outline"} size="sm" className="h-7 px-2"
            onClick={() => update({ is_bold: !f0.is_bold })} title="Bold">
            <Bold className="w-3 h-3" />
          </Button>
          <Button variant={f0.is_italic ? "secondary" : "outline"} size="sm" className="h-7 px-2"
            onClick={() => update({ is_italic: !f0.is_italic })} title="Italic">
            <Italic className="w-3 h-3" />
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <label className="text-xs text-slate-500">Color
            <input type="color" value={f0.font_color || "#111827"} onChange={setVal("font_color")} className="mt-1 h-8 w-full border border-slate-200 rounded"/>
          </label>
        </div>
      </div>
    </div>
  );
}
