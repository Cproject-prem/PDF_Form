// Field-type catalog for the PDF Form Builder (separate from the standard
// builder so PDF-specific types like signature/QR/barcode are first-class).
import {
  Type, AlignLeft, Hash, Mail, Phone, Calendar, Clock, ChevronDown, CheckSquare,
  Circle, Upload, PenLine, Image as ImageIcon, QrCode, Barcode, Heading1, Pilcrow,
  Minus, FileText, Hash as Auto, Sigma, EyeOff, FileText as FileIcon,
} from "lucide-react";

export const PDF_FIELD_TYPES = [
  { type: "short_text",  label: "Short Text",  icon: Type,        group: "Basic" },
  { type: "long_text",   label: "Long Text",   icon: AlignLeft,   group: "Basic" },
  { type: "number",      label: "Number",      icon: Hash,        group: "Basic" },
  { type: "date",        label: "Date",        icon: Calendar,    group: "Basic" },
  { type: "time",        label: "Time",        icon: Clock,       group: "Basic" },
  { type: "email",       label: "Email",       icon: Mail,        group: "Basic" },
  { type: "phone",       label: "Phone",       icon: Phone,       group: "Basic" },
  { type: "dropdown",    label: "Dropdown",    icon: ChevronDown, group: "Choices" },
  { type: "checkbox",    label: "Checkbox",    icon: CheckSquare, group: "Choices" },
  { type: "radio",       label: "Radio",       icon: Circle,      group: "Choices" },
  { type: "signature",   label: "Signature",   icon: PenLine,     group: "Advanced" },
  { type: "initial",     label: "Initial",     icon: PenLine,     group: "Advanced" },
  { type: "image",       label: "Image",       icon: ImageIcon,   group: "Advanced" },
  { type: "file",        label: "File Upload", icon: Upload,      group: "Advanced" },
  { type: "qr_code",     label: "QR Code",     icon: QrCode,      group: "Advanced" },
  { type: "barcode",     label: "Barcode",     icon: Barcode,     group: "Advanced" },
  { type: "calculation", label: "Calculation", icon: Sigma,       group: "Advanced" },
  { type: "hidden",      label: "Hidden",      icon: EyeOff,      group: "Advanced" },
  { type: "auto_number", label: "Auto Number", icon: Auto,        group: "Advanced" },
  { type: "heading",     label: "Heading",     icon: Heading1,    group: "Display" },
  { type: "paragraph",   label: "Paragraph",   icon: Pilcrow,     group: "Display" },
  { type: "static_text", label: "Static Text", icon: FileText,    group: "Display" },
  { type: "divider",     label: "Divider",     icon: Minus,       group: "Display" },
];

export const PDF_FIELD_GROUPS = ["Basic", "Choices", "Advanced", "Display"];

export const getPdfFieldMeta = (type) =>
  PDF_FIELD_TYPES.find((f) => f.type === type) || PDF_FIELD_TYPES[0];

