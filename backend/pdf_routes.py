"""
PDF Form Builder routes.

Adds endpoints for:
  - Uploading PDF templates (stored on local disk under /app/backend/uploads/pdf/)
  - Listing/getting/updating/deleting PDF templates
  - Publishing PDF templates so they can be filled publicly
  - Submitting filled values, generating completed PDFs (stored under /uploads/completed/)
  - Listing & downloading submissions

Field coordinates are stored in PDF points (origin top-left) so we can
later map them onto reportlab/pypdf overlays without rasterising the PDF.
"""
from __future__ import annotations

import base64
import io
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    Response,
    UploadFile,
)
from pydantic import BaseModel, ConfigDict, Field
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas as rl_canvas

logger = logging.getLogger("jotform.pdf")

# --------------------------------------------------------------------- config
UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR", "/app/backend/uploads"))
PDF_DIR = UPLOAD_DIR / "pdf"
COMPLETED_DIR = UPLOAD_DIR / "completed"
ASSET_DIR = UPLOAD_DIR / "assets"
for _d in (PDF_DIR, COMPLETED_DIR, ASSET_DIR):
    _d.mkdir(parents=True, exist_ok=True)

MAX_PDF_MB = int(os.environ.get("MAX_PDF_MB", "50"))

# Field types supported by the PDF Form Builder
PDF_FIELD_TYPES = {
    "short_text", "long_text", "number", "date", "time", "email", "phone",
    "dropdown", "checkbox", "radio", "tick", "signature", "initial", "image",
    "file", "qr_code", "barcode", "heading", "paragraph", "static_text",
    "divider", "auto_number", "calculation", "hidden",
}

# --------------------------------------------------------------------- models
class PDFField(BaseModel):
    # Allow extra so PDF fields can carry the same data_source/lookup/formula
    # blobs that normal form fields use — full parity with the Form Builder.
    model_config = ConfigDict(extra="allow")
    id: str
    page: int = 1
    # Coordinates as percentages of the page (0..1) for resolution independence
    x: float = 0.1
    y: float = 0.1
    width: float = 0.2
    height: float = 0.04
    rotation: float = 0.0
    z_index: int = 0
    type: str = "short_text"
    name: str = ""
    label: str = ""
    placeholder: str = ""
    default_value: Any = ""
    static_text: str = ""
    required: bool = False
    read_only: bool = False
    locked: bool = False
    visible: bool = True
    options: List[str] = []
    validation: Dict[str, Any] = Field(default_factory=dict)
    font_size: int = 12
    font_family: str = "Helvetica"
    font_color: str = "#111827"
    border_color: str = "#2563EB"
    background_color: str = "#DBEAFE"
    opacity: float = 0.4
    alignment: str = "left"
    conditional_logic: Optional[Dict[str, Any]] = None
    db_mapping: str = ""
    # ---- Parity tabs with Form Builder ----
    data_source: Optional[Dict[str, Any]] = None
    lookup: Optional[Dict[str, Any]] = None
    formula: Optional[Dict[str, Any]] = None
    description: str = ""
    help_text: str = ""


class PDFPage(BaseModel):
    page: int
    width: float    # in PDF points
    height: float


class PDFTemplateIn(BaseModel):
    title: str = "Untitled PDF Form"
    description: str = ""
    fields: List[PDFField] = []
    settings: Dict[str, Any] = Field(default_factory=dict)
    status: str = "draft"
    pages: List[PDFPage] = []
    version: int = 1
    # ---- Assignment fields (row-level security) ----
    assigned_site_ids: List[str] = Field(default_factory=list)
    assigned_vendor_ids: List[str] = Field(default_factory=list)
    assigned_vendor_user_ids: List[str] = Field(default_factory=list)
    assigned_admin_ids: List[str] = Field(default_factory=list)
    assigned_member_ids: List[str] = Field(default_factory=list)
    assigned_department_ids: List[str] = Field(default_factory=list)
    assigned_team_ids: List[str] = Field(default_factory=list)
    assigned_cluster_managers: List[str] = Field(default_factory=list)


class PDFTemplate(PDFTemplateIn):
    template_id: str
    slug: str
    owner_id: str
    original_filename: str
    storage_filename: str   # unique on-disk name (uuid.pdf)
    file_size: int
    created_at: str
    updated_at: str
    is_deleted: bool = False
    is_archived: bool = False


