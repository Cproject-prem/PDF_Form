# 12 — Testing

## Test pyramid

```
   ┌──────────┐
   │ E2E (5%) │        Playwright – happy-path sign-in, form-fill, approval
   └──────────┘
   ┌────────────────┐
   │  Integration   │  pytest + httpx – route + DB
   │  (25%)         │
   └────────────────┘
   ┌────────────────────┐
   │  Unit    (70%)     │  pytest – permissions, formula engine, filters
   └────────────────────┘
```

## Backend test setup

```bash
cd backend
source .venv/bin/activate
pip install pytest pytest-asyncio httpx
pytest tests/ -v
```

Fixtures create a per-test `formforge_test` database, seeded with:
- 1 super admin
- 1 regional admin (region="South")
- 1 vendor admin + 1 vendor user
- 3 sample sites, 1 vendor

## Frontend test setup

```bash
cd frontend
yarn test
```

Uses `@testing-library/react`. Focused on components with critical logic (formula editor, field renderer branches, PDF overlay math).

## E2E test setup (Playwright)

```bash
cd frontend
npx playwright install
npx playwright test
```

## Manual test checklist (per release)

### Auth
- [ ] Login with each demo account
- [ ] Wrong password → toast + no token issued
- [ ] Expired JWT → auto-redirect to `/login`

### Form builder
- [ ] Drag every field type from palette
- [ ] Autosave triggers within 1 s
- [ ] Publish → public URL works anonymously
- [ ] File field upload succeeds → filename shown on submit

### PDF form
- [ ] Upload PDF → overlay opens without errors
- [ ] Add signature field, publish
- [ ] Public form view (`/pdf/{slug}`) — try both `form` and `pdf` view modes
- [ ] Submit → filled PDF download works (anonymous, via token)

### RBAC
- [ ] Regional admin sees only submissions in their region
- [ ] Vendor admin sees only their vendor's submissions
- [ ] Vendor user sees only their own submissions
- [ ] Attempts to visit out-of-scope submission return 404

### Workflow
- [ ] Enable a workflow with `form_submitted` trigger + `send_email` action
- [ ] Submit form → email arrives with filled-PDF attachment
- [ ] `/workflow-executions` shows a success row

### Backup / Restore
- [ ] `python backup.py` produces a zip
- [ ] Drop a collection in Mongo
- [ ] `python restore.py <zip> --apply --wipe` → data comes back

## Key testids reference

| testid | Meaning |
|--------|---------|
| `public-form` | root wrapper for standard public form |
| `public-pdf-form` | root wrapper for PDF public form |
| `public-form-download` | success-screen download button |
| `pdf-view-mode-form` / `pdf-view-mode-pdf` | Share-dialog mode radios |
| `pdf-overlay-fill` | root of PDF public view overlay |
| `pdf-overlay-{fieldId}` | any input in PDF view |
| `plant-history-card` | plant edit history section |
| `plant-history-row-{snapshot_id}` | one edit in the timeline |
| `plant-history-change` | one field diff row inside a snapshot |
| `tick-{fieldId}` | tick field container |

## Regression test data

- All fixture data lives in `backend/tests/fixtures/`.
- Never mutates production `formforge` DB; uses `formforge_test`.
