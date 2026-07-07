/**
 * FormForge — Properties Panel (tabbed)
 *
 * Tabs:
 *   General      — label, placeholder, description, required, read-only
 *   Data Source  — manual list / Site Management / Vendors / Master Data /
 *                  REST API / JSON / CSV / Excel / Another Form / SQL /
 *                  Workflow Variable / Logged-in User|Vendor
 *   Lookup       — auto-fill this field from a trigger field's source row
 *   Formula      — Excel-like expression evaluated on every value change
 *   Validation   — min/max/regex/maxLength
 *   Advanced     — hidden, default value, include-in-PDF
 *
 * Every field can have a Data Source, Lookup, and/or Formula — the Form
 * Runner combines them in this precedence:
 *     manual options → data source options → lookup overwrite → formula overwrite
 */
import React, { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, X, Settings2, Sigma, Database, Layers, Calculator, AlertTriangle, Sparkles } from "lucide-react";
import { api } from "@/lib/api";

const TYPES_WITH_PLACEHOLDER = ["short_text", "long_text", "number", "email", "phone", "url"];
const TYPES_WITH_OPTIONS = ["dropdown", "checkbox", "radio"];
const TYPES_DISPLAY = ["heading", "paragraph", "divider"];
const SELECTABLE_TYPES = ["dropdown", "checkbox", "radio"];

const DATA_SOURCE_KINDS = [
  { value: "manual",            label: "Manual list (default)" },
  { value: "sites",             label: "Site Management" },
  { value: "vendors",           label: "Vendor Management" },
  { value: "master_data",       label: "Master Data Tables" },
  { value: "rest_api",          label: "REST API" },
  { value: "json",              label: "JSON (inline)" },
  { value: "csv",               label: "CSV (inline)" },
  { value: "excel",             label: "Excel Import" },
  { value: "sql",               label: "SQL Query (PostgreSQL)" },
  { value: "another_form",      label: "Another Form" },
  { value: "workflow_variable", label: "Workflow Variable" },
  { value: "logged_in_user",    label: "Logged-in User" },
  { value: "logged_in_vendor",  label: "Logged-in Vendor" },
];

const MASTER_TABLES = [
  { value: "master:customers",   label: "Customers" },
  { value: "master:regions",     label: "Regions" },
  { value: "master:states",      label: "States" },
  { value: "master:departments", label: "Departments" },
  { value: "master:products",    label: "Products" },
  { value: "master:categories",  label: "Categories" },
];

export default function PropertiesPanel({ form, selectedId, onUpdate }) {
  const field = (form.fields || []).find((f) => f.id === selectedId);
  const update = (patch) => {
    onUpdate({ ...form, fields: form.fields.map((f) => f.id === selectedId ? { ...f, ...patch } : f) });
  };
  if (!field) return <EmptyPropertiesAside />;
  return (
    <aside className="w-96 shrink-0 border-l border-slate-200 bg-white overflow-hidden flex flex-col" data-testid="properties-panel">
      <FieldPropertiesTabs field={field} formFields={form.fields || []} onChange={update} />
    </aside>
  );
}

export function EmptyPropertiesAside() {
  return (
    <aside className="w-80 shrink-0 border-l border-slate-200 bg-white overflow-y-auto nice-scroll">
      <div className="p-6">
        <div className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500 mb-2">Properties</div>
        <div className="flex flex-col items-center justify-center text-center py-12">
          <div className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center mb-3">
            <Settings2 className="w-5 h-5" />
          </div>
          <p className="text-sm text-slate-500">Select a field to edit its properties.</p>
        </div>
      </div>
    </aside>
  );
}

/**
 * The complete tabbed field-properties body — reused by the PDF builder so
 * its properties panel is byte-identical to the standard Form Builder.
 *
 * Props:
 *   field       — the field object (must have id, type, ...)
 *   formFields  — array of sibling fields (used by Lookup/Formula browsers)
 *   onChange    — (patch) => void; merged into the current field
 *   extras      — optional React node inserted as an additional tab
 *   extrasTab   — { key, label, icon } for the extras trigger (optional)
 */