class PDFTemplatePatch(BaseModel):
    is_archived: Optional[bool] = None
    status: Optional[str] = None
    title: Optional[str] = None


class PDFSubmissionIn(BaseModel):
    values: Dict[str, Any] = Field(default_factory=dict)


class PDFSubmission(BaseModel):
    submission_id: str
    template_id: str
    template_version: int = 1
    values: Dict[str, Any]
    submitted_by: Optional[str] = None
    submitted_by_email: Optional[str] = None
    submitted_by_name: Optional[str] = None
    ip: Optional[str] = None
    user_agent: Optional[str] = None
    completed_filename: Optional[str] = None  # filename inside completed/
    status: str = "submitted"
    created_at: str


# --------------------------------------------------------------------- utils
def _slug(title: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:40] or "pdf-form"
    return f"{base}-{uuid.uuid4().hex[:6]}"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _read_pdf_pages(path: Path) -> List[PDFPage]:
    """Return page dimensions (PDF points) for each page."""
    reader = PdfReader(str(path))
    pages: List[PDFPage] = []
    for i, p in enumerate(reader.pages):
        box = p.mediabox
        pages.append(PDFPage(page=i + 1, width=float(box.width), height=float(box.height)))
    return pages


def _safe_filename(orig: str) -> str:
    name = re.sub(r"[^\w.\-]+", "_", orig)
    return name[:120] or "file"


# --------------------------------------------------------------------- PDF generation
def _hex_to_rgb(hex_color: str) -> tuple:
    h = hex_color.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    try:
        return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    except Exception:
        return (0, 0, 0)


def _draw_text(c: rl_canvas.Canvas, text: str, x: float, y: float, w: float, h: float,
               font: str, size: int, color_hex: str, alignment: str = "left") -> None:
    if not text:
        return
    try:
        c.setFont(font, size)
    except Exception:
        c.setFont("Helvetica", size)
    r, g, b = _hex_to_rgb(color_hex)
    c.setFillColorRGB(r, g, b)
    text = str(text)
    text_w = c.stringWidth(text, c._fontname, size)
    if alignment == "center":
        tx = x + (w - text_w) / 2
    elif alignment == "right":
        tx = x + w - text_w - 2
    else:
        tx = x + 2
    # vertically center (PDF y origin = bottom-left)
    baseline = y - h + (h - size) / 2 + size * 0.2
    c.drawString(tx, baseline, text)


def _draw_multiline(c: rl_canvas.Canvas, text: str, x: float, y: float, w: float, h: float,
                    font: str, size: int, color_hex: str) -> None:
    if not text:
        return
    try:
        c.setFont(font, size)
    except Exception:
        c.setFont("Helvetica", size)
    r, g, b = _hex_to_rgb(color_hex)
    c.setFillColorRGB(r, g, b)
    line_h = size * 1.2
    # naive wrap
    lines: List[str] = []
    for paragraph in str(text).split("\n"):
        words = paragraph.split(" ")
        cur = ""
        for word in words:
            test = (cur + " " + word).strip()
            if c.stringWidth(test, c._fontname, size) <= w - 4:
                cur = test
            else:
                if cur:
                    lines.append(cur)
                cur = word
        if cur:
            lines.append(cur)
    top = y - 2
    for i, line in enumerate(lines):
        ly = top - (i + 1) * line_h
        if ly < y - h:
            break
        c.drawString(x + 2, ly, line)


def _draw_signature(c: rl_canvas.Canvas, data_url: str, x: float, y: float, w: float, h: float) -> None:
    if not data_url or "," not in data_url:
        return
    try:
        b64 = data_url.split(",", 1)[1]
        raw = base64.b64decode(b64)
        from reportlab.lib.utils import ImageReader
        img = ImageReader(io.BytesIO(raw))
        c.drawImage(img, x, y - h, width=w, height=h, mask="auto", preserveAspectRatio=True, anchor="sw")
    except Exception as e:
        logger.warning(f"signature render failed: {e}")


def _draw_qr(c: rl_canvas.Canvas, text: str, x: float, y: float, w: float, h: float) -> None:
    if not text:
        return
    try:
        import qrcode as _qr
        img = _qr.make(str(text))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        from reportlab.lib.utils import ImageReader
        c.drawImage(ImageReader(buf), x, y - h, width=min(w, h), height=min(w, h), mask="auto")
    except Exception as e:
        logger.warning(f"qr render failed: {e}")


