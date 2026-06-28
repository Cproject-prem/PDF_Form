# FormForge — Product Requirements & Architecture

## Source problem statement
Add Site Management as a dropdown data source for form fields and provide a Lookup configuration for every field that can auto-populate from the Site Master (Site Name, Asset ID, Plant Name, Customer, Vendor, Vendor Email, AC Capacity, DC Capacity, Region, State, Cluster, Latitude, Longitude, Status). Replace the existing calculator with a production-ready Formula Engine (LOOKUP/VLOOKUP/XLOOKUP/IF/SUM/AVG/ROUND/etc.) with a visual builder. Generated PDFs and workflow conditions must use resolved (not formula) values.

## Stack
- Backend: FastAPI (Python) + MongoDB (motor) + bcrypt + PyJWT + reportlab + openpyxl + simpleeval + pypdf
- Frontend: React 19 + craco + Tailwind + shadcn/ui + lucide-react + @dnd-kit + ag-grid + pdfjs/react-pdf
- Auth: JWT bearer token in `Authorization: Bearer …`, stored in `localStorage.ff_token`

## What was added in this iteration (2026-06-28)

### Backend
- **`backend/formula_engine.py`** — production-ready Excel-like expression engine:
  arithmetic, IF/IFS/AND/OR/NOT, SUM/AVG/MIN/MAX/COUNT, ROUND/UP/DOWN, SQRT/POWER/ABS,
  TODAY/NOW/DATEDIFF/YEAR/MONTH/DAY/HOUR/MINUTE/SECOND, CONCAT/TEXT/LEFT/RIGHT/MID/LEN/
  LOWER/UPPER/TRIM/REPLACE/SUBSTITUTE, **LOOKUP/VLOOKUP/XLOOKUP/INDEX/MATCH/ISBLANK/
  ISNUMBER/ISTEXT** with `{{field_id}}` references.
- **`backend/formula_routes.py`** — `/api/formula/functions`, `/api/formula/validate`,
  `/api/formula/evaluate` (the last accepts `auto_load_tables: ["SiteMaster"]` so LOOKUP
  works against the Site Master without sending data over the wire).
- **`backend/datasource_routes.py`** — `/api/data-source/resolve` & `/api/data-source/excel-upload`
  for the new data source types beyond the built-in master sources: REST API, JSON, CSV,
  Excel upload, Another Form, Workflow Variable, Logged-in user/vendor.
- `FormField` pydantic model upgraded to `extra="allow"` so saved forms can carry the
  new `data_source` / `lookup` / `formula` blobs without schema breakage.
- Existing `/api/lookup/*` (admin) and `/api/public/lookup/*` (anonymous public-form)
  routes already supported `sites` / `vendors` / `master:*` — left untouched.

### Frontend
- **`PropertiesPanel.jsx`** — full rewrite into a tabbed editor:
  - General | **Data Source** | Lookup | **Formula** | Validation | Advanced
  - Data Source tab supports 13 source kinds:
    Manual, Site Management, Vendor Management, Master Data Tables, REST API,
    JSON, CSV, Excel Import, SQL Query (info-only — needs Postgres), Another Form,
    Workflow Variable, Logged-in User, Logged-in Vendor.
  - When `Site Management` is selected, the field shows Display/Stored Value column
    pickers, an Auto-fill matrix that maps row columns into other form fields, and
    an Assigned-Vendor-Only filter for vendor users.
  - Lookup tab: enable/trigger/return-column/not-found/multi-match strategy/read-only.
  - Formula tab: live validation, dependency badges, **Field Browser**, **Function Browser**,
    **Test** button that returns a sample-data result, syntax-highlight via mono font.
- **`PublicForm.jsx`** — added a second `useEffect` that runs `/api/formula/evaluate`
  for every formula-enabled field on every value change (debounced 150 ms) and patches
  the result back into the form's `values` state.
- Lookup cache key fix in `PublicForm.jsx` — bug was caching a single lookup result by
  `source:display:value` only, which meant only the first lookup's column ever populated.
  Now keyed by `source:display:value:return_column`.

## Verified end-to-end
- Logged out → opened `/f/site-ops-demo-7098bd` → selected "Alpha Solar 50MW":
  - Asset ID `AST-1001` ✓
  - Plant Name `Alpha` ✓
  - AC Capacity `50` ✓
  - DC Capacity `65` ✓
  - DC/AC Ratio `1.3` (formula `ROUND({{dc_capacity}}/{{ac_capacity}}, 3)`) ✓
  - Required Approval `Manager Approval` (formula `IF({{ac_capacity}}>40, ...)`) ✓

## Test credentials
- Admin: `admin@example.com / Admin@12345`

## Backlog / next ideas
- Drag-and-drop reordering of fields (currently up/down arrows)
- Built-in REST API runtime caching for lookups against >100k records
- SQL data source against PostgreSQL (UI placeholder ready)
- Conditional visibility (`show_when`) using formula expressions
- Workflow runtime actions (notify, status changes) — currently records the path only
