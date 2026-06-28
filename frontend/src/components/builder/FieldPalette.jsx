import React from "react";
import { FIELD_TYPES, FIELD_GROUPS } from "@/lib/fieldTypes";
import { useDraggable } from "@dnd-kit/core";

function PaletteItem({ ft }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${ft.type}`,
    data: { source: "palette", fieldType: ft.type },
  });
  const Icon = ft.icon;
  return (
    <button
      ref={setNodeRef}
      data-testid={`palette-${ft.type}`}
      {...attributes}
      {...listeners}
      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:border-blue-400 hover:bg-blue-50/40 text-sm text-slate-700 transition-all ${isDragging ? "opacity-50" : ""}`}
    >
      <Icon className="w-4 h-4 text-blue-600" />
      <span className="text-left">{ft.label}</span>
    </button>
  );
}

export default function FieldPalette({ onQuickAdd }) {
  return (
    <aside className="w-72 shrink-0 border-r border-slate-200 bg-white overflow-y-auto nice-scroll">
      <div className="p-5 border-b border-slate-100">
        <div className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Fields</div>
        <p className="text-xs text-slate-400 mt-1">Drag onto the canvas, or click to add.</p>
      </div>
      <div className="p-5 space-y-6">
        {FIELD_GROUPS.map((g) => (
          <div key={g}>
            <div className="text-xs font-bold uppercase tracking-[0.1em] text-slate-400 mb-2">{g}</div>
            <div className="grid grid-cols-2 gap-2">
              {FIELD_TYPES.filter((f) => f.group === g).map((ft) => (
                <div key={ft.type} onDoubleClick={() => onQuickAdd?.(ft.type)} onClick={() => onQuickAdd?.(ft.type)}>
                  <PaletteItem ft={ft} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