def _draw_barcode(c: rl_canvas.Canvas, text: str, x: float, y: float, w: float, h: float) -> None:
    if not text:
        return
    try:
        import barcode
        from barcode.writer import ImageWriter
        cls = barcode.get_barcode_class("code128")
        b = cls(str(text), writer=ImageWriter())
        buf = io.BytesIO()
        b.write(buf, options={"write_text": False})
        buf.seek(0)
        from reportlab.lib.utils import ImageReader
        c.drawImage(ImageReader(buf), x, y - h, width=w, height=h, mask="auto")
    except Exception as e:
        logger.warning(f"barcode render failed: {e}")


def _draw_checkbox(c: rl_canvas.Canvas, checked: bool, x: float, y: float, size: float,
                   color_hex: str = "#111827") -> None:
    r, g, b = _hex_to_rgb(color_hex)
    c.setStrokeColorRGB(r, g, b)
    c.setLineWidth(1)
    box = min(size, 14)
    bx = x + 2
    by = y - box - 2
    c.rect(bx, by, box, box, stroke=1, fill=0)
    if checked:
        c.setLineWidth(1.5)
        c.line(bx + 2, by + box / 2, bx + box / 2 - 1, by + 2)
        c.line(bx + box / 2 - 1, by + 2, bx + box - 2, by + box - 2)


def generate_completed_pdf(template_path: Path, fields: List[PDFField], values: Dict[str, Any],
                           output_path: Path) -> None:
    """Overlay field values on the original PDF and save to output_path.
    Original PDF is never modified; we merge a per-page overlay layer.
    """
    reader = PdfReader(str(template_path))
    writer = PdfWriter()

    # group fields per page
    by_page: Dict[int, List[PDFField]] = {}
    for f in fields:
        if not f.visible or f.type in ("divider", "hidden"):
            continue
        by_page.setdefault(int(f.page), []).append(f)

    for idx, page in enumerate(reader.pages, start=1):
        media = page.mediabox
        pw, ph = float(media.width), float(media.height)
        if idx in by_page:
            overlay_buf = io.BytesIO()
            c = rl_canvas.Canvas(overlay_buf, pagesize=(pw, ph))
            for f in by_page[idx]:
                # convert normalized top-left coords -> PDF points bottom-left
                x = f.x * pw
                top_y = ph - (f.y * ph)
                w = f.width * pw
                h = f.height * ph
                val = values.get(f.id, f.default_value if f.default_value is not None else "")
                if f.type in ("heading", "paragraph", "static_text"):
                    val = f.static_text or val or f.label
                ftype = f.type
                if ftype in ("short_text", "number", "email", "phone", "date", "time",
                             "url", "dropdown", "radio", "initial", "auto_number",
                             "calculation"):
                    _draw_text(c, val, x, top_y, w, h, f.font_family, f.font_size,
                               f.font_color, f.alignment)
                elif ftype in ("long_text", "paragraph", "static_text", "heading"):
                    _draw_multiline(c, val, x, top_y, w, h,
                                    f.font_family if ftype != "heading" else f.font_family,
                                    f.font_size if ftype != "heading" else max(f.font_size, 14),
                                    f.font_color)
                elif ftype == "signature":
                    if isinstance(val, str) and val.startswith("data:image"):
                        _draw_signature(c, val, x, top_y, w, h)
                    else:
                        _draw_text(c, val, x, top_y, w, h, f.font_family, f.font_size,
                                   f.font_color, f.alignment)
                elif ftype == "checkbox":
                    # val may be bool or list of selected options
                    if f.options:
                        selected = set(val if isinstance(val, list) else [])
                        line_h = max(f.font_size * 1.4, 14)
                        for i, opt in enumerate(f.options):
                            oy = top_y - i * line_h
                            _draw_checkbox(c, opt in selected, x, oy, line_h, f.font_color)
                            _draw_text(c, opt, x + line_h + 4, oy, w - line_h - 8,
                                       line_h, f.font_family, f.font_size, f.font_color, "left")
                    else:
                        _draw_checkbox(c, bool(val), x, top_y, h, f.font_color)
                elif ftype == "tick":
                    # Single yes/no with an inline label next to the box.
                    checked = val is True or val == "true" or val == 1 or val == "1"
                    box = max(min(h, f.font_size * 1.2), 12)
                    _draw_checkbox(c, checked, x, top_y, box, f.font_color)
                    lbl = getattr(f, "tick_label", None) or (f.placeholder or "Yes")
                    _draw_text(c, lbl, x + box + 4, top_y, w - box - 8, box,
                               f.font_family, f.font_size, f.font_color, "left")
                elif ftype == "qr_code":
                    _draw_qr(c, val, x, top_y, w, h)
                elif ftype == "barcode":
                    _draw_barcode(c, val, x, top_y, w, h)
                elif ftype == "image":
                    if isinstance(val, str) and val.startswith("data:image"):
                        try:
                            b64 = val.split(",", 1)[1]
                            from reportlab.lib.utils import ImageReader
                            img = ImageReader(io.BytesIO(base64.b64decode(b64)))
                            c.drawImage(img, x, top_y - h, width=w, height=h,
                                        mask="auto", preserveAspectRatio=True, anchor="sw")
                        except Exception as e:
                            logger.warning(f"image render failed: {e}")
                elif ftype == "file":
                    _draw_text(c, f"[file] {val}" if val else "", x, top_y, w, h,
                               f.font_family, f.font_size, f.font_color, f.alignment)
                elif ftype == "hidden":
                    continue
                else:
                    _draw_text(c, str(val) if val is not None else "", x, top_y, w, h,
                               f.font_family, f.font_size, f.font_color, f.alignment)
            c.showPage()
            c.save()
            overlay_buf.seek(0)
            overlay = PdfReader(overlay_buf)
            page.merge_page(overlay.pages[0])
        writer.add_page(page)

    with open(output_path, "wb") as fh:
        writer.write(fh)


