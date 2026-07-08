# 04 — Sitemap

## Route tree (React Router)

```
Public
├── /login                                Sign-in
├── /f/{slug}                             Public standard form
├── /pdf/{slug}                           Public PDF form (form OR pdf view)
└── /approve/{token}                      Magic-link approval landing

Authenticated (any signed-in role)
├── /                                     Dashboard
├── /forms                                Forms list
│   ├── /forms/new                        Empty builder
│   ├── /forms/{id}                       Split-pane builder
│   └── /forms/{id}/settings              Publish + share
├── /pdf-forms                            PDF templates list
│   ├── /pdf-forms/new                    Upload PDF
│   ├── /pdf-forms/{id}                   Overlay builder
│   └── /pdf-forms/{id}/settings          Publish + view-mode toggle
├── /submissions                          Consolidated submissions hub
│   ├── /submissions/{id}                 Standard-form detail
│   └── /pdf-submissions/{id}             PDF-form detail
├── /approvals                            Enriched approval cards
├── /plants                                Plant list (RLS-scoped)
│   └── /plants/{site_code}               Editable plant detail + edit history
├── /vendors                              Vendor list
├── /workflows                            Workflow canvas list
│   └── /workflows/{id}                   Workflow editor
├── /workflow-executions                  Trigger runs / errors log
└── /profile                              Change password, notification prefs

Admin-only (super_admin + admin)
├── /users                                User CRUD, region + vendor assignment
├── /master-data                          Sites/vendors CSV import
├── /welcome-email                        Configurable welcome template
├── /smtp                                 SMTP credentials
└── /audit                                Audit log viewer

Super-admin-only
└── /system                               Global settings, background jobs
```

## Navigation groups (left rail)

Ordered by frequency of use:

1. **Dashboard**
2. **Forms** / **PDF Forms**
3. **Submissions** / **Approvals**
4. **Plants** / **Vendors** / **Users**
5. **Workflows** / **Executions**
6. **Master Data** / **Welcome Email** / **SMTP** (collapsed under "Admin")
7. **Audit** (super-admin only)

## Menu segregation (visible-by-role)

| Menu group | super_admin | admin | vendor_admin | vendor_user |
|------------|:-----------:|:-----:|:------------:|:-----------:|
| Dashboard  | ✅ | ✅ | ✅ | ✅ |
| Build      | ✅ | ✅ | ❌ | ❌ |
| Data       | ✅ | ✅ | ❌ | ❌ |
| Submissions| ✅ | ✅ | ✅ | ✅¹ |
| Team       | ✅ | ✅ | ✅ | ❌ |
| Admin      | ✅ | ✅ | ❌ | ❌ |
| System     | ✅ | ❌ | ❌ | ❌ |

¹ shows only their own submissions.

## Deep-link tokens

- Public download: `/api/public/submissions/{sid}/filled.pdf?token=<jwt>`
- PDF public download: `/api/public/pdf-submissions/{sid}/completed?token=<jwt>`
- Magic-link approvals: `/approve/{approval_token}`

All tokens are JWTs signed with `JWT_SECRET`.
