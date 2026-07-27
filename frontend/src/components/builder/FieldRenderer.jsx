import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Star, Upload, X, FileText } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { SearchableDropdown } from "@/components/ui/SearchableDropdown";

// Renders a single field. `value` and `onChange` enable controlled input.
// `mode` = "preview" | "fill" | "builder-static"
// `onLookupFill` (optional) — called with a {fieldId: value} dict when a
//   lookup-bound dropdown is changed, so the host form can apply auto-fills.
export default function FieldRenderer({ field, value, onChange, mode = "fill", isPublic = false, onLookupFill }) {
  // A field becomes read-only if it has an enabled per-field lookup set to read-only.
  const lookupReadOnly = mode !== "builder-static" && field.lookup?.enabled && field.lookup?.read_only !== false;
  const disabled = mode === "preview" || mode === "builder-static" || field.read_only || lookupReadOnly;
  const required = field.required && field.type !== "heading" && field.type !== "paragraph" && field.type !== "divider";

  const renderLabel = () => (
    <Label className="text-sm font-medium text-slate-800 flex items-center gap-1">
      {field.label}
      {required && <span className="text-red-500">*</span>}
    </Label>
  );

  const renderDesc = () =>
    field.description ? <p className="text-xs text-slate-500">{field.description}</p> : null;

  switch (field.type) {
    case "short_text":
    case "email":
    case "phone":
    case "url":
      return (
        <div className="space-y-1.5">
          {renderLabel()}
          <Input
            type={field.type === "email" ? "email" : field.type === "url" ? "url" : "text"}
            placeholder={field.placeholder || ""}
            value={value || ""}
            disabled={disabled}
            onChange={(e) => onChange?.(e.target.value)}
          />
          {renderDesc()}
        </div>
      );
    case "long_text":
      return (
        <div className="space-y-1.5">
          {renderLabel()}
          <Textarea rows={4} placeholder={field.placeholder || ""} value={value || ""}
            disabled={disabled} onChange={(e) => onChange?.(e.target.value)} />
          {renderDesc()}
        </div>
      );
    case "number":
      return (
        <div className="space-y-1.5">
          {renderLabel()}
          <Input type="number" placeholder={field.placeholder || ""} value={value ?? ""}
            disabled={disabled} onChange={(e) => onChange?.(e.target.value)} />
          {renderDesc()}
        </div>
      );
    case "date":
      return (
        <div className="space-y-1.5">
          {renderLabel()}
          <Input type="date" value={value || ""} disabled={disabled}
            onChange={(e) => onChange?.(e.target.value)} />
          {renderDesc()}
        </div>
      );
    case "time":
      return (
        <div className="space-y-1.5">
          {renderLabel()}
          <Input type="time" value={value || ""} disabled={disabled}
            onChange={(e) => onChange?.(e.target.value)} />
          {renderDesc()}
        </div>
      );
    case "dropdown":
      return <DropdownField field={field} value={value} onChange={onChange} disabled={disabled}
                            renderLabel={renderLabel} renderDesc={renderDesc} onLookupFill={onLookupFill} />;
    case "checkbox": {
      const arr = Array.isArray(value) ? value : [];
      const toggle = (opt) => {
        if (arr.includes(opt)) onChange?.(arr.filter((v) => v !== opt));
        else onChange?.([...arr, opt]);
      };
      return (
        <ChoiceField
          field={field} renderLabel={renderLabel} renderDesc={renderDesc}
          render={(opts) => (
            <div className="space-y-2">
              {opts.map((opt, i) => (
                <label key={i} className="flex items-center gap-2 text-sm text-slate-700">
                  <Checkbox checked={arr.includes(opt)} disabled={disabled} onCheckedChange={() => toggle(opt)} />
                  {opt}
                </label>
              ))}
            </div>
          )}
        />
      );
    }
    case "radio":
      return (
        <ChoiceField
          field={field} renderLabel={renderLabel} renderDesc={renderDesc}
          onLookupFill={onLookupFill}
          render={(opts) => (
            <RadioGroup value={value || ""} onValueChange={async (v) => {
              onChange?.(v);
              // also fire auto-fill if the radio is bound to a data source
              await maybeFireFill(field, v, onLookupFill);
            }} disabled={disabled}>
              {opts.map((opt, i) => (
                <label key={i} className="flex items-center gap-2 text-sm text-slate-700">
                  <RadioGroupItem value={opt} /> {opt}
                </label>
              ))}
            </RadioGroup>
          )}
        />
      );
    case "tick": {
      const checked = value === true || value === "true" || value === 1;
      const tickLabel = field.tick_label || field.placeholder || "Yes";
      return (
        <div className="space-y-1.5">
          {renderLabel()}
          <label
            className={`flex items-center gap-2.5 text-sm select-none ${disabled ? "opacity-60" : "cursor-pointer"}`}
            data-testid={`tick-${field.id}`}
          >
            <Checkbox
              checked={checked}
              disabled={disabled}
              onCheckedChange={(v) => onChange?.(!!v)}
              className="data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
            />
            <span className="text-slate-700">{tickLabel}</span>
          </label>
          {renderDesc()}
        </div>
      );
    }
    case "rating": {
      const v = Number(value || 0);
      return (
        <div className="space-y-1.5">
          {renderLabel()}
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" disabled={disabled}
                onClick={() => onChange?.(n)} className="p-1">
                <Star className={`w-7 h-7 ${n <= v ? "text-amber-400 fill-amber-400" : "text-slate-300"}`} />
              </button>
            ))}
          </div>
          {renderDesc()}
        </div>
      );
    }
    case "file":
      return (
        <FileField field={field} value={value} onChange={onChange} disabled={disabled} isPublic={isPublic}
                   renderLabel={renderLabel} renderDesc={renderDesc} />
      );
    case "heading":
      return <h3 className="text-xl font-heading font-bold tracking-tight text-slate-900 mt-2">{field.rich_text || field.label || "Heading"}</h3>;
    case "paragraph":
      return <p className="text-sm text-slate-600 leading-relaxed">{field.rich_text || field.label}</p>;
    case "divider":
      return <hr className="border-slate-200 my-2" />;
    default:
      return <div className="text-sm text-slate-400">Unknown field: {field.type}</div>;
  }
}

