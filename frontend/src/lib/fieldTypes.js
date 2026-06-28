// Field type catalog — used by builder palette and renderers.
import {
  Type, AlignLeft, Hash, Mail, Phone, Calendar, Clock, ChevronDown, CheckSquare,
  Circle, Upload, Link as LinkIcon, Star, Heading1, Pilcrow, Minus
} from "lucide-react";

export const FIELD_TYPES = [
  { type: "short_text", label: "Short Text", icon: Type, group: "Basic", defaults: { label: "Short Text", placeholder: "" } },
  { type: "long_text",  label: "Long Text",  icon: AlignLeft, group: "Basic", defaults: { label: "Long Text", placeholder: "" } },
  { type: "number",     label: "Number",     icon: Hash, group: "Basic", defaults: { label: "Number" } },
  { type: "email",      label: "Email",      icon: Mail, group: "Basic", defaults: { label: "Email", placeholder: "you@example.com" } },
  { type: "phone",      label: "Phone",      icon: Phone, group: "Basic", defaults: { label: "Phone", placeholder: "+1 (555) 555-5555" } },
  { type: "date",       label: "Date",       icon: Calendar, group: "Basic", defaults: { label: "Date" } },
  { type: "time",       label: "Time",       icon: Clock, group: "Basic", defaults: { label: "Time" } },
  { type: "dropdown",   label: "Dropdown",   icon: ChevronDown, group: "Choices", defaults: { label: "Dropdown", options: ["Option A", "Option B"] } },
  { type: "checkbox",   label: "Checkbox",   icon: CheckSquare, group: "Choices", defaults: { label: "Checkbox", options: ["Option A", "Option B"] } },
  { type: "radio",      label: "Radio",      icon: Circle, group: "Choices", defaults: { label: "Radio", options: ["Option A", "Option B"] } },
  { type: "file",       label: "File Upload", icon: Upload, group: "Advanced", defaults: { label: "Upload File" } },
  { type: "url",        label: "URL",        icon: LinkIcon, group: "Basic", defaults: { label: "Website", placeholder: "https://" } },
  { type: "rating",     label: "Rating",     icon: Star, group: "Advanced", defaults: { label: "Rating" } },
  { type: "heading",    label: "Heading",    icon: Heading1, group: "Display", defaults: { rich_text: "Section heading" } },
  { type: "paragraph",  label: "Paragraph",  icon: Pilcrow, group: "Display", defaults: { rich_text: "Add a paragraph of helper text here." } },
  { type: "divider",    label: "Divider",    icon: Minus, group: "Display", defaults: {} },
];

export const FIELD_GROUPS = ["Basic", "Choices", "Advanced", "Display"];

export const getFieldMeta = (type) => FIELD_TYPES.find((f) => f.type === type);
