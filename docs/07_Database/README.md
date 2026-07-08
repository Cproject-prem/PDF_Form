# 07 — Database Schema (MongoDB)

Backend: **MongoDB 7** via Motor (async).
DB name: `formforge` (configurable via `DB_NAME`).

## Conventions
- Every document has an `_id` (ObjectId) plus a domain-friendly ID (`user_id`, `form_id`, `submission_id`, …) generated as `{prefix}_{uuid.uuid4().hex[:12]}`.
- Timestamps stored as **ISO-8601 strings** in UTC (`datetime.now(timezone.utc).isoformat()`).
- Soft delete via `is_deleted: bool` where relevant.
- Every mutable master-data row gets snapshotted to a `_versions` sibling collection on change.

---

## Collections

### `users`
```json
{
  "_id": ObjectId,
  "user_id": "usr_a12b3c4d5e6f",
  "email": "admin@example.com",
  "name": "Super Admin",
  "role": "super_admin | admin | vendor_admin | vendor_user",
  "password_hash": "<bcrypt>",
  "is_active": true,
  "region": "South",          // admins only
  "vendor_id": "vnd_...",     // vendor_* roles only
  "cluster_manager_name": "Rahul Verma",
  "created_at": "2026-01-15T09:00:00+00:00",
  "last_login": "..."
}
```

### `forms`
```json
{
  "form_id": "form_a984931eb51e",
  "slug": "ptw-checklist-a1b2",
  "title": "Permit To Work Checklist",
  "description": "...",
  "owner_id": "usr_...",
  "status": "draft | published | archived",
  "fields": [ { "id": "f1", "type": "short_text", "label": "Name", "required": true, ... } ],
  "settings": { "thank_you_message": "...", "show_progress": true, ... },
  "is_deleted": false,
  "created_at": "..."
}
```

### `pdf_templates`
```json
{
  "template_id": "pdftpl_9974e69e0cd4",
  "slug": "real-7bf8f7",
  "title": "REAL — Risk Environmental Assessment",
  "storage_filename": "9974e69e0cd4.pdf",
  "version": 3,
  "status": "draft | published | archived",
  "fields": [ { "id": "f1", "type": "signature", "page": 1, "x": 0.15, "y": 0.72, "width": 0.4, "height": 0.06, ... } ],
  "settings": { "public_view_mode": "form | pdf", ... }
}
```

### `submissions`
```json
{
  "submission_id": "sub_70f2d32f3dc4",
  "form_id": "form_...",
  "values": { "f1": "Alice", "f2": "alice@...", "f3": { "file_id": "6afc...", "filename": "test.png", ... } },
  "submitted_by": "usr_... | null",
  "vendor_id": "vnd_... | null",
  "region": "South",
  "site_name": "CHARLIE-25",
  "ip": "192.168.1.100",
  "user_agent": "...",
  "status": "submitted | approved | rejected",
  "created_at": "..."
}
```

### `pdf_submissions`
Same shape as `submissions` but references `template_id` + `completed_filename`.

### `files`
```json
{
  "file_id": "6afc52d5862a46d89c6cced7ee...",
  "storage_path": "submissions/sub_70f.../test.png",   // relative to LOCAL_UPLOAD_ROOT
  "original_filename": "test.png",
  "content_type": "image/png",
  "size": 287,
  "uploaded_by": "usr_... | null",
  "submission_id": "sub_... | null",   // set once file is bound to a submission
  "organized_at": "...",
  "is_deleted": false,
  "created_at": "..."
}
```

### `sites`
```json
{
  "site_id": "site_96e3426e2b00",
  "site_code": "CHARLIE-25",
  "site_name": "Charlie Plant Bengaluru",
  "region": "South",
  "approver_email": "regional.south@...",
  "cluster": "SOUTH-B",
  "version": 7,
  "assigned_admin_ids": [ "usr_..." ],
  "updated_at": "...",
  "updated_by": "usr_..."
}
```

### `site_versions`
Snapshot-before-edit of a site row plus `saved_by`, `saved_at`, `version`, `snapshot_id`.

### `vendors`
```json
{
  "vendor_id": "vnd_...",
  "vendor_name": "SunOps Ltd",
  "contact_email": "...",
  "assigned_admin_ids": [ "usr_..." ]
}
```

### `regions`
Just a lookup: `{ "region": "North|South|East|West", "display_order": 1 }`.

### `workflows`
```json
{
  "workflow_id": "wf_...",
  "name": "PTW Auto-Notify",
  "version": 3,
  "trigger": { "type": "form_submitted", "form_id": "form_..." },
  "nodes": [ ... ],
  "edges": [ ... ],
  "is_active": true
}
```

### `workflow_versions`, `workflow_executions`
Immutable audit trail of every trigger + outcome.

### `approvals`
```json
{
  "approval_id": "app_...",
  "approval_token": "<random 32-byte hex>",
  "submission_id": "sub_...",
  "approver_email": "...",
  "status": "pending | approved | rejected",
  "expires_at": "..."
}
```

### `smtp_config`, `workspace_settings`, `audit_logs`
Config singletons and audit trail.

## Indexes (created on boot)

```python
db.users.create_index("email", unique=True)
db.forms.create_index("slug", unique=True, partialFilterExpression={"is_deleted": False})
db.pdf_templates.create_index("slug", unique=True, partialFilterExpression={"is_deleted": False})
db.submissions.create_index([("form_id", 1), ("created_at", -1)])
db.files.create_index("file_id", unique=True)
db.sites.create_index("site_code", unique=True)
```

## Relationships (conceptual)

```
users ── owns ─▶ forms ── has many ─▶ submissions ── references ─▶ files
                            └── region/site inherit from ─▶ sites
users ── belongs to ─▶ vendors
workflows ── triggers on ─▶ forms + submissions
approvals ── unlocks ─▶ submissions
```

Note: Mongo doesn't enforce FKs — the app layer is the guarantor.
