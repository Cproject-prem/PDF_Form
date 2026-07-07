"""FormForge — Centralised RBAC / Row-Level Security helpers.

The application has 4 functional roles.  Their visibility is enforced here
(not in the frontend) so that even direct API access still honours the
permission model.

  super_admin   — sees & edits everything
  admin         — sees only resources where they are an `assigned_admin`,
                  OR sites whose `cluster_manager_name` matches the admin's
                  own `cluster_manager_name` (Excel-driven assignment)
  vendor_admin  — sees only their own vendor's resources (vendor_id match)
                  AND can manage their own vendor users
  vendor_user   — sees only resources where they are explicitly assigned
                  (assigned_vendor_user_ids) OR that belong to their vendor

  (legacy 'vendor' and 'member' / 'user' map to vendor_user / admin
   respectively for backwards compatibility — see `normalize_role`)
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import HTTPException


# Canonical roles
SUPER_ADMIN = "super_admin"
ADMIN = "admin"
VENDOR_ADMIN = "vendor_admin"
VENDOR_USER = "vendor_user"

# Internal admin tier (admin acts on assigned resources; cluster-manager linked)
ADMIN_TIER_ROLES = (SUPER_ADMIN, ADMIN, "member")
VENDOR_TIER_ROLES = (VENDOR_ADMIN, VENDOR_USER, "vendor")
ALL_ROLES = (SUPER_ADMIN, ADMIN, VENDOR_ADMIN, VENDOR_USER, "vendor", "member", "user")


def normalize_role(role: str) -> str:
    """Map legacy / external roles onto the canonical 4-role taxonomy.

    Existing 'vendor' accounts (pre-new-permission-model) act as `vendor_user`.
    'member' / 'user' map to `admin` (limited assigned-resource access).
    """
    if role == SUPER_ADMIN:
        return SUPER_ADMIN
    if role == ADMIN:
        return ADMIN
    if role == VENDOR_ADMIN:
        return VENDOR_ADMIN
    if role in (VENDOR_USER, "vendor"):
        return VENDOR_USER
    if role in ("member", "user"):
        return ADMIN
    return ADMIN  # safe default


def is_super_admin(user) -> bool:
    return getattr(user, "role", "") == SUPER_ADMIN


def is_admin_tier(user) -> bool:
    return normalize_role(getattr(user, "role", "")) in (SUPER_ADMIN, ADMIN)


def is_vendor_tier(user) -> bool:
    return normalize_role(getattr(user, "role", "")) in (VENDOR_ADMIN, VENDOR_USER)


def user_vendor_id(user) -> Optional[str]:
    return getattr(user, "vendor_id", None)


def user_assignments(user) -> Dict[str, List[str]]:
    return getattr(user, "assignments", None) or {}


def user_region(user) -> Optional[str]:
    """The region an admin user is matched against on sites (regional access)."""
    return getattr(user, "region", None)


def user_cluster_manager_name(user) -> Optional[str]:
    """The cluster-manager-name an admin user is matched against on sites."""
    return getattr(user, "cluster_manager_name", None)


# ----------------------------------------------------------------------------
# Site Master row-level filter
# ----------------------------------------------------------------------------


def site_filter(user) -> Dict[str, Any]:
    """Return a Mongo `find` filter that restricts the sites collection to
    only the rows the given user is allowed to see.

    Super Admin   → {}                                  (everything)
    Admin         → {region: <user.region>} OR
                    {cluster_manager_name: <user.cluster_manager_name>} OR
                    {assigned_admin_ids: user.user_id}
    Vendor Admin  → {vendor_id: user.vendor_id}
    Vendor User   → {vendor_id: user.vendor_id, ...assigned site list}
    Anonymous     → an impossible filter (no rows)
    """
    role = normalize_role(getattr(user, "role", ""))
    uid = getattr(user, "user_id", None)
    if role == SUPER_ADMIN:
        return {}

    if role == ADMIN:
        clauses: List[Dict[str, Any]] = []
        if uid:
            clauses.append({"assigned_admin_ids": uid})
        cm = user_cluster_manager_name(user)
        if cm:
            clauses.append({"cluster_manager_name": cm})
        region = user_region(user)
        if region:
            clauses.append({"region": region})
        if not clauses:
            return {"site_id": "__none__"}  # admin with no assignment -> nothing
        return clauses[0] if len(clauses) == 1 else {"$or": clauses}

    if role in (VENDOR_ADMIN, VENDOR_USER):
        vid = user_vendor_id(user)
        if not vid:
            return {"site_id": "__none__"}
        clauses: List[Dict[str, Any]] = [{"vendor_id": vid}]
        if role == VENDOR_USER:
            assigned_sites = user_assignments(user).get("sites") or []
            if assigned_sites:
                clauses = [{"$or": [{"vendor_id": vid}, {"site_id": {"$in": assigned_sites}}]}]
        # Also allow vendor_email match for backwards compat
        email = getattr(user, "email", None)
        if email:
            clauses[0] = {"$or": [clauses[0], {"vendor_email": email}]}
        return clauses[0]

    return {"site_id": "__none__"}


# ----------------------------------------------------------------------------
# Form / PDF-Form / Submission row-level filter
# ----------------------------------------------------------------------------


def form_filter(user) -> Dict[str, Any]:
    """Filter for the `forms` (and structurally identical `pdf_templates`) collection."""
    role = normalize_role(getattr(user, "role", ""))
    uid = getattr(user, "user_id", None)
    vid = user_vendor_id(user)
    if role == SUPER_ADMIN:
        return {}

    if role == ADMIN:
        # NEW BEHAVIOR: every admin can access every form (definitions are
        # shared).  Submission-level RLS still applies via submission_filter()
        # so an admin only sees the data they are entitled to.
        return {}

    if role in (VENDOR_ADMIN, VENDOR_USER):
        clauses: List[Dict[str, Any]] = []
        if vid:
            clauses.append({"assigned_vendor_ids": vid})
        if role == VENDOR_USER and uid:
            clauses.append({"assigned_vendor_user_ids": uid})
        # legacy: user.assignments.forms keeps working
        legacy = user_assignments(user).get("forms") or []
        if legacy:
            clauses.append({"form_id": {"$in": legacy}})
        return {"$or": clauses} if clauses else {"form_id": "__none__"}

    return {"form_id": "__none__"}


def can_edit_form(user, form_doc: Dict[str, Any]) -> bool:
    """True if the user may write to this form/pdf-template doc."""
    role = normalize_role(getattr(user, "role", ""))
    if role == SUPER_ADMIN:
        return True
    if role == ADMIN:
        # Every admin can view + edit + create any form/PDF template
        return True
    # Vendor tier cannot edit forms — only fill them
    return False


def can_view_form(user, form_doc: Dict[str, Any]) -> bool:
    """True if the user may read this form/pdf-template."""
    role = normalize_role(getattr(user, "role", ""))
    if role == SUPER_ADMIN:
        return True
    if role == ADMIN:
        return True
    if can_edit_form(user, form_doc):
        return True
    uid = getattr(user, "user_id", None)
    vid = user_vendor_id(user)
    if vid and vid in (form_doc.get("assigned_vendor_ids") or []):
        return True
    if uid and uid in (form_doc.get("assigned_vendor_user_ids") or []):
        return True
    legacy = user_assignments(user).get("forms") or []
    if form_doc.get("form_id") in legacy or form_doc.get("template_id") in legacy:
        return True
    return False


def submission_filter(user) -> Dict[str, Any]:
    """Sync form of the submission filter — safe to use anywhere.

    Super Admin  → {}                             (everything)
    Admin        → {} for now; the actual scope requires an async lookup
                   against the sites collection, so callers that need
                   region/cluster scoping MUST use `async_submission_filter`
                   below.  This function returns `{}` for admins because we
                   already trust the "all forms" model — the async variant
                   narrows the result set to their region/cluster plants.
    Vendor Admin → {vendor_id: user.vendor_id}
    Vendor User  → {submitted_by: user.user_id}
    """
    role = normalize_role(getattr(user, "role", ""))
    uid = getattr(user, "user_id", None)
    vid = user_vendor_id(user)
    if role == SUPER_ADMIN:
        return {}
    if role == ADMIN:
        return {}
    if role == VENDOR_ADMIN:
        return {"vendor_id": vid} if vid else {"submission_id": "__none__"}
    if role == VENDOR_USER:
        return {"submitted_by": uid} if uid else {"submission_id": "__none__"}
    return {"submission_id": "__none__"}


async def async_submission_filter(db, user) -> Dict[str, Any]:
    """Region- and cluster-scoped Mongo filter for submissions.

    Admin submissions are matched by any of the site-identifier fields
    inside `values.*` (site_name / site_code / asset_id) against the set of
    sites the admin can access according to `site_filter(user)`.  Because
    submissions do not have a `site_id` foreign key, we materialise the set
    of allowed identifiers once per query.

    Non-admin roles fall back to the sync filter.
    """
    role = normalize_role(getattr(user, "role", ""))
    if role != ADMIN:
        return submission_filter(user)

    # No region / cluster set → the admin can see everything (they can
    # already access every form definition).  This keeps the "all forms +
    # all their own submissions" behaviour for global admins.
    region = user_region(user)
    cm = user_cluster_manager_name(user)
    if not region and not cm:
        return {}

    site_q = site_filter(user)
    if not site_q:
        return {}
    rows = await db.sites.find(
        site_q,
        {"_id": 0, "site_name": 1, "site_code": 1, "asset_id": 1},
    ).to_list(5000)
    ids: set = set()
    for r in rows:
        for k in ("site_name", "site_code", "asset_id"):
            v = r.get(k)
            if v:
                ids.add(v)
    if not ids:
        return {"submission_id": "__none__"}
    id_list = list(ids)
    or_clauses = []
    for key in ("site_name", "site_code", "asset_id"):
        or_clauses.append({f"values.{key}": {"$in": id_list}})
    # Also include submissions the admin themselves submitted (always
    # visible regardless of region).
    uid = getattr(user, "user_id", None)
    if uid:
        or_clauses.append({"submitted_by": uid})
    return {"$or": or_clauses}


# ----------------------------------------------------------------------------
# Hard-permission guards
# ----------------------------------------------------------------------------


def require_can_edit_form(user, form_doc: Dict[str, Any]) -> None:
    if not can_edit_form(user, form_doc):
        raise HTTPException(403, "You do not have permission to edit this form.")


def require_can_view_form(user, form_doc: Dict[str, Any]) -> None:
    if not can_view_form(user, form_doc):
        raise HTTPException(403, "You do not have permission to view this form.")


def require_master_data_editor(user) -> None:
    """Only super_admin can edit master data (sites / vendors / master tables)."""
    if not is_super_admin(user):
        raise HTTPException(403, "Only Super Admin can edit master data records.")


# ----------------------------------------------------------------------------
# Capability matrix (used by the frontend to show/hide menu items)
# ----------------------------------------------------------------------------


def capabilities_for(user) -> Dict[str, bool]:
    role = normalize_role(getattr(user, "role", ""))
    base = {
        "manage_users": False,
        "manage_vendors": False,
        "manage_sites": False,
        "manage_master_data": False,
        "manage_smtp": False,
        "manage_settings": False,
        "view_audit_logs": False,
        "view_reports": False,
        "view_dashboard": False,
        "view_workflows": False,
        "edit_workflows": False,
        "create_forms": False,
        "edit_forms": False,
        "delete_forms": False,
        "create_pdf_forms": False,
        "edit_pdf_forms": False,
        "view_all_submissions": False,
        "view_own_submissions": True,
        "manage_team_users": False,
    }
    if role == SUPER_ADMIN:
        for k in base:
            base[k] = True
        return base
    if role == ADMIN:
        base.update({
            "view_dashboard": True, "view_reports": True, "view_workflows": True,
            "edit_workflows": True,  # only for own forms (enforced server-side)
            "create_forms": True, "edit_forms": True, "delete_forms": True,
            "create_pdf_forms": True, "edit_pdf_forms": True,
            "view_all_submissions": True,
        })
        return base
    if role == VENDOR_ADMIN:
        base.update({
            "manage_team_users": True,
        })
        return base
    if role == VENDOR_USER:
        return base
    return base


# ----------------------------------------------------------------------------
# Sidebar menu definition per role (frontend reads this from /api/auth/menu)
# ----------------------------------------------------------------------------


def menu_for(user) -> List[Dict[str, str]]:
    role = normalize_role(getattr(user, "role", ""))
    if role == SUPER_ADMIN:
        return _menu(["dashboard", "forms", "pdf-forms", "submissions",
                      "workflows", "workflow-analytics", "approvals",
                      "plants", "site-master", "vendors",
                      "master-data", "reports", "audit-logs", "users",
                      "smtp", "welcome-email", "settings"])
    if role == ADMIN:
        return _menu(["dashboard", "forms", "pdf-forms", "submissions",
                      "workflows", "approvals",
                      "plants", "site-master", "vendors",
                      "master-data", "users", "welcome-email", "reports"])
    if role == VENDOR_ADMIN:
        return _menu(["manpower", "forms", "submissions", "plants", "team"])
    if role == VENDOR_USER:
        return _menu(["forms", "submissions", "plants"])
    return _menu(["forms"])


_MENU_DEFS = {
    "dashboard":          {"label": "Dashboard",          "path": "/dashboard"},
    "forms":              {"label": "Forms",              "path": "/forms"},
    "pdf-forms":          {"label": "PDF Forms",          "path": "/pdf-forms"},
    "submissions":        {"label": "Submissions",        "path": "/submissions"},
    "pdf-submissions":    {"label": "PDF Submissions",    "path": "/pdf-submissions"},
    "workflows":          {"label": "Workflow Automation","path": "/workflows"},
    "workflow-analytics": {"label": "Workflow Analytics", "path": "/workflow-analytics"},
    "approvals":          {"label": "Approvals",          "path": "/approvals"},
    "site-master":        {"label": "Site Management",    "path": "/sites"},
    "plants":             {"label": "Plants",              "path": "/plants"},
    "vendors":            {"label": "Vendor Management",  "path": "/vendors"},
    "master-data":        {"label": "Master Data",        "path": "/master-data"},
    "reports":            {"label": "Reports",            "path": "/reports"},
    "audit-logs":         {"label": "Audit Logs",         "path": "/audit-logs"},
    "users":              {"label": "Users",              "path": "/users"},
    "smtp":               {"label": "Email / SMTP",       "path": "/settings/smtp"},
    "welcome-email":      {"label": "Welcome Email",      "path": "/settings/welcome-email"},
    "settings":           {"label": "Settings",           "path": "/settings"},
    "manpower":           {"label": "Manpower",           "path": "/team"},
    "team":               {"label": "Team Management",    "path": "/team"},
}


def _menu(keys: List[str]) -> List[Dict[str, str]]:
    return [{**_MENU_DEFS[k], "key": k} for k in keys if k in _MENU_DEFS]
