"""
Submission filename resolver
============================

Resolves per-form filename templates with placeholder tokens into a real
filesystem-safe filename for the downloadable submission (PDF or export).

Placeholders supported:
    {form_name}       — form title (from the parent form / PDF template)
    {asset_id}        — plant identifier resolved from submission values
                        (site_code / site_id / asset_id / plant_code)
    {submitter_name}  — submitter's display name (falls back to email prefix)
    {datetime}        — YYYY-MM-DD_HHMM in UTC
    {date}            — YYYY-MM-DD (kept for backwards-compat, un-listed)
    {time}            — HHMM      (kept for backwards-compat, un-listed)
    {submission_id}   — safety fallback
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Dict, Optional


# Default per-form template. Applied when the form's `filename_template`
# is empty or missing. Selected by the user (option 3a from the spec).
DEFAULT_FILENAME_TEMPLATE = "{asset_id}_{submitter_name}_{datetime}"


_FS_UNSAFE_RE = re.compile(r"[^A-Za-z0-9 _.\-()&+,]")


def _sanitize(part: str) -> str:
    """Best-effort filesystem-safe token — unsafe chars → underscore, then
    collapse runs and strip leading/trailing separators."""
    cleaned = _FS_UNSAFE_RE.sub("_", (part or "").strip())
    cleaned = re.sub(r"_+", "_", cleaned).strip("._ ")
    return cleaned


def _pick(d: Dict[str, Any], keys) -> str:
    for k in keys:
        v = d.get(k)
        if v not in (None, ""):
            return str(v)
    return ""


# Keywords that indicate a field holds a site/plant identifier.
# Matched case-insensitively against the field's *label* text.
_SITE_LABEL_KEYWORDS = (
    "site code", "plant code", "asset id", "asset code", "plant id",
    "sitecode", "plantcode", "assetid", "site_code", "plant_code",
    "plant name", "site name", "plant", "site",
)


def _pick_by_label(
    form_fields: list,
    values: Dict[str, Any],
) -> str:
    """Scan *form_fields* for a short-text field whose label contains a
    site/plant keyword, then return the submitted value for that field ID.
    Returns empty string when nothing matches."""
    for field in (form_fields or []):
        label = (field.get("label") or "").strip().lower()
        if any(kw in label for kw in _SITE_LABEL_KEYWORDS):
            fid = field.get("id")
            if fid:
                v = values.get(fid)
                if v not in (None, ""):
                    # For a combined field like "Alpha Solar 50MW" or "Alpha Solar 50MW 65",
                    # return the full value so we can try matching by site_name in the DB
                    return str(v).strip()
    return ""


def resolve_filename(
    template: Optional[str],
    *,
    form: Dict[str, Any],
    submission: Dict[str, Any],
    submitter: Optional[Any] = None,
    extension: str = "pdf",
) -> str:
    """Return a sanitized filename derived from `template` (or the global
    default) using tokens sourced from `form`, `submission` and the
    optional `submitter` object.  Missing placeholders silently collapse
    (option 5a).  The returned name never contains a path separator.
    """
    tpl = (template or "").strip() or DEFAULT_FILENAME_TEMPLATE
    values = submission.get("values") or {}

    # --- Token values ------------------------------------------------------
    form_name = form.get("title") or form.get("form_name") or form.get("name") or ""
    asset_id = _pick(values, [
        "site_code", "site_id", "asset_id", "plant_code",
        "plantId", "asset_code", "site",
    ])
    submitter_name = submission.get("submitted_by_name") or ""
    if not submitter_name and submitter is not None:
        submitter_name = getattr(submitter, "name", "") or ""
    if not submitter_name:
        # Fall back to the email prefix so anonymous exports still get
        # a meaningful token instead of collapsing to nothing.
        email = submission.get("submitted_by_email") or ""
        if not email and submitter is not None:
            email = getattr(submitter, "email", "") or ""
        if email and "@" in email:
            submitter_name = email.split("@", 1)[0]

    try:
        when = datetime.fromisoformat(str(submission.get("created_at")).replace("Z", "+00:00"))
    except Exception:
        when = datetime.now(timezone.utc)

    tokens = {
        "form_name":      _sanitize(form_name),
        "asset_id":       _sanitize(asset_id),
        "submitter_name": _sanitize(submitter_name),
        "datetime":       when.strftime("%Y-%m-%d_%H%M"),
        "date":           when.strftime("%Y-%m-%d"),
        "time":           when.strftime("%H%M"),
        "submission_id":  submission.get("submission_id", ""),
    }

    # --- Substitute --------------------------------------------------------
    def _repl(match: "re.Match") -> str:
        return tokens.get(match.group(1), "")
    resolved = re.sub(r"\{([a-zA-Z_]+)\}", _repl, tpl)

    # --- Collapse empty placeholders (option 5a) --------------------------
    # e.g. "{asset_id}_{submitter_name}_{datetime}" with asset_id missing
    # becomes "_alice_2026-01-01_1200" → "alice_2026-01-01_1200".
    resolved = re.sub(r"[_\-]+", lambda m: m.group(0)[0], resolved)
    resolved = _sanitize(resolved) or (submission.get("submission_id") or "submission")

    # Cap length so no filesystem barfs (Windows is 255 chars total).
    resolved = resolved[:200]

    ext = extension.lstrip(".").lower()
    if ext:
        return f"{resolved}.{ext}"
    return resolved
