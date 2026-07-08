# 09 — UI / UX

## Design language

- **Aesthetic**: modern SaaS, close to Linear + Jotform hybrid.
- **Type**: system stack for body (`ui-sans-serif, -apple-system, Segoe UI, ...`), custom heading font (loaded via `font-heading` Tailwind alias).
- **Grid**: 4-pt spacing scale (`px-1`, `px-2`, `px-4`, `px-6` …).
- **Corners**: `rounded-lg` (8 px) for inputs, `rounded-xl` (12 px) for cards, `rounded-2xl` (16 px) for hero cards.

## Colour tokens

| Token | Hex | Role |
|-------|-----|------|
| `primary` (`bg-blue-600`) | `#2563EB` | CTA buttons, active states |
| `primary-fg` | `#FFFFFF` | text on primary |
| `emerald-500` | `#10B981` | success, tick checked |
| `red-500` | `#EF4444` | destructive, errors |
| `amber-500` | `#F59E0B` | pending / warn |
| `slate-50 → 900` | tailwind default | text + backgrounds |
| `violet-600` | `#7C3AED` | PDF-form badges (differentiate from standard forms) |

## Typography scale
| Size | Class | Usage |
|------|-------|-------|
| H1  | `text-3xl font-heading font-bold tracking-tight` | page title |
| H2  | `text-xl font-heading font-semibold` | section title |
| Body-lg | `text-base` | default |
| Body    | `text-sm text-slate-600` | descriptions |
| Small   | `text-xs text-slate-400` | meta / captions |

## Component conventions

- All Radix primitives come from **shadcn/ui** under `frontend/src/components/ui/`.
- Toasts via **sonner** (`toast.success`, `toast.error`).
- Icons via **lucide-react** (no emoji in UI).
- Every interactive element has a stable **`data-testid`** in `kebab-case` (see `<data test id usage>` policy).

## Layout patterns

- **AppLayout** (auth): 3-column — left rail (240 px), main (flex), right rail for detail views.
- **PublicLayout**: single centered card, max-w-2xl (form view) / max-w-5xl (PDF view).
- **Split-pane builder**: fixed side panels, scrollable center canvas.

## Motion

- Micro: `transition-colors duration-150 ease-out` on hover states.
- Entering: cards fade+translate-up `motion-safe:animate-in fade-in slide-in-from-bottom-2`.
- Toasts: default sonner spring.
- No page-load spinners longer than 500 ms — replaced with skeleton screens.

## Accessibility

- Focus-visible ring on every interactive: `focus-visible:ring-2 focus-visible:ring-blue-500`.
- Colour contrast: WCAG AA on all text vs surface.
- Keyboard: full Tab-order on builder; drag-drop mirrored via arrow keys + Enter/Escape (todo — see `14_Future_Features`).
- Screen-reader labels on unlabeled icon buttons via `aria-label`.

## Notable custom components

| Component | Path | Purpose |
|-----------|------|---------|
| `FieldRenderer` | `components/builder/FieldRenderer.jsx` | Renders any field-type in fill mode; shared by builder preview + public form |
| `FormCanvas` | `components/builder/FormCanvas.jsx` | DnD form canvas |
| `PdfCanvas` | `components/pdfbuilder/PdfCanvas.jsx` | Draggable PDF overlay for authoring |
| `PdfOverlayFill` | `components/pdfbuilder/PdfOverlayFill.jsx` | Read-only PDF + input widgets for public fill |
| `PlantEditHistory` | inside `pages/Plants.jsx` | Timeline with diff pills |
| `NotificationsBell` | `components/layout/NotificationsBell.jsx` | WebSocket bell |
| `AppLayout` | `components/layout/AppLayout.jsx` | Left rail nav + top bar |

## Empty / error / loading states

- **Loading**: skeletons on table rows, dot pulses on cards.
- **Empty**: illustration + one-line explanation + primary CTA.
- **Error**: red banner + retry button + link to help.
