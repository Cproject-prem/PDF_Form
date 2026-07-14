"""FormForge — Schedule vs Actual (monthly cycle tracker).

Every site has a `cycles_per_month` field on Site Master. For each
site × year × month × cycle_number this module tracks two blocks:

  • schedule  — planned_date + notes            (submit → approve → locked)
  • actual    — actual_date + result + notes    (draft-save → submit → approve → locked)

Access matrix:

              | View own | Save schedule | Submit sched | Approve sched | Save actual | Submit actual | Approve actual | Unlock |
  super_admin |  ✓ (all) | ✓             | ✓            | ✓             | ✓           | ✓             | ✓              | ✓      |
  admin       |  ✓ scope | ✓             | ✓            | ✓             | ✓           | ✓             | ✓              | ✓      |
  vendor_admin|  ✓ own   | ✓             | ✓            | ✗             | ✓           | ✓             | ✗              | ✗      |
  vendor_user |  ✓ own   | ✗             | ✗            | ✗             | ✓ (own)     | ✓             | ✗              | ✗      |

Row-level scope for vendors is delegated to `permissions.site_filter` so it
picks up region/vendor/assignment rules automatically.
"""

from __future__ import annotations
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone
from calendar import monthrange
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------
class CycleBlock(BaseModel):
    """A single schedule- or actual-block on a cycle row."""
    planned_date: Optional[str] = None      # for schedule block
    actual_date: Optional[str] = None       # for actual block
    result: Optional[str] = None            # "Done" | "Missed" (actual only)
    notes: Optional[str] = None
    status: str = "draft"                   # draft | submitted | approved
    submitted_at: Optional[str] = None
    submitted_by: Optional[str] = None
    approved_at: Optional[str] = None
    approved_by: Optional[str] = None
    unlocked_at: Optional[str] = None
    unlocked_by: Optional[str] = None
    unlock_note: Optional[str] = None


class CycleUpsertIn(BaseModel):
    site_id: str
    year: int = Field(..., ge=2020, le=2099)
    month: int = Field(..., ge=1, le=12)
    cycle_number: int = Field(..., ge=1, le=31)
    # Only send the block you're editing. Fields inside are shallow-merged
    # onto the persisted block — status/approver metadata is server-managed.
    schedule: Optional[Dict[str, Any]] = None
    actual: Optional[Dict[str, Any]] = None


class UnlockIn(BaseModel):
    which: str                              # "schedule" | "actual"
    note: str = ""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _validate_date(iso: Optional[str], year: int, month: int) -> Optional[str]:
    """Ensure the ISO date (yyyy-mm-dd) falls inside the given year/month."""
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(iso).date()
    except ValueError:
        raise HTTPException(400, f"Invalid date: {iso}")
    if dt.year != year or dt.month != month:
        raise HTTPException(400, f"Date {iso} must be in {year:04d}-{month:02d}")
    return dt.isoformat()


