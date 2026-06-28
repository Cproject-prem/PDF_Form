import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, X, Trash2, Copy, ArrowUp, ArrowDown, Lock, Unlock, Eye, EyeOff } from "lucide-react";

export default function PdfProperties({ field, fields, onChange, onDuplicate, onDelete, onZ, onLock, onVisible }) {
  if (!field) {
    return (
      <aside className="w-80 shrink-0 border-l border-slate-200 bg-white overflow-y-auto nice-scroll p-5">
        <div className="text-sm text-slate-500">Select a field on the PDF to edit its properties.</div>
        <div className="mt-4 text-xs text-slate-400 leading-relaxed">
          Tip: drag a field from the left palette onto the PDF. Use arrow keys to nudge,
          hold <kbd className="px-1 py-0.5 border rounded bg-slate-100">Shift</kbd> for 1% steps.
        </div>
      </aside>
    );
  }

  const set = (patch) => onChange(field.id, patch);
  const setVal = (k) => (e) => set({ [k]: e.target.value });
  const setNum = (k) => (e) => set({ [k]: Number(e.target.value) });
  const setBool = (k) => (v) => set({ [k]: !!v });

  const isText = ["short_text", "long_text", "email", "phone", "number", "url"].includes(field.type);
  const isChoice = ["dropdown", "checkbox", "radio"].includes(field.type);
  const isStatic = ["heading", "paragraph", "static_text", "divider"].includes(field.type);

  return (
    <aside className="w-80 shrink-0 border-l border-slate-200 bg-white overflow-y-auto nice-scroll">
      <div className="p-4 border-b border-slate-100 sticky top-0 bg-white z-10 flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">Properties</div>
          <div className="text-sm font-semibold text-slate-900 capitalize">{field.type.replace(/_/g, " ")}</div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" data-testid="prop-zup" onClick={() => onZ(field.id, +1)} title="Bring forward"><ArrowUp className="w-4 h-4" /></Button>
          <Button variant="ghost" size="icon" data-testid="prop-zdown" onClick={() => onZ(field.id, -1)} title="Send backward"><ArrowDown className="w-4 h-4" /></Button>
          <Button variant="ghost" size="icon" data-testid="prop-lock" onClick={() => onLock(field.id)} title="Lock/unlock">
            {field.locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
          </Button>
          <Button variant="ghost" size="icon" data-testid="prop-visible" onClick={() => onVisible(field.id)} title="Show/hide">
            {field.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-4 text-sm">
        <Section title="Identity">
          <FieldRow label="Label">
            <Input data-testid="prop-label" value={field.label} onChange={setVal("label")} />
          </FieldRow>
          <FieldRow label="Name (field key)">
            <Input data-testid="prop-name" value={field.name} onChange={setVal("name")}
                   placeholder="e.g. full_name" />
          </FieldRow>
          <FieldRow label="Database mapping">
            <Input data-testid="prop-db" value={field.db_mapping} onChange={setVal("db_mapping")}
                   placeholder="employees.full_name" />
          </FieldRow>
          {!isStatic && (
            <FieldRow label="Placeholder">
              <Input data-testid="prop-placeholder" value={field.placeholder} onChange={setVal("placeholder")} />
            </FieldRow>
          )}
          {isStatic && (
            <FieldRow label="Text">
              <Textarea data-testid="prop-static" rows={3} value={field.static_text}
                        onChange={setVal("static_text")} />
            </FieldRow>
          )}
          <FieldRow label="Default value">
            <Input data-testid="prop-default" value={field.default_value || ""} onChange={setVal("default_value")} />
          </FieldRow>
        </Section>

        {isChoice && (
          <Section title="Options">
            <OptionsEditor options={field.options} onChange={(opts) => set({ options: opts })} />
          </Section>
        )}

        {!isStatic && (
          <Section title="Behavior">
            <Switcher label="Required" testid="prop-required" checked={field.required} onChange={setBool("required")} />
            <Switcher label="Read only" testid="prop-readonly" checked={field.read_only} onChange={setBool("read_only")} />
            <FieldRow label="Validation regex">
              <Input data-testid="prop-regex" value={field.validation?.regex || ""}
                     onChange={(e) => set({ validation: { ...(field.validation || {}), regex: e.target.value } })} />
            </FieldRow>
            <div className="grid grid-cols-2 gap-2">
              <FieldRow label="Min length">
                <Input type="number" data-testid="prop-min" value={field.validation?.min_length ?? ""}
                       onChange={(e) => set({ validation: { ...(field.validation || {}), min_length: numOrNull(e.target.value) } })} />
              </FieldRow>
              <FieldRow label="Max length">
                <Input type="number" data-testid="prop-max" value={field.validation?.max_length ?? ""}
                       onChange={(e) => set({ validation: { ...(field.validation || {}), max_length: numOrNull(e.target.value) } })} />
              </FieldRow>
            </div>
            {field.type === "number" && (
              <div className="grid grid-cols-2 gap-2">
                <FieldRow label="Min">
                  <Input type="number" value={field.validation?.min ?? ""}
                         onChange={(e) => set({ validation: { ...(field.validation || {}), min: numOrNull(e.target.value) } })} />
                </FieldRow>
                <FieldRow label="Max">
                  <Input type="number" value={field.validation?.max ?? ""}
                         onChange={(e) => set({ validation: { ...(field.validation || {}), max: numOrNull(e.target.value) } })} />
                </FieldRow>
              </div>
            )}
          </Section>
        )}

        <Section title="Appearance">
          <div className="grid grid-cols-2 gap-2">
            <FieldRow label="Font size">
              <Input type="number" min={6} max={64} value={field.font_size} onChange={setNum("font_size")} />
            </FieldRow>
            <FieldRow label="Font family">
              <Select value={field.font_family} onValueChange={(v) => set({ font_family: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Helvetica", "Times-Roman", "Courier"].map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldRow>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <FieldRow label="Font color">
              <Input type="color" value={field.font_color} onChange={setVal("font_color")} className="h-9 p-1" />
            </FieldRow>
            <FieldRow label="Border">
              <Input type="color" value={field.border_color} onChange={setVal("border_color")} className="h-9 p-1" />
            </FieldRow>
            <FieldRow label="Bg">
              <Input type="color" value={field.background_color} onChange={setVal("background_color")} className="h-9 p-1" />
            </FieldRow>
          </div>
          <FieldRow label={`Opacity (${Math.round((field.opacity ?? 0.4) * 100)}%)`}>
            <input type="range" min="0" max="1" step="0.05" value={field.opacity ?? 0.4}
                   onChange={(e) => set({ opacity: Number(e.target.value) })} className="w-full" />
          </FieldRow>
          <FieldRow label="Alignment">
            <Select value={field.alignment} onValueChange={(v) => set({ alignment: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Left</SelectItem>
                <SelectItem value="center">Center</SelectItem>
                <SelectItem value="right">Right</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
        </Section>

        <Section title="Position & Size">
          <div className="grid grid-cols-2 gap-2">
            <FieldRow label="Page">
              <Input type="number" min={1} value={field.page} onChange={setNum("page")} />
            </FieldRow>
            <FieldRow label="Rotation">
              <Input type="number" value={field.rotation} onChange={setNum("rotation")} />
            </FieldRow>
            <FieldRow label="X (%)">
              <Input type="number" step={0.5} value={Math.round(field.x * 1000) / 10}
                     onChange={(e) => set({ x: Number(e.target.value) / 100 })} />
            </FieldRow>
            <FieldRow label="Y (%)">
              <Input type="number" step={0.5} value={Math.round(field.y * 1000) / 10}
                     onChange={(e) => set({ y: Number(e.target.value) / 100 })} />
            </FieldRow>
            <FieldRow label="Width (%)">
              <Input type="number" step={0.5} value={Math.round(field.width * 1000) / 10}
                     onChange={(e) => set({ width: Number(e.target.value) / 100 })} />
            </FieldRow>
            <FieldRow label="Height (%)">
              <Input type="number" step={0.5} value={Math.round(field.height * 1000) / 10}
                     onChange={(e) => set({ height: Number(e.target.value) / 100 })} />
            </FieldRow>
          </div>
        </Section>

        <Section title="Conditional logic">
          <FieldRow label="Show this field when">
            <Select
              value={field.conditional_logic?.field_id || "__none__"}
              onValueChange={(v) =>
                set({ conditional_logic: v && v !== "__none__"
                  ? { ...(field.conditional_logic || {}), field_id: v, operator: field.conditional_logic?.operator || "equals", value: field.conditional_logic?.value || "" }
                  : null })}
            >
              <SelectTrigger><SelectValue placeholder="(always show)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">(always show)</SelectItem>
                {fields.filter((x) => x.id !== field.id && x.name).map((x) => (
                  <SelectItem key={x.id} value={x.id}>{x.label || x.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>
          {field.conditional_logic?.field_id && (
            <div className="grid grid-cols-2 gap-2">
              <FieldRow label="Operator">
                <Select value={field.conditional_logic?.operator || "equals"}
                        onValueChange={(v) => set({ conditional_logic: { ...field.conditional_logic, operator: v } })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="equals">equals</SelectItem>
                    <SelectItem value="not_equals">not equals</SelectItem>
                    <SelectItem value="contains">contains</SelectItem>
                    <SelectItem value="filled">is filled</SelectItem>
                  </SelectContent>
                </Select>
              </FieldRow>
              <FieldRow label="Value">
                <Input value={field.conditional_logic?.value || ""}
                       onChange={(e) => set({ conditional_logic: { ...field.conditional_logic, value: e.target.value } })} />
              </FieldRow>
            </div>
          )}
        </Section>

        <div className="flex items-center gap-2 pt-2">
          <Button data-testid="prop-duplicate" variant="outline" className="flex-1" onClick={() => onDuplicate(field.id)}>
            <Copy className="w-4 h-4 mr-1.5" /> Duplicate
          </Button>
          <Button data-testid="prop-delete" variant="outline" className="flex-1 text-red-600 hover:bg-red-50"
                  onClick={() => onDelete(field.id)}>
            <Trash2 className="w-4 h-4 mr-1.5" /> Delete
          </Button>
        </div>
      </div>
    </aside>
  );
}

function numOrNull(v) { return v === "" ? null : Number(v); }

function Section({ title, children }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-2">{title}</div>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function FieldRow({ label, children }) {
  return (
    <div>
      <Label className="text-xs text-slate-500">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Switcher({ label, checked, onChange, testid }) {
  return (
    <div className="flex items-center justify-between">
      <Label className="text-sm text-slate-700">{label}</Label>
      <Switch data-testid={testid} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function OptionsEditor({ options, onChange }) {
  const set = (i, v) => { const next = [...options]; next[i] = v; onChange(next); };
  const add = () => onChange([...(options || []), "New option"]);
  const rm = (i) => onChange(options.filter((_, idx) => idx !== i));
  return (
    <div className="space-y-1.5">
      {(options || []).map((o, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input value={o} onChange={(e) => set(i, e.target.value)} />
          <Button variant="ghost" size="icon" onClick={() => rm(i)}><X className="w-4 h-4" /></Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={add}><Plus className="w-3.5 h-3.5 mr-1" /> Add option</Button>
    </div>
  );
}
