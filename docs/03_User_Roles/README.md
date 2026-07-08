# 03 — User Roles & Permissions Matrix

## Role hierarchy
```
super_admin           (organization-wide, no scope limits)
    ↓
admin                 (scoped by `region` if set; else full)
    ↓
vendor_admin          (scoped by `vendor_id`)
    ↓
vendor_user           (scoped by `vendor_id` + `submitted_by`)
```

## Permission matrix

| Action                                 | super_admin | admin | vendor_admin | vendor_user |
|----------------------------------------|:-----------:|:-----:|:------------:|:-----------:|
| Create / edit any form or PDF template |     ✅      |  ✅   |      ❌      |     ❌      |
| Delete forms / templates               |     ✅      |  ✅¹  |      ❌      |     ❌      |
| View all submissions                   |     ✅      |  ✅²  |      ✅³     |     ❌      |
| View own submissions only              |     n/a     |  n/a  |      n/a     |     ✅      |
| Approve submissions                    |     ✅      |  ✅²  |      ❌      |     ❌      |
| Manage users                           |     ✅      |  ✅   |      ❌      |     ❌      |
| Change super-admin credentials         |     ✅      |  ❌   |      ❌      |     ❌      |
| Manage master data (sites/vendors)     |     ✅      |  ✅   |      ❌      |     ❌      |
| Configure SMTP / welcome email         |     ✅      |  ❌   |      ❌      |     ❌      |
| Author workflows                       |     ✅      |  ✅   |      ❌      |     ❌      |
| Download filled PDF (own submission)   |     ✅      |  ✅   |      ✅      |     ✅      |
| Access `/api/dashboard/stats`          |     ✅      |  ✅   |      ✅      |     ✅⁴     |
| WebSocket notifications                |     ✅      |  ✅   |      ✅      |     ✅      |
| Take DB backup                         |     ✅      |  ❌   |      ❌      |     ❌      |

Footnotes:
1. Admins can only delete forms they own (`owner_id == user_id`).
2. Scoped by `region` when the admin has one set on their user record.
3. Scoped by `vendor_id` — only sees submissions with matching vendor.
4. Stats limited to their own vendor.

## Row-Level Security (RLS) — how it works

Filter is built in `backend/permissions.py::submission_filter(user)`:

```python
def submission_filter(user) -> dict:
    if user.role == "super_admin":                return {}
    if user.role == "admin" and user.region:      return {"region": user.region}
    if user.role == "admin":                      return {}
    if user.role == "vendor_admin":               return {"vendor_id": user.vendor_id}
    if user.role == "vendor_user":                return {"submitted_by": user.user_id}
```

Every Mongo query for submissions **must** be wrapped through this filter. Direct `db.submissions.find({})` in route handlers is banned (lint check).

## Region assignment
- Admins have an optional `region` (`North`, `South`, `East`, `West` in the demo).
- Sites carry a `region` column (imported from CSV or edited in Plant View).
- Submissions inherit the `region` of the site they reference at submit time.
- Match logic: exact string, case-sensitive.

## Vendor assignment
- Vendors are rows in `db.vendors` with `vendor_id`.
- Vendor users store `vendor_id` on their user record.
- Vendor admins can see all users **and** submissions with that `vendor_id`.

## Impersonation
Not implemented today. Roadmap item (see `14_Future_Features`).