export function FieldPropertiesTabs({ field, formFields = [], onChange, extras = null, extrasTab = null }) {
  const update = (patch) => onChange(patch);
  const isDisplay = TYPES_DISPLAY.includes(field.type);
  const canHaveDataSource = SELECTABLE_TYPES.includes(field.type) || field.type === "short_text";
  const canHaveValue = !["heading", "paragraph", "divider", "file"].includes(field.type);
  return (
    <>
      <div className="px-5 pt-5">
        <div className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Properties</div>
        <div className="text-sm text-slate-400 mt-1 capitalize">{field.type.replace(/_/g, " ")}</div>
      </div>

      <Tabs defaultValue="general" className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="w-full justify-start rounded-none border-b border-slate-200 bg-white px-3 h-auto py-2 gap-0 mt-3 overflow-x-auto">
          <TabsTrigger value="general"     data-testid="tab-general"    className="text-xs px-2.5 py-1.5"><Settings2 className="w-3 h-3 mr-1.5" /> General</TabsTrigger>
          {canHaveDataSource && (
            <TabsTrigger value="datasource" data-testid="tab-datasource" className="text-xs px-2.5 py-1.5"><Database className="w-3 h-3 mr-1.5" /> Data</TabsTrigger>
          )}
          {canHaveValue && (
            <TabsTrigger value="lookup"     data-testid="tab-lookup"     className="text-xs px-2.5 py-1.5"><Layers className="w-3 h-3 mr-1.5" /> Lookup</TabsTrigger>
          )}
          {canHaveValue && (
            <TabsTrigger value="formula"    data-testid="tab-formula"    className="text-xs px-2.5 py-1.5"><Calculator className="w-3 h-3 mr-1.5" /> Formula</TabsTrigger>
          )}
          <TabsTrigger value="validation"  data-testid="tab-validation"  className="text-xs px-2.5 py-1.5"><AlertTriangle className="w-3 h-3 mr-1.5" /> Validation</TabsTrigger>
          <TabsTrigger value="advanced"    data-testid="tab-advanced"    className="text-xs px-2.5 py-1.5"><Sparkles className="w-3 h-3 mr-1.5" /> Adv</TabsTrigger>
          {extrasTab && (
            <TabsTrigger value={extrasTab.key} data-testid={`tab-${extrasTab.key}`} className="text-xs px-2.5 py-1.5">
              {extrasTab.icon}{extrasTab.label}
            </TabsTrigger>
          )}
        </TabsList>

        <div className="flex-1 overflow-y-auto nice-scroll">
          <TabsContent value="general" className="p-5 space-y-4 m-0">
            <GeneralTab field={field} update={update} isDisplay={isDisplay} />
          </TabsContent>
          {canHaveDataSource && (
            <TabsContent value="datasource" className="p-5 space-y-4 m-0">
              <DataSourceTab field={field} update={update} formFields={formFields} />
            </TabsContent>
          )}
          {canHaveValue && (
            <TabsContent value="lookup" className="p-5 space-y-4 m-0">
              <LookupTab field={field} update={update} formFields={formFields} />
            </TabsContent>
          )}
          {canHaveValue && (
            <TabsContent value="formula" className="p-5 space-y-4 m-0">
              <FormulaTab field={field} update={update} formFields={formFields} />
            </TabsContent>
          )}
          <TabsContent value="validation" className="p-5 space-y-4 m-0">
            <ValidationTab field={field} update={update} />
          </TabsContent>
          <TabsContent value="advanced" className="p-5 space-y-4 m-0">
            <AdvancedTab field={field} update={update} />
          </TabsContent>
          {extrasTab && extras && (
            <TabsContent value={extrasTab.key} className="p-5 space-y-4 m-0">
              {extras}
            </TabsContent>
          )}
        </div>
      </Tabs>
    </>
  );
}

// ============================== GENERAL ==============================

