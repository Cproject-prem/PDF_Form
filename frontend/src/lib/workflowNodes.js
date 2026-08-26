/**
 * Node type registry for the workflow designer.
 *
 * `kind` matches the engine category (trigger | condition | action | approval |
 * logic | end), `type` is the concrete operation. Every type lists its
 * configurable parameters with a small schema the right-side ConfigPanel uses.
 */

export const NODE_KINDS = {
  trigger:   { color: "#2563eb", bg: "#dbeafe", label: "Trigger" },
  condition: { color: "#a16207", bg: "#fef9c3", label: "Condition" },
  action:    { color: "#0f766e", bg: "#ccfbf1", label: "Action" },
  approval:  { color: "#7c3aed", bg: "#ede9fe", label: "Approval" },
  logic:     { color: "#64748b", bg: "#f1f5f9", label: "Logic" },
  end:       { color: "#64748b", bg: "#f1f5f9", label: "End" },
};

/* eslint-disable no-template-curly-in-string */
export const NODE_TYPES = [
  // ---------- Triggers ----------
  { type: "trigger.form_submitted",   kind: "trigger", label: "When form submitted", icon: "Zap",
    description: "Fires whenever a web form is submitted. Pick a specific form or leave empty to fire on any form.",
    fields: [
      { key: "filter.form_id", label: "Form", type: "form_picker", source: "forms" },
      { key: "site_match_field_id", label: "Submission Field ID (to match)", type: "field_id_validator", placeholder: "e.g. site_code_field" },
      { key: "site_match_column", label: "Site Master Column (to search)", type: "site_column_picker", placeholder: "Select column..." },
    ],
    defaults: { event: "form_submitted" } },
  { type: "trigger.pdf_submitted",    kind: "trigger", label: "When PDF form submitted", icon: "FileText",
    description: "Fires when a public PDF form is submitted. Pick a specific PDF template or fire on any.",
    fields: [
      { key: "filter.template_id", label: "PDF Form", type: "form_picker", source: "pdf-forms" },
      { key: "site_match_field_id", label: "Submission Field ID (to match)", type: "field_id_validator", placeholder: "e.g. site_code_field" },
      { key: "site_match_column", label: "Site Master Column (to search)", type: "site_column_picker", placeholder: "Select column..." },
    ],
    defaults: { event: "pdf_submitted" } },
  { type: "trigger.manual",           kind: "trigger", label: "Manual trigger", icon: "Hand",
    description: "Fires only when manually started from the Test panel or API.",
    fields: [
      { key: "date", label: "Date", type: "string", placeholder: "YYYY-MM-DD (Optional)" },
      { key: "time", label: "Time", type: "string", placeholder: "HH:MM (Optional)" },
      { key: "day", label: "Day", type: "string", placeholder: "e.g. Monday (Optional)" }
    ], defaults: { event: "manual" } },
  { type: "trigger.schedule",         kind: "trigger", label: "Schedule", icon: "Clock",
    description: "Fires automatically based on a defined time schedule.",
    fields: [
      { key: "frequency", label: "Frequency", type: "select", options: [
        "once", "daily", "weekly", "monthly"
      ] },
      { key: "time", label: "Time (HH:MM)", type: "string", placeholder: "14:30" },
      { key: "date", label: "Date (YYYY-MM-DD)", type: "string", placeholder: "2026-10-10" },
      { key: "day_of_week", label: "Day of Week", type: "select", options: [
        "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"
      ] },
      { key: "day_of_month", label: "Day of Month (1-31)", type: "string", placeholder: "1" }
    ], defaults: { event: "schedule", frequency: "daily", time: "09:00" } },
  { type: "trigger.webhook",          kind: "trigger", label: "Webhook", icon: "Webhook",
    description: "Fires when an external system POSTs to this workflow's webhook URL.",
    fields: [], defaults: { event: "webhook" } },
  { type: "trigger.user_login",       kind: "trigger", label: "When user logs in", icon: "LogIn",
    description: "Fires whenever a user successfully signs in.",
    fields: [], defaults: { event: "user_login" } },
  { type: "trigger.approval_completed", kind: "trigger", label: "When approval completed", icon: "CheckCheck",
    description: "Fires when any approval step is fully resolved (approved or rejected).",
    fields: [], defaults: { event: "approval_completed" } },

  // ---------- Conditions ----------
  { type: "condition.if", kind: "condition", label: "If / Else", icon: "GitBranch",
    description: "Branches into TRUE / FALSE based on AND/OR/NOT rules.",
    fields: [
      { key: "group", label: "Rules", type: "rule_group" },
    ],
    defaults: { group: { combinator: "and", rules: [] } } },

  // ---------- Actions ----------
  { type: "action.send_email", kind: "action", label: "Send email", icon: "Mail",
    description: "Sends an HTML email via the configured SMTP server. Supports dynamic attachments.",
    fields: [
      { key: "to",       label: "To",       type: "string", placeholder: "alex@x.com, {{values.email}}" },
      { key: "use_site_to", label: "Send to Everyone (Site Lookup)", type: "boolean" },
      { key: "site_to_column", label: "To from Site Master Column", type: "site_column_picker", placeholder: "Select column..." },
      { key: "region_filter_column", label: "Only send if Site Column (e.g. Region)...", type: "site_column_picker", placeholder: "Select column..." },
      { key: "region_filter_value", label: "...equals this value", type: "site_column_value_picker", depends_on: "region_filter_column", placeholder: "Select value(s)..." },
      { key: "send_to_submitter", label: "Also send to submitter", type: "boolean" },
      { key: "cc",       label: "Cc",       type: "string" },
      { key: "use_site_cc", label: "CC Everyone (Site Lookup)", type: "boolean" },
      { key: "site_cc_column", label: "CC from Site Master Column", type: "site_column_picker", placeholder: "Select column..." },
      { key: "bcc",      label: "Bcc",      type: "string" },
      { key: "subject",  label: "Subject",  type: "string", placeholder: "e.g. Alert for {{values.site_name}}" },
      { key: "body_format", label: "Body Format", type: "select", options: ["Plain Text (Standard input)", "HTML body input"] },
      { key: "body",     label: "Email Body", type: "long", placeholder: "Type here... Use {{values.FIELD_ID}} to grab form data (like {{values.site_name}})." },
      { key: "attach_pdf", label: "Attach Completed PDF?", type: "boolean" },
      { key: "attachments", label: "Attachments", type: "multi_checkbox",
        options: [
          { value: "completed_pdf", label: "Completed PDF (filled)" },
          { value: "original_pdf",  label: "Original PDF template" },
          { value: "excel_export",  label: "Excel export (.xlsx)" },
          { value: "csv_export",    label: "CSV export (.csv)" },
          { value: "zip_archive",   label: "Bundle all as ZIP archive" },
        ] },
    ], defaults: { attachments: [], send_to_submitter: false, body_format: "HTML" } },
  { type: "action.send_whatsapp", kind: "action", label: "Send WhatsApp", icon: "MessageSquare",
    description: "Sends a WhatsApp Business API message to a phone number or group.",
    fields: [
      { key: "to",      label: "To (phone with country code)",  type: "string", placeholder: "e.g. 919876543210 or {{values.phone}}" },
      { key: "group_name", label: "Group Name / ID (Static)", type: "string", placeholder: "e.g. My Operations Group" },
      { key: "site_column", label: "Group Name from Site Master Column", type: "site_column_picker", placeholder: "Select column..." },
      { key: "message", label: "Message",     type: "long",   placeholder: "Type your message... Use {{values.name}} to inject data." },
      { key: "attach_pdf", label: "Attach Submission PDF", type: "boolean" },
    ],
    defaults: { attach_pdf: false } },
  { type: "action.update_submission", kind: "action", label: "Update submission", icon: "Pencil",
    description: "Patches arbitrary fields on the triggering submission.",
    fields: [
      { key: "set", label: "Fields to set (JSON)", type: "json", placeholder: '{"status":"reviewed"}' },
    ], defaults: { set: {} } },
  { type: "action.set_status", kind: "action", label: "Change status", icon: "ClipboardCheck",
    description: "Updates the submission status (submitted/approved/rejected/…).",
    fields: [
      { key: "status", label: "New status", type: "select", options: ["submitted","approved","rejected","reviewed","archived"] },
    ], defaults: { status: "approved" } },
  { type: "action.formula", kind: "action", label: "Calculate (formula)", icon: "Calculator",
    description: "Evaluates a formula and stores the result in a variable.",
    fields: [
      { key: "expression", label: "Expression", type: "string", placeholder: "values.amount * 1.18" },
      { key: "output",     label: "Output variable", type: "string", placeholder: "total" },
    ], defaults: { output: "result" } },
  { type: "action.http", kind: "action", label: "HTTP request", icon: "Globe",
    description: "Calls an external REST endpoint.",
    fields: [
      { key: "method", label: "Method", type: "select", options: ["GET","POST","PUT","PATCH","DELETE"] },
      { key: "url",    label: "URL",    type: "string", placeholder: "https://api.example.com/items" },
      { key: "headers", label: "Headers (JSON)", type: "json", placeholder: '{"Authorization":"Bearer …"}' },
      { key: "body",    label: "Body (JSON)",    type: "json" },
    ], defaults: { method: "POST", headers: {}, body: {} } },
  { type: "action.set_variable", kind: "action", label: "Set variable", icon: "Variable",
    description: "Stores a value in the execution context.",
    fields: [
      { key: "name",  label: "Variable name", type: "string" },
      { key: "value", label: "Value",         type: "string" },
    ], defaults: {} },
  { type: "action.audit", kind: "action", label: "Write audit log", icon: "ScrollText",
    description: "Appends an entry to the immutable audit log.",
    fields: [
      { key: "action",     label: "Action",      type: "string", placeholder: "submission.exported" },
      { key: "target_type", label: "Target type", type: "string", placeholder: "submission" },
      { key: "message",    label: "Message",     type: "string" },
    ], defaults: { action: "audit", target_type: "submission" } },

  // ---------- Approval ----------
  { type: "approval.sequential", kind: "approval", label: "Sequential approval", icon: "ListChecks",
    description: "Routes through approvers one by one. The chain is built from Site Master columns: L1 → L2 → Admin. Empty levels are skipped automatically. If both L1 and L2 are blank on a site, only the Admin email receives the request.",
    fields: [
      { key: "subject",    label: "Subject",       type: "string", placeholder: "Please review submission {{submission_id}}" },
      { key: "description", label: "Description",  type: "long" },
      { key: "auto_from_site", label: "Auto-resolve approvers from Site Master", type: "boolean" },
      { key: "l1_site_column",    label: "Level 1 Approver — Site column (optional)", type: "site_column_picker", placeholder: "e.g. vendor_approver_l1" },
      { key: "l2_site_column",    label: "Level 2 Approver — Site column (optional)", type: "site_column_picker", placeholder: "e.g. vendor_approver_l2" },
      { key: "admin_site_column", label: "Admin / Final Approver — Site column",      type: "site_column_picker", placeholder: "e.g. approver_email" },
      { key: "approvers",  label: "Manual approvers override (comma-separated, only if auto-resolve is off)", type: "string", placeholder: "manager@example.com" },
      { key: "cc",         label: "CC (comma-separated)", type: "string", placeholder: "hr@example.com, ops@example.com" },
      { key: "due_days",   label: "Due in N days", type: "number" },
    ], defaults: { mode: "sequential", auto_from_site: true, admin_site_column: "approver_email", l1_site_column: "vendor_approver_l1", l2_site_column: "vendor_approver_l2", cc: "" } },
  { type: "approval.parallel", kind: "approval", label: "Parallel approval", icon: "GitMerge",
    description: "Sends to all approvers at once; everyone must approve. Site-resolved approver acts as the primary.",
    fields: [
      { key: "subject", label: "Subject", type: "string" },
      { key: "description", label: "Description", type: "long" },
      { key: "auto_from_site", label: "Auto-resolve approver from Site Master", type: "boolean" },
      { key: "approvers", label: "Additional approvers", type: "string", placeholder: "a@x.com, b@x.com" },
      { key: "cc",        label: "CC", type: "string" },
      { key: "due_days",  label: "Due in N days", type: "number" },
    ], defaults: { mode: "parallel", auto_from_site: true, cc: "" } },

  // ---------- Logic ----------
  { type: "logic.delay", kind: "logic", label: "Wait / delay", icon: "Clock",
    description: "Pauses the workflow for a few seconds (long delays require scheduler — not yet enabled).",
    fields: [
      { key: "seconds", label: "Seconds", type: "number" },
      { key: "minutes", label: "Minutes", type: "number" },
      { key: "hours",   label: "Hours",   type: "number" },
    ], defaults: { seconds: 5 } },
  { type: "logic.end", kind: "end", label: "End workflow", icon: "CircleStop",
    description: "Terminates execution at this node.",
    fields: [], defaults: {} },
];

