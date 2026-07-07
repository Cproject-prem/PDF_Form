"""FormForge — In-app notifications.

A lightweight collection that powers the bell icon in the app header.

Notification schema:
    notification_id   str  (n_<uuid>)
    user_id           str  (recipient)
    kind              str  ("approval_pending" | "approval_decided" | "info")
    title             str
    body              str  (short single-line)
    link              str  (frontend path e.g. "/approvals" or "/forms/{id}/submissions")
    submission_id     Optional[str]
    approval_id       Optional[str]
    read              bool
    created_at        str  (iso)

Endpoints (mounted under /api):
    GET    /notifications                — list current user's notifications (newest first)
    GET    /notifications/unread-count   — quick badge counter
    PATCH  /notifications/{id}/read      — mark one as read
    POST   /notifications/read-all       — mark all mine as read
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _gen() -> str:
    return f"n_{uuid.uuid4().hex[:14]}"


class Notification(BaseModel):
    notification_id: str
    user_id: str
    kind: str
    title: str
    body: str = ""
    link: Optional[str] = None
    submission_id: Optional[str] = None
    approval_id: Optional[str] = None
    read: bool = False
    created_at: str = Field(default_factory=_now)


async def create_notification(db, *, user_id: str, kind: str, title: str,
                              body: str = "", link: Optional[str] = None,
                              submission_id: Optional[str] = None,
                              approval_id: Optional[str] = None) -> Dict[str, Any]:
    """Persist a notification for a single recipient. Idempotent-ish by
    (user_id, approval_id, kind) — if a matching row already exists we
    return the existing one without inserting a duplicate."""
    if approval_id and kind:
        existing = await db.notifications.find_one(
            {"user_id": user_id, "approval_id": approval_id, "kind": kind},
            {"_id": 0},
        )
        if existing:
            return existing
    doc = {
        "notification_id": _gen(),
        "user_id": user_id,
        "kind": kind,
        "title": title,
        "body": body,
        "link": link,
        "submission_id": submission_id,
        "approval_id": approval_id,
        "read": False,
        "created_at": _now(),
    }
    await db.notifications.insert_one(dict(doc))
    return doc


async def notify_users_by_email(db, emails: List[str], **kwargs) -> int:
    """Create notifications for each matching user account (best-effort).

    Returns the number of notifications actually created (accounts not found
    are silently skipped so external / SMTP-only approvers don't break the
    flow)."""
    if not emails:
        return 0
    users = await db.users.find(
        {"email": {"$in": [e.lower() for e in emails if e]}},
        {"_id": 0, "user_id": 1, "email": 1},
    ).to_list(200)
    n = 0
    for u in users:
        await create_notification(db, user_id=u["user_id"], **kwargs)
        n += 1
    return n


def build_notifications_router(db, get_current_user) -> APIRouter:
    router = APIRouter(prefix="/notifications")

    @router.get("", response_model=List[Notification])
    async def list_mine(user=Depends(get_current_user), limit: int = 50):
        rows = await db.notifications.find(
            {"user_id": user.user_id}, {"_id": 0},
        ).sort("created_at", -1).limit(limit).to_list(limit)
        return [Notification(**r) for r in rows]

    @router.get("/unread-count")
    async def unread_count(user=Depends(get_current_user)):
        c = await db.notifications.count_documents({"user_id": user.user_id, "read": False})
        return {"count": c}

    @router.patch("/{nid}/read")
    async def mark_read(nid: str, user=Depends(get_current_user)):
        r = await db.notifications.update_one(
            {"notification_id": nid, "user_id": user.user_id},
            {"$set": {"read": True}},
        )
        if not r.matched_count:
            raise HTTPException(404, "Not found")
        return {"ok": True}

    @router.post("/read-all")
    async def mark_all(user=Depends(get_current_user)):
        r = await db.notifications.update_many(
            {"user_id": user.user_id, "read": False},
            {"$set": {"read": True}},
        )
        return {"marked": r.modified_count}

    return router