function GeneralTab({ field, update, isDisplay }) {
  return (
    <>
      <div>
        <Label className="text-xs">Field ID</Label>
        <Input value={field.id} onChange={(e) => update({ id: e.target.value })} className="mt-1 font-mono text-xs" data-testid="prop-field-id" />
        <div className="text-[11px] text-slate-500 mt-1">
          Formula reference: <code className="text-emerald-700">{`{{${field.id}}}`}</code>
        </div>
      </div>
      {isDisplay && field.type !== "divider" && (
        <div>
          <Label className="text-xs">Text</Label>
          <Textarea rows={3} value={field.rich_text || ""} onChange={(e) => update({ rich_text: e.target.value })} data-testid="prop-rich-text" />
        </div>
      )}
      {!isDisplay && (
        <>
          <div>
            <Label className="text-xs">Label</Label>
            <Input value={field.label} onChange={(e) => update({ label: e.target.value })} data-testid="prop-label" />
          </div>
          {TYPES_WITH_PLACEHOLDER.includes(field.type) && (
            <div>
              <Label className="text-xs">Placeholder</Label>
              <Input value={field.placeholder || ""} onChange={(e) => update({ placeholder: e.target.value })} data-testid="prop-placeholder" />
            </div>
          )}
          <div>
            <Label className="text-xs">Description</Label>
            <Textarea rows={2} value={field.description || ""} onChange={(e) => update({ description: e.target.value })} data-testid="prop-description" />
          </div>
          {TYPES_WITH_OPTIONS.includes(field.type) && (field.data_source?.kind ?? "manual") === "manual" && (
            <OptionsEditor field={field} update={update} />
          )}
          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <div>
              <div className="text-sm font-medium text-slate-700">Required</div>
              <div className="text-xs text-slate-400">User must fill this field</div>
            </div>
            <Switch checked={!!field.required} onCheckedChange={(v) => update({ required: v })} data-testid="prop-required" />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-slate-700">Read-only</div>
              <div className="text-xs text-slate-400">Cannot be edited</div>
            </div>
            <Switch checked={!!field.read_only} onCheckedChange={(v) => update({ read_only: v })} data-testid="prop-readonly" />
          </div>
        </>
      )}
    </>
  );
}

