import React from "react";
import {
  DndContext, useSensor, useSensors, PointerSensor, closestCenter, useDroppable
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import FieldRenderer from "./FieldRenderer";
import { GripVertical, Copy, Trash2 } from "lucide-react";

function SortableField({ field, selected, onSelect, onDuplicate, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id, data: { source: "canvas", id: field.id }
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={(e) => { e.stopPropagation(); onSelect(field.id); }}
      data-testid={`canvas-field-${field.id}`}
      className={`field-row relative group rounded-xl border ${selected ? "border-blue-500 ring-4 ring-blue-500/10" : "border-transparent hover:border-slate-200"} bg-white p-4 cursor-pointer transition-all ${isDragging ? "opacity-50" : ""}`}
    >
      <div className="absolute left-1 top-1/2 -translate-y-1/2 drag-handle text-slate-400" {...attributes} {...listeners}>
        <GripVertical className="w-4 h-4" />
      </div>
      <div className="pl-4">
        <FieldRenderer field={field} mode="builder-static" />
      </div>
      {selected && (
        <div className="absolute right-2 top-2 flex gap-1">
          <button data-testid={`duplicate-${field.id}`} onClick={(e) => { e.stopPropagation(); onDuplicate(field.id); }} className="p-1.5 rounded-md bg-white border border-slate-200 hover:bg-slate-50">
            <Copy className="w-3.5 h-3.5 text-slate-600" />
          </button>
          <button data-testid={`delete-${field.id}`} onClick={(e) => { e.stopPropagation(); onDelete(field.id); }} className="p-1.5 rounded-md bg-white border border-slate-200 hover:bg-red-50 hover:text-red-600">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

export default function FormCanvas({ form, selectedId, onSelect, onUpdate }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: "canvas-drop" });

  const fields = form.fields || [];

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over) return;
    // dragging from palette
    if (active.data.current?.source === "palette") {
      const newField = makeField(active.data.current.fieldType);
      let idx = fields.length;
      if (over.id !== "canvas-drop") {
        idx = fields.findIndex((f) => f.id === over.id);
        if (idx < 0) idx = fields.length;
      }
      const next = [...fields];
      next.splice(idx, 0, newField);
      onUpdate({ ...form, fields: next });
      onSelect(newField.id);
      return;
    }
    // reorder within canvas
    if (active.id !== over.id) {
      const oldIndex = fields.findIndex((f) => f.id === active.id);
      const newIndex = fields.findIndex((f) => f.id === over.id);
      if (oldIndex >= 0 && newIndex >= 0) onUpdate({ ...form, fields: arrayMove(fields, oldIndex, newIndex) });
    }
  };

  const onDuplicate = (id) => {
    const idx = fields.findIndex((f) => f.id === id);
    if (idx < 0) return;
    const dup = { ...fields[idx], id: `f_${Math.random().toString(36).slice(2, 10)}` };
    const next = [...fields]; next.splice(idx + 1, 0, dup);
    onUpdate({ ...form, fields: next });
    onSelect(dup.id);
  };
  const onDelete = (id) => {
    onUpdate({ ...form, fields: fields.filter((f) => f.id !== id) });
    onSelect(null);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="flex-1 overflow-y-auto bg-slate-50 nice-scroll" onClick={() => onSelect(null)}>
        <div className="max-w-3xl mx-auto my-8 px-4">
          <div className="bg-white rounded-2xl border border-slate-100 card-soft p-8 min-h-[600px]">
            <input
              data-testid="form-title-input"
              value={form.title}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onUpdate({ ...form, title: e.target.value })}
              className="w-full text-3xl font-heading font-bold tracking-tight text-slate-900 outline-none bg-transparent border-0 border-b border-transparent focus:border-blue-200 pb-1 mb-2"
              placeholder="Form title"
            />
            <textarea
              data-testid="form-desc-input"
              value={form.description || ""}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onUpdate({ ...form, description: e.target.value })}
              rows={2}
              className="w-full text-sm text-slate-500 outline-none bg-transparent resize-none border-0 focus:bg-slate-50/60 rounded p-1"
              placeholder="Form description (optional)"
            />
            <div ref={setDropRef} className={`mt-6 space-y-3 rounded-xl p-2 ${isOver ? "bg-blue-50/40 ring-2 ring-blue-300/40" : ""}`}>
              <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                {fields.length === 0 ? (
                  <div className="border-2 border-dashed border-slate-200 rounded-xl text-center py-16 text-sm text-slate-400">
                    Drag fields from the left panel to build your form.
                  </div>
                ) : fields.map((f) => (
                  <SortableField key={f.id} field={f} selected={selectedId === f.id} onSelect={onSelect}
                                 onDuplicate={onDuplicate} onDelete={onDelete} />
                ))}
              </SortableContext>
            </div>
          </div>
        </div>
      </div>
    </DndContext>
  );
}

function makeField(type) {
  const id = `f_${Math.random().toString(36).slice(2, 10)}`;
  const defaults = {
    short_text: { label: "Short Text", placeholder: "" },
    long_text:  { label: "Long Text", placeholder: "" },
    number:     { label: "Number" },
    email:      { label: "Email", placeholder: "you@example.com" },
    phone:      { label: "Phone" },
    date:       { label: "Date" },
    time:       { label: "Time" },
    dropdown:   { label: "Dropdown", options: ["Option A", "Option B"] },
    checkbox:   { label: "Checkbox", options: ["Option A", "Option B"] },
    radio:      { label: "Radio",    options: ["Option A", "Option B"] },
    file:       { label: "Upload File" },
    url:        { label: "Website", placeholder: "https://" },
    rating:     { label: "Rating" },
    heading:    { label: "Heading", rich_text: "Section heading" },
    paragraph:  { label: "Paragraph", rich_text: "Add a paragraph of helper text here." },
    divider:    { label: "Divider" },
  }[type] || { label: type };
  return {
    id, type, label: defaults.label || "", placeholder: defaults.placeholder || "",
    description: "", required: false, read_only: false, default_value: null,
    options: defaults.options || [], validation: {}, width: "full",
    rich_text: defaults.rich_text || "",
  };
}