function FileField({ field, value, onChange, disabled, isPublic, renderLabel, renderDesc }) {
  const [busy, setBusy] = useState(false);
  const handleFile = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const fd = new FormData(); fd.append("file", file);
    setBusy(true);
    try {
      const r = await api.post(isPublic ? "/public/upload" : "/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      onChange?.({ file_id: r.data.file_id, filename: r.data.filename, size: r.data.size, content_type: r.data.content_type });
      toast.success("File uploaded");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Upload failed");
    } finally { setBusy(false); }
  };
  return (
    <div className="space-y-1.5">
      {renderLabel()}
      {value?.file_id ? (
        <div className="flex items-center justify-between border border-slate-200 rounded-lg p-3 bg-slate-50">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-slate-500 shrink-0" />
            <span className="text-sm text-slate-700 truncate">{value.filename}</span>
          </div>
          <button type="button" disabled={disabled} onClick={() => onChange?.(null)} className="p-1 hover:bg-slate-100 rounded">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>
      ) : (
        <label className={`flex items-center justify-center gap-2 h-24 border-2 border-dashed border-slate-200 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50/40 transition-colors ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
          <Upload className="w-5 h-5 text-slate-400" />
          <span className="text-sm text-slate-500">{busy ? "Uploading…" : "Click to upload"}</span>
          <input type="file" className="hidden" onChange={handleFile} disabled={disabled || busy} />
        </label>
      )}
      {renderDesc()}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dropdown — static options OR Master Data lookup with auto-fill
// ---------------------------------------------------------------------------

function DropdownField({ field, value, onChange, disabled, renderLabel, renderDesc, onLookupFill }) {
  const ds = field.data_source;
  const isLookup = ds?.kind === "lookup" && ds?.source && ds?.display;
  const [opts, setOpts] = useState(field.options || []);
  // Use the unauthenticated `/public/lookup/*` endpoints in public-fill mode,
  // since anonymous form respondents don't have a JWT.
  const lookupBase = typeof window !== "undefined" && localStorage.getItem("ff_token")
    ? "/lookup" : "/public/lookup";

  React.useEffect(() => {
    if (!isLookup) { setOpts(field.options || []); return; }
    api.get(`${lookupBase}/options?source=${encodeURIComponent(ds.source)}&column=${encodeURIComponent(ds.display)}${ds.show_all_sites ? "&show_all=true" : ""}`)
      .then((r) => setOpts(r.data || []))
      .catch(() => setOpts([]));
  }, [isLookup, ds?.source, ds?.display, ds?.show_all_sites, field.options, lookupBase]);

  const handleChange = async (v) => {
    onChange?.(v);
    if (!isLookup || !onLookupFill || !v) return;
    try {
      const fillCols = (ds.fill || []).map((m) => m.column);
      const r = await api.post(`${lookupBase}/resolve`, {
        source: ds.source, display: ds.display, return: ds.return || ds.display,
        value: v, fill: fillCols,
      });
      if (r.data?.matched) {
        const patch = {};
        for (const m of (ds.fill || [])) {
          if (m.field_id && r.data.fill?.[m.column] !== undefined) {
            patch[m.field_id] = r.data.fill[m.column];
          }
        }
        if (Object.keys(patch).length) onLookupFill(patch);
      }
    } catch (e) {
      // silent — lookup is best-effort
    }
  };

  return (
    <div className="space-y-1.5">
      {renderLabel()}
      <SearchableDropdown
        options={opts}
        value={value || ""}
        onChange={handleChange}
        placeholder={field.placeholder || "Select…"}
        disabled={disabled}
        testId={`dropdown-${field.id}`}
        className="h-10 border-slate-200"
      />
      {renderDesc()}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generic choice field (radio / checkbox) — supports both manual options and
// data-source options. For data-source, options are loaded from /lookup/options
// (uses public endpoint when no JWT is present).
// ---------------------------------------------------------------------------

function ChoiceField({ field, render, renderLabel, renderDesc }) {
  const ds = field.data_source;
  const isLookup = ds?.kind === "lookup" && ds?.source;
  const [opts, setOpts] = useState(field.options || []);
  const lookupBase = typeof window !== "undefined" && localStorage.getItem("ff_token")
    ? "/lookup" : "/public/lookup";

  React.useEffect(() => {
    if (!isLookup) { setOpts(field.options || []); return; }
    const column = ds.display || ds.return;
    if (!column) return;
    api.get(`${lookupBase}/options?source=${encodeURIComponent(ds.source)}&column=${encodeURIComponent(column)}${ds.show_all_sites ? "&show_all=true" : ""}`)
      .then((r) => setOpts(r.data || []))
      .catch(() => setOpts([]));
  }, [isLookup, ds?.source, ds?.display, ds?.return, ds?.show_all_sites, field.options, lookupBase]);

  return (
    <div className="space-y-2">
      {renderLabel()}
      {render(opts)}
      {renderDesc()}
    </div>
  );
}

// Resolve auto-fill values when a data-source-bound field's value changes.
// Called by radio (onValueChange) and dropdown (handleChange).
async function maybeFireFill(field, value, onLookupFill) {
  const ds = field.data_source;
  if (!onLookupFill || !value || ds?.kind !== "lookup" || !ds?.source) return;
  const lookupBase = typeof window !== "undefined" && localStorage.getItem("ff_token")
    ? "/lookup" : "/public/lookup";
  try {
    const fillCols = (ds.fill || []).map((m) => m.column);
    const r = await api.post(`${lookupBase}/resolve`, {
      source: ds.source,
      display: ds.display || ds.return,
      return: ds.return || ds.display,
      value, fill: fillCols,
    });
    if (!r.data?.matched) return;
    const patch = {};
    for (const m of (ds.fill || [])) {
      if (m.field_id && r.data.fill?.[m.column] !== undefined) {
        patch[m.field_id] = r.data.fill[m.column];
      }
    }
    if (Object.keys(patch).length) onLookupFill(patch);
  } catch (_) {
    /* swallow */
  }
}