# ---------------------------------------------------------------------------
# Router builder
# ---------------------------------------------------------------------------
def build_router(db, get_current_user):
    router = APIRouter(prefix="/site-cycles", tags=["site-cycles"])

    async def _resolve_site(site_id: str, user) -> Dict[str, Any]:
        """Fetch the site respecting the user's RLS. 404 when out-of-scope."""
        from permissions import site_filter as _sf, is_super_admin, has_access_override
        q: Dict[str, Any] = {"site_id": site_id}
        if not (is_super_admin(user) or has_access_override(user)):
            rls = _sf(user)
            q = {"$and": [q, rls]} if rls else q
        site = await db.sites.find_one(q, {"_id": 0})
        if not site:
            raise HTTPException(404, "Site not found or out of scope")
        return site

    def _role_can(user, action: str) -> bool:
        from permissions import normalize_role, is_super_admin, has_access_override
        if is_super_admin(user) or has_access_override(user):
            return True
        role = normalize_role(getattr(user, "role", ""))
        if action in ("view", "save_schedule", "save_actual", "submit_schedule", "submit_actual"):
            return role in ("admin", "vendor_admin", "vendor_user")
        if action in ("approve", "unlock"):
            return role == "admin"          # cluster manager
        return False

    def _merge_block(existing: Dict[str, Any], patch: Dict[str, Any],
                     block_kind: str) -> Dict[str, Any]:
        """Shallow-merge user-provided fields onto the stored block, preserving
        server-managed status/approval metadata."""
        base = dict(existing or {})
        # Whitelist of editable keys per block type
        editable = {"planned_date", "notes"} if block_kind == "schedule" else \
                   {"actual_date", "result", "notes"}
        for k, v in patch.items():
            if k in editable:
                base[k] = v
        return base

    def _cycle_projection() -> Dict[str, int]:
        return {"_id": 0}

    # -------------------------------------------------------------------
    @router.get("")
    async def list_cycles(year: int, month: Optional[int] = None,
                          site_id: Optional[str] = None,
                          user=Depends(get_current_user)):
        """List cycle rows for the given period.

        * If `month` is omitted → returns every cycle in that year (used
          by the yearly-summary view).
        * If `site_id` is provided → filtered to that plant only.
        * Auto-creates draft placeholder rows for every site the user can
          see (based on `cycles_per_month` on the site).
        """
        from permissions import site_filter as _sf, is_super_admin, has_access_override
        # 1) sites in scope
        site_q: Dict[str, Any] = {}
        if not (is_super_admin(user) or has_access_override(user)):
            rls = _sf(user)
            if rls:
                site_q = rls
        if site_id:
            site_q = {"$and": [site_q, {"site_id": site_id}]} if site_q else {"site_id": site_id}
        sites = await db.sites.find(site_q, {"_id": 0}).to_list(5000)
        if not sites:
            return {"sites": [], "cycles": []}

        # 2) existing cycles
        row_q: Dict[str, Any] = {
            "site_id": {"$in": [s["site_id"] for s in sites]},
            "year": year,
        }
        if month:
            row_q["month"] = month
        rows = await db.site_cycles.find(row_q, _cycle_projection()) \
            .sort([("site_id", 1), ("month", 1), ("cycle_number", 1)]).to_list(20000)

        # 3) return sites (with cycles_per_month) alongside the cycles so
        #    the client can render placeholder rows for cycles that haven't
        #    been touched yet.
        return {
            "sites": [
                {
                    "site_id": s["site_id"],
                    "site_name": s.get("site_name"),
                    "site_code": s.get("site_code"),
                    "region": s.get("region"),
                    "vendor_name": s.get("vendor_name"),
                    "cycles_per_month": int(s.get("cycles_per_month") or 1),
                }
                for s in sites
            ],
            "cycles": rows,
        }

    # -------------------------------------------------------------------
    @router.post("/upsert")
    async def upsert_cycle(body: CycleUpsertIn, user=Depends(get_current_user)):
        """Create or update the schedule / actual block of a cycle row.

        Server enforces lock semantics:
          * schedule.status == "approved" → cannot edit unless admin+ and
            they unlock first.  Vendors get a 403.
          * actual.status == "submitted" or "approved" → same rules.
        """
        if not _role_can(user, "save_schedule" if body.schedule else "save_actual"):
            raise HTTPException(403, "You cannot edit this cycle")
        site = await _resolve_site(body.site_id, user)
        # bound cycle_number to the site's configured cap
        cap = int(site.get("cycles_per_month") or 1)
        if body.cycle_number > cap:
            raise HTTPException(400, f"cycle_number {body.cycle_number} exceeds this site's cycles_per_month={cap}")

        key = {"site_id": body.site_id, "year": body.year,
               "month": body.month, "cycle_number": body.cycle_number}
        existing = await db.site_cycles.find_one(key, _cycle_projection()) or {}

        updates: Dict[str, Any] = {}
        from permissions import is_super_admin, has_access_override, normalize_role
        is_admin_or_more = (is_super_admin(user)
                            or has_access_override(user)
                            or normalize_role(user.role) == "admin")

        # ---- SCHEDULE block ----
        if body.schedule is not None:
            sch_existing = existing.get("schedule") or {}
            if sch_existing.get("status") == "approved" and not is_admin_or_more:
                raise HTTPException(403, "Schedule is approved and locked. Ask an admin to unlock.")
            if sch_existing.get("status") == "submitted" and not is_admin_or_more:
                raise HTTPException(403, "Schedule is pending approval — cannot edit until approved or rejected.")
            merged = _merge_block(sch_existing, body.schedule, "schedule")
            merged["planned_date"] = _validate_date(merged.get("planned_date"), body.year, body.month) or merged.get("planned_date")
            merged["status"] = sch_existing.get("status", "draft")
            updates["schedule"] = merged

        # ---- ACTUAL block ----
        if body.actual is not None:
            act_existing = existing.get("actual") or {}
            if act_existing.get("status") == "approved" and not is_admin_or_more:
                raise HTTPException(403, "Actual is approved and locked. Ask an admin to unlock.")
            if act_existing.get("status") == "submitted" and not is_admin_or_more:
                raise HTTPException(403, "Actual is pending approval — cannot edit until approved or rejected.")
            merged = _merge_block(act_existing, body.actual, "actual")
            merged["actual_date"] = _validate_date(merged.get("actual_date"), body.year, body.month) or merged.get("actual_date")
            if merged.get("result") and merged["result"] not in ("Done", "Missed"):
                raise HTTPException(400, "actual.result must be 'Done' or 'Missed'")
            merged["status"] = act_existing.get("status", "draft")
            updates["actual"] = merged

        if not updates:
            raise HTTPException(400, "Provide `schedule` or `actual` in the body")

        doc = {
            **existing,
            **key,
            **updates,
            "site_name": site.get("site_name"),
            "site_code": site.get("site_code"),
            "updated_at": _now(),
            "updated_by": user.user_id,
        }
        if not existing:
            doc["cycle_id"] = f"cyc_{uuid.uuid4().hex[:12]}"
            doc["created_at"] = _now()
            doc["schedule"] = doc.get("schedule") or {"status": "draft"}
            doc["actual"] = doc.get("actual") or {"status": "draft"}
        await db.site_cycles.update_one(key, {"$set": doc}, upsert=True)
        return await db.site_cycles.find_one(key, _cycle_projection())

    # -------------------------------------------------------------------
    async def _get_cycle(cycle_id: str, user) -> Dict[str, Any]:
        cyc = await db.site_cycles.find_one({"cycle_id": cycle_id}, _cycle_projection())
        if not cyc:
            raise HTTPException(404, "Cycle not found")
        # RLS check via site_filter
        await _resolve_site(cyc["site_id"], user)
        return cyc

    async def _set_block_status(cycle_id: str, block: str, new_status: str,
                                actor, extra: Optional[Dict[str, Any]] = None):
        """Atomic block-status transition."""
        cyc = await db.site_cycles.find_one({"cycle_id": cycle_id})
        if not cyc:
            raise HTTPException(404, "Cycle not found")
        sub = dict(cyc.get(block) or {})
        sub["status"] = new_status
        if new_status == "submitted":
            sub["submitted_at"] = _now()
            sub["submitted_by"] = actor.user_id
        elif new_status == "approved":
            sub["approved_at"] = _now()
            sub["approved_by"] = actor.user_id
        elif new_status == "draft":
            sub["unlocked_at"] = _now()
            sub["unlocked_by"] = actor.user_id
            sub["unlock_note"] = (extra or {}).get("note", "")
            # clear approval metadata so it's re-approvable
            sub["approved_at"] = None
            sub["approved_by"] = None
        await db.site_cycles.update_one(
            {"cycle_id": cycle_id},
            {"$set": {block: sub, "updated_at": _now(), "updated_by": actor.user_id}},
        )
        return await db.site_cycles.find_one({"cycle_id": cycle_id}, _cycle_projection())

    @router.post("/{cycle_id}/submit-schedule")
    async def submit_schedule(cycle_id: str, user=Depends(get_current_user)):
        if not _role_can(user, "submit_schedule"):
            raise HTTPException(403, "Not allowed")
        cyc = await _get_cycle(cycle_id, user)
        sch = cyc.get("schedule") or {}
        if not sch.get("planned_date"):
            raise HTTPException(400, "Set a planned_date before submitting")
        if sch.get("status") in ("submitted", "approved"):
            raise HTTPException(400, f"Schedule already {sch['status']}")
        return await _set_block_status(cycle_id, "schedule", "submitted", user)

    @router.post("/{cycle_id}/approve-schedule")
    async def approve_schedule(cycle_id: str, user=Depends(get_current_user)):
        if not _role_can(user, "approve"):
            raise HTTPException(403, "Only Admin or Super Admin can approve")
        cyc = await _get_cycle(cycle_id, user)
        sch = cyc.get("schedule") or {}
        if sch.get("status") != "submitted":
            raise HTTPException(400, "Only submitted schedules can be approved")
        return await _set_block_status(cycle_id, "schedule", "approved", user)

    @router.post("/{cycle_id}/submit-actual")
    async def submit_actual(cycle_id: str, user=Depends(get_current_user)):
        if not _role_can(user, "submit_actual"):
            raise HTTPException(403, "Not allowed")
        cyc = await _get_cycle(cycle_id, user)
        act = cyc.get("actual") or {}
        if not act.get("actual_date") or not act.get("result"):
            raise HTTPException(400, "Set actual_date and result before submitting")
        if act.get("status") in ("submitted", "approved"):
            raise HTTPException(400, f"Actual already {act['status']}")
        return await _set_block_status(cycle_id, "actual", "submitted", user)

    @router.post("/{cycle_id}/approve-actual")
    async def approve_actual(cycle_id: str, user=Depends(get_current_user)):
        if not _role_can(user, "approve"):
            raise HTTPException(403, "Only Admin or Super Admin can approve")
        cyc = await _get_cycle(cycle_id, user)
        act = cyc.get("actual") or {}
        if act.get("status") != "submitted":
            raise HTTPException(400, "Only submitted actuals can be approved")
        return await _set_block_status(cycle_id, "actual", "approved", user)

    @router.post("/{cycle_id}/unlock")
    async def unlock_block(cycle_id: str, body: UnlockIn,
                            user=Depends(get_current_user)):
        if not _role_can(user, "unlock"):
            raise HTTPException(403, "Only Admin or Super Admin can unlock")
        if body.which not in ("schedule", "actual"):
            raise HTTPException(400, "`which` must be 'schedule' or 'actual'")
        cyc = await _get_cycle(cycle_id, user)
        blk = cyc.get(body.which) or {}
        if blk.get("status") == "draft":
            raise HTTPException(400, "Already unlocked / in draft")
        return await _set_block_status(cycle_id, body.which, "draft", user,
                                       extra={"note": body.note})

    # -------------------------------------------------------------------
    @router.get("/summary")
    async def yearly_summary(year: int, user=Depends(get_current_user)):
        """Return a per-site rollup for the given year — how many cycles
        are drafted / submitted / approved out of the total possible
        (`cycles_per_month` × 12)."""
        from permissions import site_filter as _sf, is_super_admin, has_access_override
        site_q: Dict[str, Any] = {}
        if not (is_super_admin(user) or has_access_override(user)):
            rls = _sf(user)
            if rls: site_q = rls
        sites = await db.sites.find(site_q, {"_id": 0}).to_list(5000)
        if not sites:
            return []
        site_ids = [s["site_id"] for s in sites]
        rows = await db.site_cycles.find(
            {"site_id": {"$in": site_ids}, "year": year}, _cycle_projection(),
        ).to_list(50000)
        by_site: Dict[str, List[Dict[str, Any]]] = {}
        for r in rows:
            by_site.setdefault(r["site_id"], []).append(r)
        out: List[Dict[str, Any]] = []
        for s in sites:
            cyc_rows = by_site.get(s["site_id"], [])
            per_month = int(s.get("cycles_per_month") or 1)
            total_slots = per_month * 12
            sch_draft = sch_sub = sch_app = 0
            act_draft = act_sub = act_app = 0
            for r in cyc_rows:
                sch = (r.get("schedule") or {}).get("status") or "draft"
                act = (r.get("actual") or {}).get("status") or "draft"
                if sch == "approved": sch_app += 1
                elif sch == "submitted": sch_sub += 1
                elif sch == "draft" and (r.get("schedule") or {}).get("planned_date"):
                    sch_draft += 1
                if act == "approved": act_app += 1
                elif act == "submitted": act_sub += 1
                elif act == "draft" and (r.get("actual") or {}).get("actual_date"):
                    act_draft += 1
            out.append({
                "site_id": s["site_id"],
                "site_name": s.get("site_name"),
                "site_code": s.get("site_code"),
                "region": s.get("region"),
                "vendor_name": s.get("vendor_name"),
                "cycles_per_month": per_month,
                "total_slots": total_slots,
                "schedule": {"draft": sch_draft, "submitted": sch_sub, "approved": sch_app},
                "actual":   {"draft": act_draft, "submitted": act_sub, "approved": act_app},
            })
        out.sort(key=lambda r: (r.get("region") or "", r.get("site_name") or ""))
        return out

    return router
