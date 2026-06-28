import React, { useMemo, useState } from "react";
import { PDF_FIELD_TYPES, PDF_FIELD_GROUPS } from "@/lib/pdfFieldTypes";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export default function PdfFieldPalette({ onPick }) {
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const filtered = q
      ? PDF_FIELD_TYPES.filter((t) =>
          t.label.toLowerCase().includes(q.toLowerCase()) ||
          t.type.toLowerCase().includes(q.toLowerCase()))
      : PDF_FIELD_TYPES;
    return PDF_FIELD_GROUPS.map((g) => ({
      group: g, items: filtered.filter((t) => t.group === g),
    }));
  }, [q]);

  return (
    <aside className="w-72 shrink-0 border-r border-slate-200 bg-white overflow-y-auto nice-scroll">
      <div className="p-4 border-b border-slate-100 sticky top-0 bg-white z-10">
        <div className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500 mb-2">Field Library</div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <Input data-testid="pdf-palette-search" value={q} onChange={(e) => setQ(e.target.value)}
                 placeholder="Search fields…" className="pl-8 h-8 text-sm" />
        </div>
      </div>
      <div className="p-3 space-y-4">
        {groups.map(({ group, items }) =>
          items.length === 0 ? null : (
            <div key={group}>
              <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-1.5 px-1">{group}</div>
              <div className="grid grid-cols-2 gap-1.5">
                {items.map((it) => {
                  const Icon = it.icon;
                  return (
                    <button
                      key={it.type}
                      data-testid={`pdf-palette-${it.type}`}
                      onClick={() => onPick(it.type)}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/pdf-field-type", it.type);
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      className="flex items-center gap-1.5 px-2 py-2 rounded-lg border border-slate-200 bg-white hover:border-blue-400 hover:bg-blue-50/40 text-[12px] text-slate-700 transition-all"
                    >
                      <Icon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span className="truncate text-left">{it.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
      </div>
    </aside>
  );
}
