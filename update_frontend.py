import re
with open('frontend/src/components/pdfbuilder/PdfProperties.jsx', 'r', encoding='utf-8') as f: content = f.read()

# 1. Add lucide imports
content = content.replace(
    '  ArrowsUpFromLine, LayoutList, LayoutGrid, RotateCcw, Settings2,',
    '  ArrowsUpFromLine, LayoutList, LayoutGrid, RotateCcw, Settings2,\n  AlignLeft, AlignRight, AlignCenter, AlignHorizontalSpaceAround, AlignVerticalSpaceAround,\n  Bold, Italic'
)

# 2. Add VaultPathInput import
content = content.replace(
    'import { defaultOptionPositions, resolveOptionBoxes } from "@/lib/pdfFieldTypes";',
    'import { defaultOptionPositions, resolveOptionBoxes } from "@/lib/pdfFieldTypes";\nimport VaultPathInput from "@/components/VaultPathInput";'
)

# 3. Add VaultPathInput to TemplateSettingsAside
old_template = '''          <p className="text-[11px] text-slate-400 mt-1.5">
            Leave blank to fall back to <code className="bg-slate-100 px-1 rounded">{"{asset_id}_{submitter_name}_{datetime}"}</code>. Missing placeholders collapse silently.
          </p>
        </div>
      </div>
    </aside>'''
new_template = '''          <p className="text-[11px] text-slate-400 mt-1.5">
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
    </aside>'''
content = content.replace(old_template, new_template)

# 4. Add No Border toggle for checkboxes
old_checkbox = '''        {field.type === "checkbox" && (
          <label className="flex items-center gap-2 mt-2 cursor-pointer">
            <Switch checked={field.allow_multiple} onCheckedChange={(v) => update({ allow_multiple: v })} />
            <span className="text-xs text-slate-600">Allow multiple selections</span>
          </label>
        )}'''
new_checkbox = '''        {field.type === "checkbox" && (
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
        )}'''
content = content.replace(old_checkbox, new_checkbox)

# 5. Replace font_family in PdfAppearanceTab
old_font = '''          <label className="text-xs text-slate-500">Family
            <Input value={field.font_family || "Helvetica"} onChange={setVal("font_family")} className="mt-1 h-8"/>
          </label>
        </div>'''
new_font = '''          <label className="text-xs text-slate-500">Family
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
        </div>'''
content = content.replace(old_font, new_font)

# 6. Replace alignment and add it to Bulk
old_align = '''        <div className="grid grid-cols-2 gap-2 mt-2">
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
        </div>'''
content = content.replace(old_align, old_align) # Keep as is, it's correct

# 7. Bulk Font
old_bulk_font = '''      <div>
        <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-2">Font</div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-slate-500">Size (pt)
            <Input type="number" step="1" min="6" value={f0.font_size ?? 12} onChange={setNum("font_size")} className="mt-1 h-8"/>
          </label>
          <label className="text-xs text-slate-500">Color
            <input type="color" value={f0.font_color || "#111827"} onChange={setVal("font_color")} className="mt-1 h-8 w-full border border-slate-200 rounded"/>
          </label>
        </div>
      </div>'''
new_bulk_font = '''      <div>
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
      </div>'''
content = content.replace(old_bulk_font, new_bulk_font)

# 8. Alignments for bulk
old_bulk_align = '''      <div>
        <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-2">Bulk Size Override</div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-slate-500">Set Width<Input type="number" step="0.01" placeholder="e.g. 0.2" onChange={setNum("width")} className="mt-1 h-8"/></label>
          <label className="text-xs text-slate-500">Set Height<Input type="number" step="0.01" placeholder="e.g. 0.04" onChange={setNum("height")} className="mt-1 h-8"/></label>
        </div>
      </div>'''
new_bulk_align = '''      <div>
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
      </div>'''
content = content.replace(old_bulk_align, new_bulk_align)

with open('frontend/src/components/pdfbuilder/PdfProperties.jsx', 'w', encoding='utf-8') as f: f.write(content)
