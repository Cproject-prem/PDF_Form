/**
 * Shared compact panel for **Data Source / Lookup / Formula** configuration.
 *
 * Used inside both the normal Form Builder (PropertiesPanel) and the
 * PDF Form Builder (PdfProperties), so PDF fields get full parity with form
 * fields — dynamic data sources, master-data lookups, and Excel-grade
 * formula expressions.
 */
import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const DATA_SOURCE_KINDS = [
  { v: "manual",            l: "Manual list" },
  { v: "sites",             l: "Site Management" },
  { v: "vendors",           l: "Vendor Management" },
  { v: "master_data",       l: "Master Data Tables" },
  { v: "rest_api",          l: "REST API" },
  { v: "json",              l: "JSON" },
  { v: "csv",               l: "CSV" },
  { v: "excel",             l: "Excel Import" },
  { v: "sql",               l: "SQL Query" },
  { v: "another_form",      l: "Another Form" },
  { v: "workflow_variable", l: "Workflow Variable" },
  { v: "logged_in_user",    l: "Logged-in User" },
  { v: "logged_in_vendor",  l: "Logged-in Vendor" },
];

export default function FieldDataLookupFormulaTabs({ field, formFields = [], onChange }) {
  const [tab, setTab] = useState("data");
  const TABS = [
    { v: "data",    l: "Data Source" },
    { v: "lookup",  l: "Lookup" },
    { v: "formula", l: "Formula" },
  ];
  return (
    <div className="border-t border-slate-100 pt-4 mt-4">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-2">Data binding</div>
      <div className="flex gap-1 mb-3" role="tablist" data-testid="dlf-tabs">
        {TABS.map((t) => (
          <button key={t.v} type="button" onClick={() => setTab(t.v)}
            data-testid={`dlf-tab-${t.v}`}
            className={`text-xs px-2.5 py-1 rounded-md border ${tab === t.v ? "bg-blue-600 text-white border-blue-600" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {t.l}
          </button>
        ))}
      </div>
      {tab === "data"    && <DataSourcePanel field={field} onChange={onChange}/>}
      {tab === "lookup"  && <LookupPanel field={field} formFields={formFields} onChange={onChange}/>}
      {tab === "formula" && <FormulaPanel field={field} formFields={formFields} onChange={onChange}/>}
    </div>
  );
}

function DataSourcePanel({ field, onChange }) {
  const ds = field.data_source || { type: "manual" };
  const set = (patch) => onChange({ data_source: { ...ds, ...patch, kind: patch.type ? (patch.type === "manual" ? "manual" : "lookup") : ds.kind, source: legacySource(patch.type ?? ds.type, { ...ds, ...patch }) } });
  const [columns, setColumns] = useState([]);
  useEffect(() => {
    let src = null;
    if (ds.type === "sites") src = "sites";
    else if (ds.type === "vendors") src = "vendors";
    else if (ds.type === "master_data" && ds.table) src = `master:${ds.table.replace(/^master:/, "")}`;
    if (!src) { setColumns([]); return; }
    api.get(`/lookup/columns?source=${encodeURIComponent(src)}`)
      .then((r) => setColumns(r.data || [])).catch(() => setColumns([]));
  }, [ds.type, ds.table]);

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">Source Type</Label>
        <select value={ds.type || "manual"} onChange={(e) => set({ type: e.target.value })}
          className="w-full h-9 border border-slate-200 rounded-md px-2 text-sm mt-1" data-testid="dlf-ds-type">
          {DATA_SOURCE_KINDS.map((k) => <option key={k.v} value={k.v}>{k.l}</option>)}
        </select>
      </div>
      {(ds.type === "sites" || ds.type === "vendors" || ds.type === "master_data") && columns.length > 0 && (
        <>
          {ds.type === "master_data" && (
            <Input className="text-xs" placeholder="Master table name (e.g. customers)" value={ds.table || ""}
              onChange={(e) => set({ table: e.target.value })} data-testid="dlf-ds-table" />
          )}
          <select value={ds.display || ""} onChange={(e) => set({ display: e.target.value, return: ds.return || e.target.value })}
            className="w-full h-9 border border-slate-200 rounded-md px-2 text-sm mt-1" data-testid="dlf-ds-display">
            <option value="">Display column…</option>
            {columns.map((c) => <option key={c.key} value={c.key}>{c.label || c.key}</option>)}
          </select>
          <select value={ds.return || ""} onChange={(e) => set({ return: e.target.value })}
            className="w-full h-9 border border-slate-200 rounded-md px-2 text-sm" data-testid="dlf-ds-return">
            <option value="">Value column (defaults to display)</option>
            {columns.map((c) => <option key={c.key} value={c.key}>{c.label || c.key}</option>)}
          </select>
        </>
      )}
      {ds.type === "rest_api" && (
        <Input className="text-xs font-mono" placeholder="https://api.example.com/items"
          value={ds.url || ""} onChange={(e) => set({ url: e.target.value })} data-testid="dlf-ds-url" />
      )}
      {ds.type === "json" && (
        <Textarea rows={4} className="text-xs font-mono" placeholder='[{"value":"A","label":"Alpha"}]'
          value={ds.json_text || ""} onChange={(e) => set({ json_text: e.target.value })} data-testid="dlf-ds-json" />
      )}
      {ds.type === "csv" && (
        <Textarea rows={4} className="text-xs font-mono" placeholder="header1,header2&#10;value1,value2"
          value={ds.csv_text || ""} onChange={(e) => set({ csv_text: e.target.value })} data-testid="dlf-ds-csv" />
      )}
      {ds.type === "workflow_variable" && (
        <Input className="text-xs font-mono" placeholder="variable_name"
          value={ds.variable || ""} onChange={(e) => set({ variable: e.target.value })} data-testid="dlf-ds-var" />
      )}
      {(ds.type === "logged_in_user" || ds.type === "logged_in_vendor") && (
        <div className="text-[11px] text-blue-700 bg-blue-50 border border-blue-100 rounded p-2">
          The current user/vendor is the option at runtime.
        </div>
      )}
      {ds.type === "sql" && (
        <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded p-2">
          SQL needs PostgreSQL — use REST API or Master Data instead.
        </div>
      )}
    </div>
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

function LookupPanel({ field, formFields, onChange }) {
  const lk = field.lookup || { enabled: false };
  const set = (patch) => onChange({ lookup: { ...lk, ...patch } });
  const triggers = formFields.filter((f) => f.id !== field.id &&
    (f.data_source?.kind === "lookup" || ["sites", "vendors", "master_data"].includes(f.data_source?.type)));
  const trigger = triggers.find((t) => t.id === lk.trigger_field_id);
  const [columns, setColumns] = useState([]);
  useEffect(() => {
    const src = trigger?.data_source?.source;
    if (!src) { setColumns([]); return; }
    api.get(`/lookup/columns?source=${encodeURIComponent(src)}`)
      .then((r) => setColumns(r.data || [])).catch(() => setColumns([]));
  }, [trigger?.data_source?.source]);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm">Enable Lookup</Label>
        <Switch checked={!!lk.enabled} onCheckedChange={(v) => set({ enabled: v })} data-testid="dlf-lk-enable" />
      </div>
      {lk.enabled && (
        <>
          <select value={lk.trigger_field_id || ""} onChange={(e) => set({ trigger_field_id: e.target.value })}
            className="w-full h-9 border border-slate-200 rounded-md px-2 text-sm" data-testid="dlf-lk-trigger">
            <option value="">Trigger field…</option>
            {triggers.map((t) => <option key={t.id} value={t.id}>{t.label || t.id}</option>)}
          </select>
          {trigger && (
            <select value={lk.return_column || ""} onChange={(e) => set({ return_column: e.target.value })}
              className="w-full h-9 border border-slate-200 rounded-md px-2 text-sm" data-testid="dlf-lk-return">
              <option value="">Return column…</option>
              {columns.map((c) => <option key={c.key} value={c.key}>{c.label || c.key}</option>)}
            </select>
          )}
          <select value={lk.not_found || "empty"} onChange={(e) => set({ not_found: e.target.value })}
            className="w-full h-9 border border-slate-200 rounded-md px-2 text-sm" data-testid="dlf-lk-notfound">
            <option value="empty">If no match: return empty</option>
            <option value="keep">Keep existing value</option>
            <option value="default">Use default value</option>
            <option value="error">Display error</option>
          </select>
        </>
      )}
    </div>
  );
}

function FormulaPanel({ field, formFields, onChange }) {
  const fm = field.formula || { enabled: false, expression: "" };
  const set = (patch) => onChange({ formula: { ...fm, ...patch } });
  const [validation, setValidation] = useState(null);
  useEffect(() => {
    if (!fm.expression) { setValidation(null); return; }
    const t = setTimeout(() => {
      api.post("/formula/validate", { expression: fm.expression })
        .then((r) => setValidation(r.data)).catch((e) => setValidation({ valid: false, error: e.message }));
    }, 350);
    return () => clearTimeout(t);
  }, [fm.expression]);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm">Enable Formula</Label>
        <Switch checked={!!fm.enabled} onCheckedChange={(v) => set({ enabled: v })} data-testid="dlf-fm-enable" />
      </div>
      {fm.enabled && (
        <>
          <Textarea rows={4} className="text-xs font-mono" placeholder="ROUND({{a}}/{{b}}, 2)"
            value={fm.expression || ""} onChange={(e) => set({ expression: e.target.value })}
            data-testid="dlf-fm-expr" />
          {validation?.valid === true && <div className="text-[11px] text-green-700 bg-green-50 border border-green-100 rounded p-1.5">Valid</div>}
          {validation?.valid === false && <div className="text-[11px] text-red-700 bg-red-50 border border-red-100 rounded p-1.5">{validation.error}</div>}
          <div className="flex flex-wrap gap-1">
            {formFields.filter((f) => f.id !== field.id).slice(0, 12).map((f) => (
              <button key={f.id} type="button" onClick={() => set({ expression: (fm.expression || "") + `{{${f.id}}}` })}
                className="text-[11px] font-mono px-1.5 py-0.5 border border-emerald-200 text-emerald-700 hover:bg-emerald-50 rounded">
                {`{{${f.id}}}`}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
