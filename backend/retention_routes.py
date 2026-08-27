"""
PDF Retention Lifecycle Routes
===============================

Manages automatic PDF file cleanup policies per form / PDF template.

Key principle
─────────────
  • MongoDB submission *data* is NEVER deleted by the retention system.
    Only the cached static .pdf files on disk are purged to recover storage.
  • When a user downloads a "purged" submission, the backend regenerates the
    PDF on-the-fly from the stored field values + the base template file.

Retention Policy Model
─────────────────────
  Stored in  db.settings  (key "_id": "global")  under  "pdf_retention":
    {
      "enabled": false,                    // master ON/OFF toggle
      "default_days": 180                  // days used when per-form has none
    }

  Per-form overrides stored in:
    db.pdf_templates  →  field "retention" (PDF template forms)
    db.forms          →  field "retention" (standard dynamic forms)

  "retention" object:
    {
      "enabled": true,
      "days": 180       // purge physical PDFs older than this many days
    }

Endpoints
─────────
  GET  /api/retention/overview
  GET  /api/retention/forms
  PUT  /api/retention/forms/{form_id}
  PUT  /api/retention/global
  POST /api/retention/cleanup          query: dry_run=true|false
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

logger = logging.getLogger("formforge.retention")

UPLOAD_DIR     = Path(os.environ.get("UPLOAD_DIR", "/app/backend/uploads"))
COMPLETED_DIR  = Path(os.environ.get("LOCAL_COMPLETED_PDF_ROOT", str(UPLOAD_DIR / "completed")))
PDF_DIR        = Path(os.environ.get("LOCAL_PDF_TEMPLATES_ROOT",  str(UPLOAD_DIR / "pdf")))


# ─────────────────────────────────────────────────────────── Pydantic models ──

class RetentionPolicy(BaseModel):
    enabled: bool = False
    days: int = 180


class FormRetentionEntry(BaseModel):
    form_id: str
    form_type: str           # "pdf_template" | "standard_form"
    title: str
    created_at: str
    submission_count: int = 0
    physical_pdf_count: int = 0
    physical_pdf_size_bytes: int = 0
    purged_count: int = 0    # submissions whose completed_filename no longer exists on disk
    retention: RetentionPolicy = RetentionPolicy()


class GlobalRetentionIn(BaseModel):
    enabled: bool = False
    default_days: int = 180
    apply_to_all: bool = False   # if True, overwrite every form's retention.days


class FormRetentionIn(BaseModel):
    enabled: bool
    days: int


class CleanupResult(BaseModel):
    dry_run: bool
    forms_scanned: int
    files_eligible: int
    bytes_eligible: int
    files_deleted: int
    bytes_freed: int
    errors: List[str] = []


class RetentionOverview(BaseModel):
    master_enabled: bool
    default_days: int
    total_forms: int
    total_pdf_templates: int
    total_submissions: int
    total_pdf_files_on_disk: int
    total_pdf_bytes_on_disk: int
    total_purged_count: int     # submissions whose file is already purged
    forms_with_retention_on: int


# ─────────────────────────────────────────────────────── helper: disk stats ──

def _completed_file_stat(filename: Optional[str]) -> Optional[int]:
    """Return file size in bytes or None if file does not exist."""
    if not filename:
        return None
    p = COMPLETED_DIR / filename
    if p.exists():
        return p.stat().st_size
    return None


def _get_effective_days(form_retention: Dict[str, Any], global_default: int) -> int:
    if form_retention.get("enabled") and form_retention.get("days", 0) > 0:
        return int(form_retention["days"])
    return global_default


# ─────────────────────────────────────────────────────────────────── builder ──

def build_retention_router(db, get_current_user):

    router = APIRouter(prefix="/retention", tags=["Retention"])

    async def _get_global_retention() -> Dict[str, Any]:
        s = await db.settings.find_one({"_id": "global"}, {"_id": 0, "pdf_retention": 1}) or {}
        return s.get("pdf_retention") or {"enabled": False, "default_days": 180}

    # ─────────────────────────────────── GET /overview ──────────────────────
    @router.get("/overview", response_model=RetentionOverview)
    async def retention_overview(user=Depends(get_current_user)):
        _require_admin(user)
        gr = await _get_global_retention()

        total_forms    = await db.forms.count_documents({"is_deleted": False})
        total_pdf_tpls = await db.pdf_templates.count_documents({"is_deleted": False})
        total_subs_std = await db.submissions.count_documents({})
        total_subs_pdf = await db.pdf_submissions.count_documents({})
        total_subs     = total_subs_std + total_subs_pdf

        # Physical PDF files on disk
        pdf_files = list(COMPLETED_DIR.glob("*.pdf")) if COMPLETED_DIR.exists() else []
        total_pdf_bytes = sum(f.stat().st_size for f in pdf_files if f.is_file())

        # Count purged (submission exists in DB but file missing on disk)
        pdf_subs = await db.pdf_submissions.find(
            {"completed_filename": {"$exists": True, "$ne": None}},
            {"_id": 0, "completed_filename": 1}
        ).to_list(None)
        purged = sum(
            1 for s in pdf_subs
            if s.get("completed_filename") and
               not (COMPLETED_DIR / s["completed_filename"]).exists()
        )

        # Forms with retention on
        forms_on  = await db.forms.count_documents({"is_deleted": False, "retention.enabled": True})
        tpls_on   = await db.pdf_templates.count_documents({"is_deleted": False, "retention.enabled": True})

        return RetentionOverview(
            master_enabled=gr.get("enabled", False),
            default_days=gr.get("default_days", 180),
            total_forms=total_forms,
            total_pdf_templates=total_pdf_tpls,
            total_submissions=total_subs,
            total_pdf_files_on_disk=len(pdf_files),
            total_pdf_bytes_on_disk=total_pdf_bytes,
            total_purged_count=purged,
            forms_with_retention_on=forms_on + tpls_on,
        )

    # ─────────────────────────────────── GET /forms ─────────────────────────
    @router.get("/forms", response_model=List[FormRetentionEntry])
    async def list_retention_forms(user=Depends(get_current_user)):
        _require_admin(user)
        entries: List[FormRetentionEntry] = []

        # ── PDF Templates ──
        pdf_templates = await db.pdf_templates.find(
            {"is_deleted": False},
            {"_id": 0, "template_id": 1, "title": 1, "created_at": 1, "retention": 1}
        ).to_list(None)

        for tpl in pdf_templates:
            tid = tpl["template_id"]
            subs = await db.pdf_submissions.find(
                {"template_id": tid},
                {"_id": 0, "completed_filename": 1}
            ).to_list(None)

            physical_count = 0
            physical_bytes = 0
            purged_count   = 0
            for s in subs:
                sz = _completed_file_stat(s.get("completed_filename"))
                if sz is not None:
                    physical_count += 1
                    physical_bytes += sz
                elif s.get("completed_filename"):
                    purged_count += 1

            ret = tpl.get("retention") or {}
            entries.append(FormRetentionEntry(
                form_id=tid,
                form_type="pdf_template",
                title=tpl.get("title", "Untitled"),
                created_at=tpl.get("created_at", ""),
                submission_count=len(subs),
                physical_pdf_count=physical_count,
                physical_pdf_size_bytes=physical_bytes,
                purged_count=purged_count,
                retention=RetentionPolicy(
                    enabled=ret.get("enabled", False),
                    days=ret.get("days", 180),
                ),
            ))

        # ── Standard Forms ──
        forms = await db.forms.find(
            {"is_deleted": False},
            {"_id": 0, "form_id": 1, "title": 1, "created_at": 1, "retention": 1}
        ).to_list(None)

        for frm in forms:
            fid = frm["form_id"]
            sub_count = await db.submissions.count_documents({"form_id": fid})
            ret = frm.get("retention") or {}
            # Standard forms don't cache physical PDFs (generated on-the-fly)
            entries.append(FormRetentionEntry(
                form_id=fid,
                form_type="standard_form",
                title=frm.get("title", "Untitled"),
                created_at=frm.get("created_at", ""),
                submission_count=sub_count,
                physical_pdf_count=0,
                physical_pdf_size_bytes=0,
                purged_count=0,
                retention=RetentionPolicy(
                    enabled=ret.get("enabled", False),
                    days=ret.get("days", 180),
                ),
            ))

        return entries

    # ─────────────────────────────────── PUT /forms/{form_id} ───────────────
    @router.put("/forms/{form_id}", response_model=FormRetentionEntry)
    async def update_form_retention(
        form_id: str,
        body: FormRetentionIn,
        user=Depends(get_current_user),
    ):
        _require_admin(user)
        ret_doc = {"enabled": body.enabled, "days": max(1, body.days)}

        # Try PDF template first
        tpl = await db.pdf_templates.find_one_and_update(
            {"template_id": form_id, "is_deleted": False},
            {"$set": {"retention": ret_doc}},
            return_document=True,
        )
        if tpl:
            subs = await db.pdf_submissions.find(
                {"template_id": form_id},
                {"_id": 0, "completed_filename": 1}
            ).to_list(None)
            physical_count, physical_bytes, purged_count = 0, 0, 0
            for s in subs:
                sz = _completed_file_stat(s.get("completed_filename"))
                if sz is not None:
                    physical_count += 1
                    physical_bytes += sz
                elif s.get("completed_filename"):
                    purged_count += 1
            return FormRetentionEntry(
                form_id=form_id, form_type="pdf_template",
                title=tpl.get("title", ""), created_at=tpl.get("created_at", ""),
                submission_count=len(subs),
                physical_pdf_count=physical_count, physical_pdf_size_bytes=physical_bytes,
                purged_count=purged_count,
                retention=RetentionPolicy(**ret_doc),
            )

        # Try standard form
        frm = await db.forms.find_one_and_update(
            {"form_id": form_id, "is_deleted": False},
            {"$set": {"retention": ret_doc}},
            return_document=True,
        )
        if frm:
            sub_count = await db.submissions.count_documents({"form_id": form_id})
            return FormRetentionEntry(
                form_id=form_id, form_type="standard_form",
                title=frm.get("title", ""), created_at=frm.get("created_at", ""),
                submission_count=sub_count, physical_pdf_count=0,
                physical_pdf_size_bytes=0, purged_count=0,
                retention=RetentionPolicy(**ret_doc),
            )

        raise HTTPException(404, "Form or PDF template not found")

    # ─────────────────────────────────── PUT /global ────────────────────────
    @router.put("/global")
    async def update_global_retention(
        body: GlobalRetentionIn,
        user=Depends(get_current_user),
    ):
        _require_admin(user)
        gr_doc = {"enabled": body.enabled, "default_days": max(1, body.default_days)}
        await db.settings.update_one(
            {"_id": "global"},
            {"$set": {"pdf_retention": gr_doc}},
            upsert=True,
        )

        if body.apply_to_all:
            bulk_ret = {"enabled": True, "days": body.default_days}
            await db.pdf_templates.update_many(
                {"is_deleted": False},
                {"$set": {"retention": bulk_ret}},
            )
            await db.forms.update_many(
                {"is_deleted": False},
                {"$set": {"retention": bulk_ret}},
            )

        return {"ok": True, "pdf_retention": gr_doc, "applied_to_all": body.apply_to_all}

    # ─────────────────────────────────── POST /cleanup ──────────────────────
    @router.post("/cleanup", response_model=CleanupResult)
    async def run_retention_cleanup(
        dry_run: bool = Query(default=False, description="If true, simulate only (no files deleted)"),
        user=Depends(get_current_user),
    ):
        _require_admin(user)
        return await _execute_retention_cleanup(db, dry_run=dry_run)

    return router


# ──────────────────────────────────────── shared cleanup engine ───────────────

async def _execute_retention_cleanup(db, *, dry_run: bool = False) -> CleanupResult:
    """
    Core retention engine.  Called both from the API endpoint and the cron job.
    Returns a CleanupResult describing what was / would be cleaned.
    """
    gr = {}
    s_doc = await db.settings.find_one({"_id": "global"}, {"_id": 0, "pdf_retention": 1})
    if s_doc:
        gr = s_doc.get("pdf_retention") or {}

    if not gr.get("enabled"):
        logger.info("PDF retention is disabled globally — skipping cleanup.")
        return CleanupResult(dry_run=dry_run, forms_scanned=0, files_eligible=0,
                             bytes_eligible=0, files_deleted=0, bytes_freed=0)

    global_default_days = int(gr.get("default_days", 180))
    now = datetime.now(timezone.utc)

    forms_scanned  = 0
    files_eligible = 0
    bytes_eligible = 0
    files_deleted  = 0
    bytes_freed    = 0
    errors: List[str] = []

    # ── PDF Templates ─────────────────────────────────────────────────────────
    pdf_templates = await db.pdf_templates.find(
        {"is_deleted": False},
        {"_id": 0, "template_id": 1, "retention": 1}
    ).to_list(None)

    for tpl in pdf_templates:
        forms_scanned += 1
        ret = tpl.get("retention") or {}
        effective_days = _get_effective_days(ret, global_default_days)

        cutoff = now - timedelta(days=effective_days)
        # Find submissions older than the cutoff that still have a completed file
        subs = await db.pdf_submissions.find(
            {"template_id": tpl["template_id"],
             "completed_filename": {"$exists": True, "$ne": None}},
            {"_id": 0, "submission_id": 1, "completed_filename": 1, "created_at": 1}
        ).to_list(None)

        for sub in subs:
            try:
                created = _parse_dt(sub.get("created_at", ""))
                if created is None or created > cutoff:
                    continue
                filename = sub.get("completed_filename", "")
                if not filename:
                    continue
                path = COMPLETED_DIR / filename
                if not path.exists():
                    continue

                size = path.stat().st_size
                files_eligible += 1
                bytes_eligible += size

                if not dry_run:
                    try:
                        path.unlink(missing_ok=True)
                        # Mark the submission so we know the file was intentionally purged
                        await db.pdf_submissions.update_one(
                            {"submission_id": sub["submission_id"]},
                            {"$set": {"pdf_purged": True, "pdf_purged_at": now.isoformat()}},
                        )
                        files_deleted += 1
                        bytes_freed   += size
                        logger.info(f"Retention: purged {filename} ({size} bytes)")
                    except Exception as e:
                        errors.append(f"Failed to delete {filename}: {e}")
                        logger.warning(f"Retention: error deleting {filename}: {e}")
            except Exception as e:
                errors.append(f"Error processing sub {sub.get('submission_id')}: {e}")

    return CleanupResult(
        dry_run=dry_run,
        forms_scanned=forms_scanned,
        files_eligible=files_eligible,
        bytes_eligible=bytes_eligible,
        files_deleted=files_deleted,
        bytes_freed=bytes_freed,
        errors=errors,
    )


def _parse_dt(s: str) -> Optional[datetime]:
    """Parse ISO 8601 string into an aware datetime or return None."""
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, TypeError):
        return None


def _require_admin(user):
    if not hasattr(user, "role") or user.role not in ("super_admin", "admin"):
        raise HTTPException(403, "Admin access required")