export const DEFAULT_FIELD_DEFAULTS = {
  short_text:  { label: "Short Text",  width: 0.25, height: 0.03 },
  long_text:   { label: "Long Text",   width: 0.35, height: 0.08 },
  number:      { label: "Number",      width: 0.15, height: 0.03 },
  date:        { label: "Date",        width: 0.18, height: 0.03 },
  time:        { label: "Time",        width: 0.12, height: 0.03 },
  email:       { label: "Email",       width: 0.3,  height: 0.03 },
  phone:       { label: "Phone",       width: 0.2,  height: 0.03 },
  dropdown:    { label: "Dropdown",    width: 0.25, height: 0.03, options: ["Option A", "Option B"] },
  checkbox:    { label: "Checkbox",    width: 0.25, height: 0.06, options: ["Option A", "Option B"] },
  radio:       { label: "Radio",       width: 0.25, height: 0.06, options: ["Option A", "Option B"] },
  signature:   { label: "Signature",   width: 0.3,  height: 0.08 },
  initial:     { label: "Initial",     width: 0.08, height: 0.04 },
  image:       { label: "Image",       width: 0.2,  height: 0.12 },
  file:        { label: "File",        width: 0.25, height: 0.03 },
  qr_code:     { label: "QR Code",     width: 0.12, height: 0.12 },
  barcode:     { label: "Barcode",     width: 0.25, height: 0.06 },
  calculation: { label: "Calculation", width: 0.15, height: 0.03 },
  hidden:      { label: "Hidden",      width: 0.1,  height: 0.02 },
  auto_number: { label: "Auto Number",  width: 0.15, height: 0.03, auto_number: { enabled: true, mode: "year_continuous", start_from: 1, padding: 3 } },
  number:      { label: "Number",       width: 0.15, height: 0.03, auto_number: { enabled: false, mode: "year_continuous", start_from: 1, padding: 3 } },
  heading:     { label: "Heading",     width: 0.5,  height: 0.04, static_text: "Heading", font_size: 18 },
  paragraph:   { label: "Paragraph",   width: 0.6,  height: 0.08, static_text: "Paragraph of text…" },
  static_text: { label: "Text",        width: 0.4,  height: 0.04, static_text: "Static text" },
  divider:     { label: "Divider",     width: 0.6,  height: 0.005 },
};

export function makePdfField(type, page = 1, x = 0.1, y = 0.1) {
  const defaults = DEFAULT_FIELD_DEFAULTS[type] || { label: type, width: 0.2, height: 0.03 };
  const options = defaults.options || [];
  const field = {
    id: `pf_${Math.random().toString(36).slice(2, 10)}`,
    page,
    x,
    y,
    width: defaults.width,
    height: defaults.height,
    rotation: 0,
    z_index: 0,
    type,
    name: type,
    label: defaults.label || type,
    placeholder: "",
    default_value: "",
    static_text: defaults.static_text || "",
    required: false,
    read_only: false,
    locked: false,
    visible: true,
    options,
    validation: {},
    font_size: defaults.font_size || 12,
    font_family: "Helvetica",
    is_bold: false,
    is_italic: false,
    font_color: "#111827",
    border_color: "#2563EB",
    background_color: "#DBEAFE",
    opacity: 0.4,
    alignment: "left",
    conditional_logic: null,
    db_mapping: "",
  };
  // For choice fields (checkbox / radio), auto-initialize per-option positions
  // so each option becomes an independently draggable mini-box on the PDF page.
  if ((type === "checkbox" || type === "radio") && options.length > 0) {
    field.option_positions = defaultOptionPositions(field, options);
  }
  return field;
}

/**
 * Build a stacked-vertical set of positions for the given options, using
 * `field.x, field.y, field.width` as anchor. Each option row is `optH` tall
 * (default 3% of page = fits ~11-12pt text), stacked directly below the
 * previous with no gap. Returned coords are page-normalized (0..1).
 */
export function defaultOptionPositions(field, options, opts = {}) {
  const optH = opts.height ?? 0.03;
  const optW = opts.width ?? Math.min(1 - field.x, field.width || 0.25);
  const startY = field.y + (field.height || 0.04); // just below the label
  return (options || []).map((_, i) => ({
    x: field.x,
    y: Math.min(0.98, startY + i * optH),
    w: optW,
    h: optH,
  }));
}

/**
 * Return a normalized array of `{ value, x, y, w, h }` for each option on
 * the field.  Falls back to a stacked layout for any missing entry so the
 * renderer never crashes when `option_positions` is out of sync with
 * `options`.
 */
export function resolveOptionBoxes(field) {
  const options = field?.options || [];
  const positions = field?.option_positions || [];
  const fallback = defaultOptionPositions(field, options);
  return options.map((value, i) => {
    const p = positions[i] || fallback[i] || { x: field.x, y: field.y, w: 0.2, h: 0.03 };
    return { value, x: p.x, y: p.y, w: p.w, h: p.h, index: i };
  });
}