export function getNodeMeta(type) {
  return NODE_TYPES.find((n) => n.type === type) || NODE_TYPES[0];
}

export const PALETTE_GROUPS = [
  { label: "Triggers",      kinds: ["trigger"] },
  { label: "Conditions",    kinds: ["condition"] },
  { label: "Actions",       kinds: ["action"] },
  { label: "Approval",      kinds: ["approval"] },
  { label: "Logic & flow",  kinds: ["logic", "end"] },
];

export const OPERATORS = [
  { value: "eq",          label: "equals" },
  { value: "ne",          label: "not equals" },
  { value: ">",           label: "greater than" },
  { value: "<",           label: "less than" },
  { value: ">=",          label: "greater or equal" },
  { value: "<=",          label: "less or equal" },
  { value: "contains",    label: "contains" },
  { value: "not_contains", label: "does not contain" },
  { value: "starts_with", label: "starts with" },
  { value: "ends_with",   label: "ends with" },
  { value: "in",          label: "in list" },
  { value: "not_in",      label: "not in list" },
  { value: "between",     label: "between" },
  { value: "empty",       label: "is empty" },
  { value: "not_empty",   label: "is not empty" },
  { value: "exists",      label: "exists" },
  { value: "is_true",     label: "is true" },
  { value: "is_false",    label: "is false" },
];
