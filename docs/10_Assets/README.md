# 10 — Assets

## Static assets (shipped with the app)

- **Favicon**: `/frontend/public/favicon.ico`
- **App logo**: SVG in `/frontend/src/assets/logo.svg` (used by AppLayout top bar + Login card)
- **Empty-state illustrations**: `/frontend/src/assets/empty-*.svg`

## User-uploaded assets (runtime)

Persistent on disk under `backend/uploads/`:

```
backend/uploads/
├── pdf/            <template_id>.pdf                originals uploaded by admins
├── completed/      <submission_id>.pdf              stamped filled PDFs
└── local/
    ├── tmp/        <file_id>.<ext>                  new upload landing zone
    └── submissions/
        └── <submission_id>/
            └── <original_filename>                  organised per submission
```

## PDF fonts

- Bundled with reportlab (Helvetica, ZapfDingbats).
- ZapfDingbats used for the ✓ tick character in filled PDFs (see `_render_filled_pdf_response`).
- Roadmap: register a Unicode TTF (DejaVuSans) for non-Latin form data.

## Icon inventory

Every icon is from `lucide-react`. Standardised set:

| Purpose | Icon |
|---------|------|
| Create/add | `Plus` |
| Edit | `Pencil` |
| Save | `Save` |
| Delete | `Trash2` |
| Duplicate | `Copy` |
| Download | `Download` |
| Upload | `Upload` |
| Search | `Search` |
| Filter | `SlidersHorizontal` |
| Success | `CheckCircle2` |
| Warning | `AlertTriangle` |
| Info | `Info` |
| Tick field | `CheckCircle2` |
| PDF badge | `FileType2` |
| Notifications | `Bell` |
| History timeline | `History` |

## Colour + typography source

- Tailwind config: `frontend/tailwind.config.js`
- Global CSS variables + `@layer` overrides: `frontend/src/index.css`

## External assets

- **Google Fonts**: heading font loaded via `<link>` in `frontend/public/index.html`
- **PDF worker**: `pdfjs-dist/build/pdf.worker.min.js` bundled by CRA; served from same origin

## Attribution
All icons from Lucide (ISC License).
Shadcn primitives from Radix UI (MIT).
No proprietary or paid assets currently shipped.