# --------------------------------------------------------------------- router factory
def build_pdf_router(db, get_current_user, get_optional_user,
                     make_download_token=None, verify_download_token=None,
                     organize_submission_files=None,
                     _api_prefix="/api"):
    """Build the router; requires DB + auth deps from the main app.
    make_download_token / verify_download_token are injected from server.py so
    anonymous submitters can download their filled PDF via a short-lived token.
    organize_submission_files (async) moves referenced uploaded files into a
    per-submission folder on disk.
    """
    router = APIRouter(prefix="/pdf-forms")
    public = APIRouter(prefix="/public/pdf-forms")
    subs = APIRouter(prefix="/pdf-submissions")
    pub_subs = APIRouter(prefix="/public/pdf-submissions")

    def _owner_query(user) -> Dict[str, Any]:
        from permissions import form_filter, is_super_admin
        q: Dict[str, Any] = {"is_deleted": False}
        if is_super_admin(user):
            return q
        # Re-use the central form_filter — pdf_templates use the same
        # assignment columns (form_id == template_id semantically).
        rls = form_filter(user)
        # rename keys: form_filter uses form_id; pdf collection uses template_id
        rls_str = str(rls)
        if "'form_id'" in rls_str:
            import json as _json
            rls = _json.loads(_json.dumps(rls).replace('"form_id"', '"template_id"'))
        return {"$and": [q, rls]}

    async def _get_template_for_user(template_id: str, user, *, write: bool = False) -> dict:
        from permissions import can_edit_form, can_view_form, is_super_admin
        doc = await db.pdf_templates.find_one({"template_id": template_id, "is_deleted": False},
                                              {"_id": 0})
        if not doc:
            raise HTTPException(404, "Template not found")
        # Adapt doc to look like a Form doc for permission check (form_id alias)
        probe = {**doc, "form_id": doc.get("template_id")}
        if write:
            if not (is_super_admin(user) or can_edit_form(user, probe)):
                raise HTTPException(403, "You do not have permission to edit this PDF form")
        else:
            if not (is_super_admin(user) or can_view_form(user, probe)):
                raise HTTPException(403, "You do not have permission to view this PDF form")
        return doc

    # --- Upload (creates a new template from a PDF) -----------------------
    @router.post("/upload", response_model=PDFTemplate)
    async def upload_pdf(file: UploadFile = File(...),
                         title: Optional[str] = Form(None),
                         user=Depends(get_current_user)):
        data = await file.read()
        if not data:
            raise HTTPException(400, "Empty file")
        if len(data) > MAX_PDF_MB * 1024 * 1024:
            raise HTTPException(413, f"PDF exceeds {MAX_PDF_MB}MB")
        if not (file.filename or "").lower().endswith(".pdf"):
            raise HTTPException(400, "Only .pdf files are accepted")
        if not data[:4] == b"%PDF":
            raise HTTPException(400, "File is not a valid PDF")
        # save
        storage_name = f"{uuid.uuid4().hex}.pdf"
        target = PDF_DIR / storage_name
        target.write_bytes(data)
        try:
            pages = _read_pdf_pages(target)
        except Exception as e:
            target.unlink(missing_ok=True)
            raise HTTPException(400, f"Could not read PDF: {e}")
        tid = f"pdftpl_{uuid.uuid4().hex[:12]}"
        t = title or Path(file.filename).stem or "Untitled PDF Form"
        now = _now()
        doc = {
            "template_id": tid,
            "slug": _slug(t),
            "owner_id": user.user_id,
            "title": t,
            "description": "",
            "fields": [],
            "pages": [p.model_dump() for p in pages],
            "settings": {},
            "status": "draft",
            "version": 1,
            "original_filename": _safe_filename(file.filename),
            "storage_filename": storage_name,
            "file_size": len(data),
            "created_at": now,
            "updated_at": now,
            "is_deleted": False,
            "is_archived": False,
        }
        await db.pdf_templates.insert_one(doc)
        doc.pop("_id", None)
        return PDFTemplate(**doc)

    # --- List ------------------------------------------------------------
    @router.get("", response_model=List[PDFTemplate])
    async def list_templates(archived: bool = False, q: Optional[str] = None,
                             user=Depends(get_current_user)):
        query = _owner_query(user)
        query["is_archived"] = archived
        if q:
            query["title"] = {"$regex": q, "$options": "i"}
        rows = await db.pdf_templates.find(query, {"_id": 0}).sort("updated_at", -1).to_list(500)
        return [PDFTemplate(**r) for r in rows]

    @router.get("/{template_id}", response_model=PDFTemplate)
    async def get_template(template_id: str, user=Depends(get_current_user)):
        return PDFTemplate(**await _get_template_for_user(template_id, user))

    @router.put("/{template_id}", response_model=PDFTemplate)
    async def update_template(template_id: str, body: PDFTemplateIn, user=Depends(get_current_user)):
        existing = await _get_template_for_user(template_id, user, write=True)
        updates = body.model_dump()
        # validate field types
        for f in updates.get("fields", []):
            if f.get("type") not in PDF_FIELD_TYPES:
                raise HTTPException(400, f"Invalid field type: {f.get('type')}")
        updates["updated_at"] = _now()
        # bump version if fields changed
        if updates.get("fields") != existing.get("fields"):
            updates["version"] = int(existing.get("version", 1)) + 1
        await db.pdf_templates.update_one({"template_id": template_id}, {"$set": updates})
        existing.update(updates)
        return PDFTemplate(**existing)

    @router.patch("/{template_id}", response_model=PDFTemplate)
    async def patch_template(template_id: str, body: PDFTemplatePatch, user=Depends(get_current_user)):
        existing = await _get_template_for_user(template_id, user, write=True)
        upd = {k: v for k, v in body.model_dump().items() if v is not None}
        if upd.get("status") and upd["status"] not in ("draft", "published", "archived"):
            raise HTTPException(400, "Invalid status")
        upd["updated_at"] = _now()
        await db.pdf_templates.update_one({"template_id": template_id}, {"$set": upd})
        existing.update(upd)
        return PDFTemplate(**existing)

    @router.delete("/{template_id}")
    async def delete_template(template_id: str, user=Depends(get_current_user)):
        await _get_template_for_user(template_id, user, write=True)
        await db.pdf_templates.update_one({"template_id": template_id},
                                          {"$set": {"is_deleted": True, "updated_at": _now()}})
        return {"ok": True}

    @router.get("/{template_id}/file")
    async def download_template_file(template_id: str, user=Depends(get_current_user)):
        doc = await _get_template_for_user(template_id, user)
        path = PDF_DIR / doc["storage_filename"]
        if not path.exists():
            raise HTTPException(404, "Original PDF missing")
        data = path.read_bytes()
        return Response(content=data, media_type="application/pdf",
                        headers={"Content-Disposition":
                                 f'inline; filename="{doc["original_filename"]}"'})

    @router.post("/{template_id}/duplicate", response_model=PDFTemplate)
    async def duplicate_template(template_id: str, user=Depends(get_current_user)):
        existing = await _get_template_for_user(template_id, user)
        new_id = f"pdftpl_{uuid.uuid4().hex[:12]}"
        new_storage = f"{uuid.uuid4().hex}.pdf"
        src = PDF_DIR / existing["storage_filename"]
        if src.exists():
            (PDF_DIR / new_storage).write_bytes(src.read_bytes())
        now = _now()
        new_doc = {**existing,
                   "template_id": new_id,
                   "slug": _slug(existing["title"]),
                   "title": existing["title"] + " (Copy)",
                   "owner_id": user.user_id,
                   "storage_filename": new_storage,
                   "created_at": now, "updated_at": now,
                   "is_archived": False, "is_deleted": False,
                   "status": "draft", "version": 1}
        new_doc.pop("_id", None)
        await db.pdf_templates.insert_one(new_doc)
        new_doc.pop("_id", None)
        return PDFTemplate(**new_doc)

    # --- Public submit ----------------------------------------------------
    @public.get("/{slug}")
    async def public_get(slug: str):
        doc = await db.pdf_templates.find_one({"slug": slug, "is_deleted": False},
                                              {"_id": 0, "owner_id": 0})
        if not doc:
            raise HTTPException(404, "Form not found")
        if doc.get("status") != "published":
            raise HTTPException(403, "Form is not published")
        return doc

    @public.get("/{slug}/file")
    async def public_get_file(slug: str):
        doc = await db.pdf_templates.find_one({"slug": slug, "is_deleted": False}, {"_id": 0})
        if not doc or doc.get("status") != "published":
            raise HTTPException(404, "Form not available")
        path = PDF_DIR / doc["storage_filename"]
        if not path.exists():
            raise HTTPException(404, "Original PDF missing")
        return Response(content=path.read_bytes(), media_type="application/pdf",
                        headers={"Content-Disposition":
                                 f'inline; filename="{doc["original_filename"]}"'})

    @public.post("/{slug}/submit")
    async def public_submit(slug: str, body: PDFSubmissionIn, request: Request,
                            viewer=Depends(get_optional_user)):
        tpl = await db.pdf_templates.find_one({"slug": slug, "is_deleted": False}, {"_id": 0})
        if not tpl:
            raise HTTPException(404, "Form not found")
        if tpl.get("status") != "published":
            raise HTTPException(403, "Form not accepting submissions")
        # validate required
        for f in tpl.get("fields", []):
            if f.get("required") and f.get("type") not in (
                    "heading", "paragraph", "static_text", "divider", "hidden"):
                v = body.values.get(f["id"])
                if v is None or v == "" or (isinstance(v, list) and len(v) == 0):
                    raise HTTPException(400, f"'{f.get('label') or f['id']}' is required")
        # generate completed PDF
        src = PDF_DIR / tpl["storage_filename"]
        sid = f"pdfsub_{uuid.uuid4().hex[:12]}"
        out_name = f"{sid}.pdf"
        out_path = COMPLETED_DIR / out_name
        try:
            field_models = [PDFField(**f) for f in tpl.get("fields", [])]
            generate_completed_pdf(src, field_models, body.values, out_path)
        except Exception as e:
            logger.exception("PDF generation failed")
            raise HTTPException(500, f"PDF generation failed: {e}")
        doc = {
            "submission_id": sid,
            "template_id": tpl["template_id"],
            "template_version": int(tpl.get("version", 1)),
            "values": body.values,
            "submitted_by": viewer.user_id if viewer else None,
            "submitted_by_email": body.values.get("__email__"),
            "submitted_by_name": body.values.get("__name__"),
            "ip": request.client.host if request.client else None,
            "user_agent": request.headers.get("user-agent"),
            "completed_filename": out_name,
            "status": "submitted",
            "created_at": _now(),
        }
        await db.pdf_submissions.insert_one(doc)
        doc.pop("_id", None)
        # Move any referenced uploads into /submissions/{sid}/ on disk
        if organize_submission_files:
            try:
                await organize_submission_files(sid, body.values)
            except Exception as _e:  # noqa: BLE001
                logger.warning(f"file organization failed for {sid}: {_e}")
        # fire workflow trigger
        try:
            from workflow_routes import fire_trigger as _ft
            await _ft(db, "pdf_submitted",
                      {"submission_id": sid, "template_id": tpl["template_id"],
                       "form_name": tpl.get("title"), "values": body.values,
                       "submission_kind": "pdf",
                       "user_id": viewer.user_id if viewer else None,
                       "user_email": viewer.email if viewer else None,
                       "ip": doc.get("ip")})
        except Exception:
            pass
        # Short-lived download token for anonymous submitter
        token = make_download_token(sid, kind="pdf") if make_download_token else None
        payload = PDFSubmission(**doc).model_dump()
        if token:
            payload["download_token"] = token
        return payload

    # --- Public download of the filled PDF (token-scoped, anonymous-safe) ---
    @pub_subs.get("/{submission_id}/completed")
    async def public_download_completed(submission_id: str, token: str):
        if not verify_download_token:
            raise HTTPException(500, "Download token verifier not configured")
        verify_download_token(token, submission_id, kind="pdf")
        sub = await db.pdf_submissions.find_one({"submission_id": submission_id}, {"_id": 0})
        if not sub:
            raise HTTPException(404, "Not found")
        tpl = await db.pdf_templates.find_one(
            {"template_id": sub["template_id"], "is_deleted": False}, {"_id": 0},
        )
        if not tpl:
            raise HTTPException(404, "Parent template missing")
        path = COMPLETED_DIR / (sub.get("completed_filename") or "")
        if not path.exists():
            raise HTTPException(404, "Completed PDF missing")
        return Response(content=path.read_bytes(), media_type="application/pdf",
                        headers={"Content-Disposition":
                                 f'attachment; filename="{tpl["title"]}-{submission_id}.pdf"'})

    # --- Submissions (owner) ---------------------------------------------
    @router.get("/{template_id}/submissions", response_model=List[PDFSubmission])
    async def list_subs(template_id: str, user=Depends(get_current_user)):
        await _get_template_for_user(template_id, user)
        rows = await db.pdf_submissions.find({"template_id": template_id}, {"_id": 0}) \
            .sort("created_at", -1).to_list(2000)
        return [PDFSubmission(**r) for r in rows]

    @subs.get("/{submission_id}", response_model=PDFSubmission)
    async def get_sub(submission_id: str, user=Depends(get_current_user)):
        sub = await db.pdf_submissions.find_one({"submission_id": submission_id}, {"_id": 0})
        if not sub:
            raise HTTPException(404, "Submission not found")
        await _get_template_for_user(sub["template_id"], user)
        return PDFSubmission(**sub)

    @subs.delete("/{submission_id}")
    async def del_sub(submission_id: str, user=Depends(get_current_user)):
        sub = await db.pdf_submissions.find_one({"submission_id": submission_id}, {"_id": 0})
        if not sub:
            raise HTTPException(404, "Not found")
        await _get_template_for_user(sub["template_id"], user)
        if sub.get("completed_filename"):
            (COMPLETED_DIR / sub["completed_filename"]).unlink(missing_ok=True)
        await db.pdf_submissions.delete_one({"submission_id": submission_id})
        return {"ok": True}

    async def _can_view_submission(user, sub: Dict[str, Any]) -> bool:
        """Submitter + their vendor_admin can view a PDF submission's completed
        PDF; anyone with RLS access to the parent template can also view."""
        from permissions import normalize_role, is_super_admin
        if is_super_admin(user):
            return True
        if sub.get("submitted_by") == getattr(user, "user_id", None):
            return True
        role = normalize_role(getattr(user, "role", ""))
        if role == "vendor_admin" and getattr(user, "vendor_id", None):
            submitter = await db.users.find_one(
                {"user_id": sub.get("submitted_by")},
                {"_id": 0, "vendor_id": 1},
            )
            if submitter and submitter.get("vendor_id") == user.vendor_id:
                return True
        return False

    @subs.get("/{submission_id}/completed")
    async def download_completed(submission_id: str, user=Depends(get_current_user)):
        sub = await db.pdf_submissions.find_one({"submission_id": submission_id}, {"_id": 0})
        if not sub:
            raise HTTPException(404, "Not found")
        # Allow submitter + vendor_admin fall-through in addition to RLS
        tpl = None
        if await _can_view_submission(user, sub):
            tpl = await db.pdf_templates.find_one(
                {"template_id": sub["template_id"], "is_deleted": False}, {"_id": 0},
            )
        if not tpl:
            tpl = await _get_template_for_user(sub["template_id"], user)
        path = COMPLETED_DIR / (sub.get("completed_filename") or "")
        if not path.exists():
            raise HTTPException(404, "Completed PDF missing")
        return Response(content=path.read_bytes(), media_type="application/pdf",
                        headers={"Content-Disposition":
                                 f'attachment; filename="{tpl["title"]}-{submission_id}.pdf"'})

    @subs.get("/{submission_id}/original")
    async def download_original(submission_id: str, user=Depends(get_current_user)):
        sub = await db.pdf_submissions.find_one({"submission_id": submission_id}, {"_id": 0})
        if not sub:
            raise HTTPException(404, "Not found")
        tpl = await _get_template_for_user(sub["template_id"], user)
        path = PDF_DIR / tpl["storage_filename"]
        if not path.exists():
            raise HTTPException(404, "Original PDF missing")
        return Response(content=path.read_bytes(), media_type="application/pdf",
                        headers={"Content-Disposition":
                                 f'attachment; filename="{tpl["original_filename"]}"'})

    # --- Excel export (per PDF template) ---------------------------------
    @router.get("/{template_id}/submissions/export.xlsx")
    async def export_pdf_subs_xlsx(template_id: str, user=Depends(get_current_user)):
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill
        tpl = await _get_template_for_user(template_id, user)
        rows = await db.pdf_submissions.find({"template_id": template_id}, {"_id": 0}) \
            .sort("created_at", 1).to_list(5000)
        skip_types = ("heading", "paragraph", "static_text", "divider", "hidden")
        fields = [f for f in (tpl.get("fields") or []) if f.get("type") not in skip_types]
        field_ids = [f["id"] for f in fields]
        field_labels = {f["id"]: (f.get("label") or f.get("name") or f["id"]) for f in fields}

        wb = Workbook()
        ws = wb.active
        ws.title = (tpl.get("title") or "Submissions")[:31]
        header_font = Font(bold=True, color="FFFFFF")
        header_fill = PatternFill("solid", fgColor="7C3AED")
        sub_font = Font(italic=True, color="475569")
        label_row = ["Submission ID", "Status", "Submitted At", "Submitted By"] + \
                    [field_labels[fid] for fid in field_ids]
        key_row = ["submission_id", "status", "created_at", "submitted_by"] + field_ids
        ws.append(label_row)
        ws.append(key_row)
        for cell in ws[1]:
            cell.font = header_font
            cell.fill = header_fill
        for cell in ws[2]:
            cell.font = sub_font

        def _val(v):
            if v is None:
                return ""
            if isinstance(v, (list, tuple)):
                return ", ".join(str(x) for x in v)
            if isinstance(v, dict):
                if "filename" in v:
                    return str(v["filename"])
                return str(v)
            if isinstance(v, str) and v.startswith("data:image"):
                return "[signature image]"
            return v

        for r in rows:
            vals = r.get("values") or {}
            ws.append(
                [r.get("submission_id"), r.get("status"), r.get("created_at"),
                 r.get("submitted_by_name") or r.get("submitted_by_email") or r.get("submitted_by") or ""] +
                [_val(vals.get(fid, "")) for fid in field_ids],
            )
        for col in ws.columns:
            w = max((len(str(c.value or "")) for c in col), default=8)
            ws.column_dimensions[col[0].column_letter].width = min(max(w + 2, 12), 48)

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        safe_slug = tpl.get("slug") or template_id
        return Response(
            content=buf.getvalue(),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{safe_slug}-submissions.xlsx"'},
        )

    # --- Image asset upload (for image/signature fields in builder) -------
    @router.post("/assets/upload")
    async def upload_asset(file: UploadFile = File(...), user=Depends(get_current_user)):
        data = await file.read()
        if len(data) > 8 * 1024 * 1024:
            raise HTTPException(413, "Asset exceeds 8MB")
        ext = (file.filename.rsplit(".", 1)[-1] if "." in file.filename else "bin").lower()
        fid = f"{uuid.uuid4().hex}.{ext}"
        (ASSET_DIR / fid).write_bytes(data)
        return {"url": f"/api/pdf-forms/assets/{fid}", "filename": file.filename}

    @router.get("/assets/{fid}")
    async def get_asset(fid: str):
        path = ASSET_DIR / _safe_filename(fid)
        if not path.exists():
            raise HTTPException(404, "Asset not found")
        ct = "image/png" if fid.lower().endswith(".png") else "image/jpeg"
        return Response(content=path.read_bytes(), media_type=ct)

    return router, public, subs, pub_subs