function OptionsEditor({ field, update }) {
  return (
    <div>
      <Label className="text-xs">Options</Label>
      <div className="space-y-2 mt-1">
        {(field.options || []).map((opt, i) => (
          <div key={i} className="flex gap-2">
            <Input value={opt} onChange={(e) => {
              const next = [...field.options]; next[i] = e.target.value; update({ options: next });
            }} />
            <Button type="button" variant="outline" size="icon" onClick={() => {
              update({ options: field.options.filter((_, j) => j !== i) });
            }}><X className="w-4 h-4" /></Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => {
          update({ options: [...(field.options || []), `Option ${(field.options?.length || 0) + 1}`] });
        }} data-testid="add-option">
          <Plus className="w-3.5 h-3.5 mr-1" /> Add option
        </Button>
      </div>
    </div>
  );
}

// ============================ DATA SOURCE ============================

function DataSourceTab({ field, update, formFields }) {
  // Migrate legacy { kind: 'lookup', source: 'sites' } to flat type
  const initial = field.data_source || {};
  const initialType = initial.type
    ?? (initial.kind === "lookup" ? (initial.source?.startsWith("master:") ? "master_data" : (initial.source || "manual"))
                                  : (initial.kind || "manual"));
  const ds = { ...initial, type: initialType };
  const set = (patch) => update({ data_source: { ...ds, ...patch, kind: "lookup" } }); // keep legacy kind for runtime
  const setType = (t) => update({ data_source: { type: t, kind: t === "manual" ? "manual" : "lookup", source: legacySource(t, ds) } });

  // Load columns for master/site/vendor sources
  const [columns, setColumns] = useState([]);
  useEffect(() => {
    let src = null;
    if (ds.type === "sites") src = "sites";
    else if (ds.type === "vendors") src = "vendors";
    else if (ds.type === "master_data" && ds.table) src = `master:${ds.table.replace(/^master:/, "")}`;
    if (!src) { setColumns([]); return; }
    api.get(`/lookup/columns?source=${encodeURIComponent(src)}`)
      .then((r) => setColumns(r.data || []))
      .catch(() => setColumns([]));
  }, [ds.type, ds.table]);

  return (
    <>
      <div>
        <Label className="text-xs">Source Type</Label>
        <select
          value={ds.type}
          onChange={(e) => setType(e.target.value)}
          className="w-full h-9 border border-slate-200 rounded-md px-2 text-sm mt-1"
          data-testid="ds-type"
        >
          {DATA_SOURCE_KINDS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {ds.type === "manual" && (
        <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded p-3">
          Use the <strong>Options</strong> list under the General tab to define values manually.
        </div>
      )}

      {(ds.type === "sites" || ds.type === "vendors" || ds.type === "master_data") && (
        <>
          {ds.type === "master_data" && (
            <div>
              <Label className="text-xs">Master Data Table</Label>
              <select
                value={ds.table || ""}
                onChange={(e) => set({ table: e.target.value, source: `master:${e.target.value}` })}
                className="w-full h-9 border border-slate-200 rounded-md px-2 text-sm mt-1"
                data-testid="ds-master-table"
              >
                <option value="">— choose table —</option>
                {MASTER_TABLES.map((m) => <option key={m.value} value={m.value.replace("master:", "")}>{m.label}</option>)}
              </select>
            </div>
          )}
          {columns.length > 0 && (
            <>
              <div>
                <Label className="text-xs">Display Column (shown in dropdown)</Label>
                <select value={ds.display || ""} onChange={(e) => set({ display: e.target.value })}
                  className="w-full h-9 border border-slate-200 rounded-md px-2 text-sm mt-1" data-testid="ds-display">
                  <option value="">— choose column —</option>
                  {columns.map((c) => <option key={c.key} value={c.key}>{c.label || c.key}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">Stored Value Column</Label>
                <select value={ds.return || ds.display || ""} onChange={(e) => set({ return: e.target.value })}
                  className="w-full h-9 border border-slate-200 rounded-md px-2 text-sm mt-1" data-testid="ds-return">
                  <option value="">(same as display)</option>
                  {columns.map((c) => <option key={c.key} value={c.key}>{c.label || c.key}</option>)}
                </select>
              </div>
              <FillEditor ds={ds} set={set} columns={columns} formFields={formFields} fieldId={field.id} />
              {ds.type === "sites" && (
                <label className="flex items-center gap-2 text-xs mt-2 cursor-pointer">
                  <input type="checkbox" checked={!!ds.show_all_sites}
                    onChange={(e) => set({ show_all_sites: e.target.checked })} data-testid="ds-show-all-sites" />
                  <span><span className="font-medium text-slate-700">Show all sites</span>
                    <span className="text-slate-500"> — bypass vendor filter (admin only).</span></span>
                </label>
              )}
            </>
          )}
        </>
      )}

      {ds.type === "rest_api" && (
        <>
          <div>
            <Label className="text-xs">URL</Label>
            <Input className="mt-1 font-mono text-xs" value={ds.url || ""} onChange={(e) => set({ url: e.target.value })} placeholder="https://api.example.com/items" data-testid="ds-rest-url"/>
          </div>
          <div>
            <Label className="text-xs">JSON Path (e.g. data.items)</Label>
            <Input className="mt-1 font-mono text-xs" value={ds.json_path || ""} onChange={(e) => set({ json_path: e.target.value })} />
          </div>
          <ColumnInputs ds={ds} set={set} />
          <RestApiPreview ds={ds} />
        </>
      )}

      {ds.type === "json" && (
        <>
          <Label className="text-xs">JSON Array</Label>
          <Textarea className="mt-1 font-mono text-xs" rows={6}
            value={ds.json_text || ""} onChange={(e) => set({ json_text: e.target.value })}
            placeholder='[{"value":"A","label":"Alpha"}, ...]' data-testid="ds-json-text"/>
          <ColumnInputs ds={ds} set={set} optional />
        </>
      )}

      {ds.type === "csv" && (
        <>
          <Label className="text-xs">CSV (first row = headers)</Label>
          <Textarea className="mt-1 font-mono text-xs" rows={6}
            value={ds.csv_text || ""} onChange={(e) => set({ csv_text: e.target.value })}
            data-testid="ds-csv-text" />
          <ColumnInputs ds={ds} set={set} />
        </>
      )}

      {ds.type === "excel" && (
        <ExcelImport ds={ds} set={set} />
      )}

      {ds.type === "another_form" && (
        <AnotherFormSelector ds={ds} set={set} />
      )}

      {ds.type === "logged_in_user" && (
        <div className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded p-3">
          The currently logged-in user's identity will be used as the option at runtime.
        </div>
      )}
      {ds.type === "logged_in_vendor" && (
        <div className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded p-3">
          The logged-in vendor's record will be used as the option at runtime.
        </div>
      )}

      {ds.type === "workflow_variable" && (
        <div>
          <Label className="text-xs">Variable Name</Label>
          <Input className="mt-1 font-mono text-xs" value={ds.variable || ""} onChange={(e) => set({ variable: e.target.value })} placeholder="e.g. approval_path" data-testid="ds-workflow-var"/>
          <div className="text-[11px] text-slate-500 mt-1">Resolved from the workflow execution context at runtime.</div>
        </div>
      )}

      {ds.type === "sql" && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded p-3">
          SQL data sources require a connected PostgreSQL instance (not enabled in this build). Use Master Data or REST API instead.
        </div>
      )}
    </>
  );
}

function legacySource(type, ds) {
  if (type === "sites") return "sites";
  if (type === "vendors") return "vendors";
  if (type === "master_data") return ds?.table ? `master:${ds.table.replace(/^master:/, "")}` : "";
  if (type === "logged_in_user") return "logged_in_user";
  if (type === "logged_in_vendor") return "logged_in_vendor";
  return undefined;
}

function ColumnInputs({ ds, set, optional }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <Label className="text-xs">Display Col {optional ? "(opt)" : ""}</Label>
        <Input className="mt-1 font-mono text-xs" value={ds.display_column || ds.display || ""}
          onChange={(e) => set({ display_column: e.target.value, display: e.target.value })} />
      </div>
      <div>
        <Label className="text-xs">Value Col</Label>
        <Input className="mt-1 font-mono text-xs" value={ds.value_column || ds.return || ""}
          onChange={(e) => set({ value_column: e.target.value, return: e.target.value })} />
      </div>
    </div>
  );
}

function FillEditor({ ds, set, columns, formFields, fieldId }) {
  const otherFields = formFields.filter((f) => f.id !== fieldId && !TYPES_DISPLAY.includes(f.type));
  if (otherFields.length === 0) return null;
  return (
    <div>
      <Label className="text-xs">Auto-fill other fields on selection</Label>
      <div className="mt-1 max-h-44 overflow-y-auto border border-slate-100 rounded-md p-2 space-y-1">
        {otherFields.map((other) => {
          const target = (ds.fill || []).find((m) => m.field_id === other.id);
          return (
            <div key={other.id} className="flex items-center gap-1.5 text-xs">
              <span className="flex-1 truncate text-slate-700">{other.label || other.id}</span>
              <select
                value={target?.column || ""}
                onChange={(e) => {
                  const arr = (ds.fill || []).filter((m) => m.field_id !== other.id);
                  if (e.target.value) arr.push({ field_id: other.id, column: e.target.value });
                  set({ fill: arr });
                }}
                className="h-7 border border-slate-200 rounded text-xs px-1"
                data-testid={`ds-fill-${other.id}`}
              >
                <option value="">—</option>
                {columns.map((c) => <option key={c.key} value={c.key}>{c.label || c.key}</option>)}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RestApiPreview({ ds }) {
  const [preview, setPreview] = useState(null);
  const test = async () => {
    try {
      const r = await api.post("/data-source/resolve", { type: "rest_api", ...ds });
      setPreview({ ok: true, items: r.data.items?.slice(0, 5) || [] });
    } catch (e) {
      setPreview({ ok: false, error: e.response?.data?.detail || e.message });
    }
  };
  return (
    <div>
      <Button type="button" size="sm" variant="outline" onClick={test} data-testid="ds-rest-preview">Test request</Button>
      {preview && (
        <div className="text-xs mt-2">
          {preview.ok
            ? <div className="bg-green-50 border border-green-100 rounded p-2">Fetched {preview.items.length} sample items</div>
            : <div className="bg-red-50 border border-red-100 rounded p-2 text-red-700">{String(preview.error)}</div>}
        </div>
      )}
    </div>
  );
}

function ExcelImport({ ds, set }) {
  const [busy, setBusy] = useState(false);
  const upload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const fd = new FormData(); fd.append("file", file);
    setBusy(true);
    try {
      const r = await api.post("/data-source/excel-upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      set({ columns: r.data.columns, rows: r.data.rows });
    } catch (err) {
      alert(err.response?.data?.detail || "Upload failed");
    } finally { setBusy(false); }
  };
  return (
    <>
      <Label className="text-xs">Upload .xlsx</Label>
      <input type="file" accept=".xlsx" onChange={upload} disabled={busy} className="block mt-1 text-xs" data-testid="ds-excel-upload"/>
      {ds.rows?.length > 0 && (
        <>
          <div className="text-xs text-green-700 bg-green-50 border border-green-100 rounded p-2 mt-2">
            Loaded {ds.rows.length} rows • {ds.columns?.length || 0} columns
          </div>
          <ColumnInputs ds={ds} set={set}/>
        </>
      )}
    </>
  );
}

function AnotherFormSelector({ ds, set }) {
  const [forms, setForms] = useState([]);
  useEffect(() => { api.get("/forms").then((r) => setForms(r.data || [])).catch(() => {}); }, []);
  const f = forms.find((x) => x.form_id === ds.form_id);
  const cols = (f?.fields || []).filter((x) => !TYPES_DISPLAY.includes(x.type)).map((x) => x.id);
  return (
    <>
      <div>
        <Label className="text-xs">Form</Label>
        <select value={ds.form_id || ""} onChange={(e) => set({ form_id: e.target.value })}
          className="w-full h-9 border border-slate-200 rounded-md px-2 text-sm mt-1" data-testid="ds-another-form">
          <option value="">— choose form —</option>
          {forms.map((x) => <option key={x.form_id} value={x.form_id}>{x.title}</option>)}
        </select>
      </div>
      <div>
        <Label className="text-xs">Field</Label>
        <select value={ds.column || ""} onChange={(e) => set({ column: e.target.value })}
          className="w-full h-9 border border-slate-200 rounded-md px-2 text-sm mt-1">
          <option value="">— choose field —</option>
          {cols.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
    </>
  );
}

// ============================== LOOKUP ==============================

function LookupTab({ field, update, formFields }) {
  const lk = field.lookup || { enabled: false };
  const set = (patch) => update({ lookup: { ...lk, ...patch } });
  const trigger = formFields.find((f) => f.id === lk.trigger_field_id);
  const trigSource = trigger?.data_source?.source || trigger?.data_source?.type;
  const sourceKey = trigSource === "sites" || trigSource === "site_management" ? "sites"
                  : trigSource === "vendors" || trigSource === "vendor_management" ? "vendors"
                  : trigSource?.startsWith("master") ? trigSource
                  : null;
  const [columns, setColumns] = useState([]);
  useEffect(() => {
    if (!sourceKey) return;
    api.get(`/lookup/columns?source=${encodeURIComponent(sourceKey)}`).then((r) => setColumns(r.data || [])).catch(() => setColumns([]));
  }, [sourceKey]);

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-slate-700">Enable Lookup</div>
          <div className="text-xs text-slate-400">Auto-fill this field from another field's source row</div>
        </div>
        <Switch checked={!!lk.enabled} onCheckedChange={(v) => set({ enabled: v })} data-testid="lk-enabled" />
      </div>

      {lk.enabled && (
        <>
          <div>
            <Label className="text-xs">Trigger Field (a dropdown bound to a data source)</Label>
            <select value={lk.trigger_field_id || ""} onChange={(e) => set({ trigger_field_id: e.target.value })}
              className="w-full h-9 border border-slate-200 rounded-md px-2 text-sm mt-1" data-testid="lk-trigger">
              <option value="">— choose field —</option>
              {formFields
                .filter((f) => f.id !== field.id && (f.data_source?.kind === "lookup" || ["sites", "vendors", "master_data"].includes(f.data_source?.type)))
                .map((f) => <option key={f.id} value={f.id}>{f.label || f.id}</option>)}
            </select>
            {!trigger && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded p-2 mt-2">
                Bind a Dropdown/Radio/Checkbox field to a Data Source (Site Management, Vendors or Master Data), then choose it here.
              </p>
            )}
          </div>

          {trigger && (
            <>
              <div>
                <Label className="text-xs">Return Column</Label>
                <select value={lk.return_column || ""} onChange={(e) => set({ return_column: e.target.value })}
                  className="w-full h-9 border border-slate-200 rounded-md px-2 text-sm mt-1" data-testid="lk-return">
                  <option value="">— choose column —</option>
                  {columns.map((c) => <option key={c.key} value={c.key}>{c.label || c.key}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">If No Match</Label>
                <select value={lk.not_found || "empty"} onChange={(e) => set({ not_found: e.target.value })}
                  className="w-full h-9 border border-slate-200 rounded-md px-2 text-sm mt-1" data-testid="lk-not-found">
                  <option value="empty">Return empty</option>
                  <option value="keep">Keep existing value</option>
                  <option value="default">Use default value</option>
                  <option value="error">Display error message</option>
                </select>
              </div>
              {lk.not_found === "default" && (
                <div>
                  <Label className="text-xs">Default Value</Label>
                  <Input className="mt-1" value={lk.default_value || ""} onChange={(e) => set({ default_value: e.target.value })} data-testid="lk-default" />
                </div>
              )}
              <div>
                <Label className="text-xs">If Multiple Matches</Label>
                <select value={lk.multiple_match || "first"} onChange={(e) => set({ multiple_match: e.target.value })}
                  className="w-full h-9 border border-slate-200 rounded-md px-2 text-sm mt-1">
                  <option value="first">Use first match</option>
                  <option value="last">Use latest match</option>
                  <option value="all">Return all</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={lk.read_only !== false} onChange={(e) => set({ read_only: e.target.checked })} data-testid="lk-readonly" />
                <span className="text-slate-600">Read-only (users can't edit the looked-up value)</span>
              </label>
            </>
          )}
        </>
      )}
    </>
  );
}

// ============================== FORMULA ==============================

function FormulaTab({ field, update, formFields }) {
  const fm = field.formula || { enabled: false, expression: "" };
  const set = (patch) => update({ formula: { ...fm, ...patch } });
  const [validation, setValidation] = useState(null);
  const [functions, setFunctions] = useState({});
  const [preview, setPreview] = useState(null);

  useEffect(() => { api.get("/formula/functions").then((r) => setFunctions(r.data.categories || {})); }, []);

  useEffect(() => {
    if (!fm.expression) { setValidation(null); return; }
    const t = setTimeout(() => {
      api.post("/formula/validate", { expression: fm.expression })
        .then((r) => setValidation(r.data))
        .catch((e) => setValidation({ valid: false, error: e.message }));
    }, 350);
    return () => clearTimeout(t);
  }, [fm.expression]);

  const insert = (txt) => set({ expression: (fm.expression || "") + txt });

  const test = async () => {
    const sample = {};
    (formFields || []).forEach((f) => {
      if (f.type === "number") sample[f.id] = 100;
      else sample[f.id] = "Solaris Alpha";
    });
    try {
      const r = await api.post("/formula/evaluate", {
        expression: fm.expression,
        values: sample,
        auto_load_tables: /\b(SiteMaster|Sites)\b/.test(fm.expression || "") ? ["SiteMaster"] : [],
      });
      setPreview(r.data);
    } catch (e) {
      setPreview({ ok: false, error: e.message });
    }
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-slate-700 flex items-center gap-1.5"><Sigma className="w-3.5 h-3.5"/> Enable Formula</div>
          <div className="text-xs text-slate-400">Auto-calculate this field's value</div>
        </div>
        <Switch checked={!!fm.enabled} onCheckedChange={(v) => set({ enabled: v })} data-testid="fm-enabled" />
      </div>

      {fm.enabled && (
        <>
          <div>
            <Label className="text-xs">Expression</Label>
            <Textarea className="mt-1 font-mono text-sm leading-relaxed" rows={5}
              value={fm.expression || ""} onChange={(e) => set({ expression: e.target.value })}
              placeholder='e.g. ROUND({{dc_capacity}} / {{ac_capacity}}, 3)'
              data-testid="fm-expression" />
            <div className="flex items-center gap-2 mt-1.5">
              {validation?.valid === true && <span className="text-[11px] text-green-700 bg-green-50 border border-green-100 rounded px-2 py-0.5">Valid</span>}
              {validation?.valid === false && <span className="text-[11px] text-red-700 bg-red-50 border border-red-100 rounded px-2 py-0.5" data-testid="fm-error">{validation.error}</span>}
              <Button type="button" size="sm" variant="outline" onClick={test} data-testid="fm-test">Test</Button>
            </div>
            {preview && (
              <div className="mt-2 text-xs">
                {preview.ok
                  ? <div className="bg-blue-50 border border-blue-100 rounded p-2">Result: <span className="font-mono text-slate-900" data-testid="fm-preview">{String(preview.value)}</span></div>
                  : <div className="bg-red-50 border border-red-100 rounded p-2 text-red-700">{preview.error}</div>}
              </div>
            )}
            {validation?.dependencies?.length > 0 && (
              <div className="text-[11px] text-slate-500 mt-1">
                Depends on: {validation.dependencies.map((d) => <code key={d} className="text-emerald-700 mr-1">{`{{${d}}}`}</code>)}
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 pt-3 space-y-2">
            <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">Field Browser</div>
            <div className="flex flex-wrap gap-1">
              {formFields.filter((f) => f.id !== field.id && !TYPES_DISPLAY.includes(f.type)).map((f) => (
                <button key={f.id} type="button" onClick={() => insert(`{{${f.id}}}`)}
                  data-testid={`fm-field-${f.id}`}
                  className="text-[11px] font-mono px-1.5 py-0.5 border border-emerald-200 text-emerald-700 hover:bg-emerald-50 rounded">
                  {`{{${f.id}}}`}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">Function Browser</div>
            {Object.entries(functions).map(([cat, fns]) => (
              <div key={cat}>
                <div className="text-[10px] uppercase text-slate-400 mb-1">{cat}</div>
                <div className="flex flex-wrap gap-1">
                  {fns.map((fn) => (
                    <button key={fn} type="button" onClick={() => insert(`${fn}()`)}
                      data-testid={`fm-fn-${fn}`}
                      className="text-[11px] font-mono px-1.5 py-0.5 border border-blue-200 text-blue-700 hover:bg-blue-50 rounded">
                      {fn}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

// ============================ VALIDATION ============================

function ValidationTab({ field, update }) {
  if (TYPES_DISPLAY.includes(field.type)) {
    return <div className="text-xs text-slate-500">Display fields don't accept input — validation is not applicable.</div>;
  }
  return (
    <>
      {(field.type === "short_text" || field.type === "long_text") && (
        <div>
          <Label className="text-xs">Max length</Label>
          <Input type="number" className="mt-1" value={field.validation?.maxLength || ""} onChange={(e) => update({
            validation: { ...(field.validation || {}), maxLength: e.target.value ? Number(e.target.value) : undefined }
          })} />
        </div>
      )}
      {field.type === "number" && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Min</Label>
            <Input type="number" className="mt-1" value={field.validation?.min ?? ""} onChange={(e) => update({
              validation: { ...(field.validation || {}), min: e.target.value === "" ? undefined : Number(e.target.value) }
            })} />
          </div>
          <div>
            <Label className="text-xs">Max</Label>
            <Input type="number" className="mt-1" value={field.validation?.max ?? ""} onChange={(e) => update({
              validation: { ...(field.validation || {}), max: e.target.value === "" ? undefined : Number(e.target.value) }
            })} />
          </div>
        </div>
      )}
      <div>
        <Label className="text-xs">Regex Pattern</Label>
        <Input className="mt-1 font-mono text-xs" value={field.validation?.regex || ""} onChange={(e) => update({
          validation: { ...(field.validation || {}), regex: e.target.value }
        })} placeholder="^[A-Z0-9-]+$" />
      </div>
    </>
  );
}

// ============================== ADVANCED ==============================

function AdvancedTab({ field, update }) {
  return (
    <>
      <div className="flex items-center justify-between">
        <div><div className="text-sm font-medium text-slate-700">Hidden</div><div className="text-xs text-slate-400">Hide from form viewers</div></div>
        <Switch checked={!!field.hidden} onCheckedChange={(v) => update({ hidden: v })}/>
      </div>
      <div>
        <Label className="text-xs">Default Value</Label>
        <Input className="mt-1" value={field.default_value ?? ""} onChange={(e) => update({ default_value: e.target.value })}/>
      </div>
      <div className="flex items-center justify-between">
        <div><div className="text-sm font-medium text-slate-700">Include in PDF</div><div className="text-xs text-slate-400">Show this field on generated PDFs</div></div>
        <Switch checked={field.include_in_pdf !== false} onCheckedChange={(v) => update({ include_in_pdf: v })}/>
      </div>
      <div>
        <Label className="text-xs">Width</Label>
        <select value={field.width || "full"} onChange={(e) => update({ width: e.target.value })}
          className="w-full h-9 border border-slate-200 rounded-md px-2 text-sm mt-1">
          <option value="full">Full width</option>
          <option value="half">Half width</option>
        </select>
      </div>
    </>
  );
}
