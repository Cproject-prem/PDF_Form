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
    ],
    defaults: { event: "form_submitted" } },
  { type: "trigger.pdf_submitted",    kind: "trigger", label: "When PDF form submitted", icon: "FileText",
    description: "Fires when a public PDF form is submitted. Pick a specific PDF template or fire on any.",
    fields: [
      { key: "filter.template_id", label: "PDF Form", type: "form_picker", source: "pdf-forms" },
    ],
    defaults: { event: "pdf_submitted" } },
  { type: "trigger.manual",           kind: "trigger", label: "Manual trigger", icon: "Hand",
    description: "Fires only when manually started from the Test panel or API.",
    fields: [], defaults: { event: "manual" } },
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
      { key: "cc",       label: "Cc",       type: "string" },
      { key: "bcc",      label: "Bcc",      type: "string" },
      { key: "subject",  label: "Subject",  type: "string", placeholder: "Your submission {{submission_id}}" },
      { key: "body",     label: "HTML body", type: "long", placeholder: "<p>Hi {{values.name}}…</p>" },
      { key: "attachments", label: "Attachments", type: "multi_checkbox",
        options: [
          { value: "completed_pdf", label: "Completed PDF (PDF form submissions)" },
        ] },
    ], defaults: { attachments: [] } },
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
    description: "Routes through approvers one by one until everyone approves or one rejects.",
    fields: [
      { key: "subject",    label: "Subject",       type: "string", placeholder: "Please review submission {{submission_id}}" },
      { key: "description", label: "Description",  type: "long" },
      { key: "approvers",  label: "Approvers (comma-separated emails)", type: "string", placeholder: "manager@example.com, hr@example.com" },
      { key: "due_days",   label: "Due in N days", type: "number" },
    ], defaults: { mode: "sequential" } },
  { type: "approval.parallel", kind: "approval", label: "Parallel approval", icon: "GitMerge",
    description: "Sends to all approvers at once; everyone must approve.",
    fields: [
      { key: "subject", label: "Subject", type: "string" },
      { key: "description", label: "Description", type: "long" },
      { key: "approvers", label: "Approvers", type: "string", placeholder: "a@x.com, b@x.com" },
      { key: "due_days",  label: "Due in N days", type: "number" },
    ], defaults: { mode: "parallel" } },

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
