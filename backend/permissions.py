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


def has_access_override(user) -> bool:
    """`access_override` is an explicit add-on flag on the user document.

    When set, the user gets Super-Admin-level access:
      • can view and edit every form / PDF template
      • bypasses region / vendor / site filters (sees everything)

    Use for shift-managers or on-call approvers that need to help across
    the organisation without changing their base role.
    """
    return bool(getattr(user, "access_override", False))


# ----------------------------------------------------------------------------
# Approval hierarchy (super_admin > region_admin > cluster_admin > vendor_admin)
# ----------------------------------------------------------------------------

APPROVAL_LEVELS = {
    "super_admin": 100,
    "admin": 50,          # generic admin = region admin
    "cluster_manager": 30,  # semantic bucket; usually an `admin` with cluster_manager_name set
    "vendor_admin": 10,
    "vendor": 0,
    "vendor_user": 0,
}


def is_cluster_manager(user) -> bool:
    """True when this user is effectively a Cluster Manager: they have the
    generic `admin` role AND their profile carries a `cluster_manager_name`.
    """
    if normalize_role(getattr(user, "role", "")) != ADMIN:
        return False
    return bool(user_cluster_manager_name(user))


def approval_level(user) -> int:
    """Numeric priority of this user in the approval chain. Higher wins.
    `access_override` promotes any admin to super_admin level."""
    if has_access_override(user):
        return APPROVAL_LEVELS["super_admin"]
    role = normalize_role(getattr(user, "role", ""))
    if role == ADMIN and is_cluster_manager(user):
        return APPROVAL_LEVELS["cluster_manager"]
    return APPROVAL_LEVELS.get(role, 0)


def can_approve(actor, approval_row: Dict[str, Any]) -> bool:
    """Return True when `actor` may approve or reject `approval_row`.

    Rule:
      1) Super Admin (or `access_override`) can approve anything.
      2) Members / Admins of the SAME REGION or SAME CLUSTER can approve / override
         submission approvals for other members in that region.
      3) Otherwise the actor must be strictly higher on the approval ladder
         than the requester, AND scope must match.
    """
    if has_access_override(actor) or normalize_role(getattr(actor, "role", "")) == SUPER_ADMIN:
        return True
    
    actor_region = user_region(actor)
    actor_cluster = user_cluster_manager_name(actor)
    target_region = approval_row.get("target_region") or approval_row.get("region")
    target_cluster = approval_row.get("target_cluster_manager_name") or approval_row.get("cluster")

    # Same Region Member / Cluster Member Override Rule
    if target_region and actor_region and str(target_region).strip().lower() == str(actor_region).strip().lower():
        return True
    if target_cluster and actor_cluster and str(target_cluster).strip().lower() == str(actor_cluster).strip().lower():
        return True

    actor_level = approval_level(actor)
    requester = approval_row.get("requested_by") or {}
    requester_level = APPROVAL_LEVELS.get(normalize_role(requester.get("role", "")), 0)
    if actor_level <= requester_level:
        return False
    actor_role = normalize_role(getattr(actor, "role", ""))
    if actor_role != ADMIN:
        return False

    if is_cluster_manager(actor):
        if target_cluster and actor_cluster and target_cluster == actor_cluster:
            return True
        return False
    if target_region and actor_region and target_region == actor_region:
        return True
    return False


# ----------------------------------------------------------------------------
# Site Master row-level filter
# ----------------------------------------------------------------------------


def site_filter(user) -> Dict[str, Any]:
    """Return a Mongo `find` filter that restricts the sites collection to
    only the rows the given user is allowed to see.

    Super Admin / Access Override → {} (everything)
    Cluster Manager               → {cluster_manager_name} OR {cluster} (only their own cluster plants)
    Regional Admin                → {region} (all plants in their region by default)
    General Admin (no region/cm)  → {} (all plants by default)
    Vendor Admin                  → {vendor_id: user.vendor_id}
    Vendor User                   → {assigned_sites}
    """
    role = normalize_role(getattr(user, "role", ""))
    if role == SUPER_ADMIN or has_access_override(user):
        return {}

    if role == ADMIN:
        import re
        cm = user_cluster_manager_name(user)
        cluster = getattr(user, "cluster", None) if not isinstance(user, dict) else user.get("cluster")
        region = user_region(user)
        
        assignments = getattr(user, "assignments", {}) if not isinstance(user, dict) else user.get("assignments", {})
        assigned_sites = (assignments or {}).get("sites", []) if isinstance(assignments, dict) else []

        # 1. Cluster Manager: restrict strictly to their own cluster manager name, cluster, or assigned sites
        if cm or (cluster and str(cluster).strip()):
            cm_clauses: List[Dict[str, Any]] = []
            if assigned_sites:
                cm_clauses.append({"site_id": {"$in": assigned_sites}})
            if cm:
                cm_clean = cm.split("(")[0].strip()
                if cm_clean:
                    cm_clauses.append({"cluster_manager_name": {"$regex": f"^{re.escape(cm_clean)}", "$options": "i"}})
            if cluster and str(cluster).strip():
                cm_clauses.append({"cluster": {"$regex": f"^{re.escape(str(cluster).strip())}", "$options": "i"}})
            return cm_clauses[0] if len(cm_clauses) == 1 else {"$or": cm_clauses}

        # 2. Regional Admin: sees ALL plants in their region by default
        if region and str(region).strip():
            return {"region": {"$regex": f"^{re.escape(str(region).strip())}", "$options": "i"}}

        # 3. Plain Admin (no region, no cluster): sees all plants by default
        return {}

    if role in (VENDOR_ADMIN, VENDOR_USER):
        vid = user_vendor_id(user)
        if not vid:
            return {"site_id": "__none__"}

        # Vendor Admin: sees every plant belonging to their vendor
        # (legacy `vendor_id` column OR `assigned_vendor_ids` set).
        if role == VENDOR_ADMIN:
            clauses: List[Dict[str, Any]] = [
                {"$or": [
                    {"vendor_id": vid},
                    {"assigned_vendor_ids": vid},
                ]}
            ]
        else:
            # Vendor Member (VENDOR_USER):
            # * If the admin has explicitly assigned plants via
            #   `assignments.sites`, restrict to that list (do NOT expose the
            #   whole vendor fleet — that would defeat the point).
            # * If no plants are assigned yet, the member sees nothing.
            # * `allowed_emails` on individual sites still grants ad-hoc
            #   access below (handled after the role check).
            assigned_sites = user_assignments(user).get("sites") or []
            if assigned_sites:
                clauses = [{"site_id": {"$in": assigned_sites}}]
            else:
                clauses = [{"site_id": "__none_no_assignments__"}]

        # Also allow vendor_email match for backwards compat, plus any
        # additional email listed in the site's `allowed_emails` allow-list
        # (used for sharing a site with multiple contact addresses).
        email = getattr(user, "email", None)
        if email:
            clauses[0] = {"$or": [
                clauses[0],
                {"vendor_email": email},
                {"allowed_emails": email},
            ]}
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
    if role == SUPER_ADMIN or has_access_override(user):
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
        # legacy per-user assignments — accept BOTH `forms` and `pdf_forms`
        # since this filter is shared between the `forms` and `pdf_templates`
        # collections (matched by form_id / template_id respectively).
        assignments = user_assignments(user)
        legacy_ids = list({
            *(assignments.get("forms") or []),
            *(assignments.get("pdf_forms") or []),
        })
        if legacy_ids:
            clauses.append({"form_id":     {"$in": legacy_ids}})
            clauses.append({"template_id": {"$in": legacy_ids}})
        return {"$or": clauses} if clauses else {"form_id": "__none__"}

    return {"form_id": "__none__"}


def can_edit_form(user, form_doc: Dict[str, Any]) -> bool:
    """True if the user may write to this form/pdf-template doc.

    Only super_admin, admin (cluster managers) and users flagged with
    `access_override` may edit forms.  Vendor tier is read-only for
    form definitions — they can still fill and submit them.
    """
    if has_access_override(user):
        return True
    role = normalize_role(getattr(user, "role", ""))
    if role == SUPER_ADMIN:
        return True
    if role == ADMIN:
        # Every admin can view + edit + create any form/PDF template
        return True
    # Vendor tier cannot edit forms — only fill them
    return False


def can_create_form(user) -> bool:
    """True if the user may create a brand-new form/pdf-template."""
    if has_access_override(user):
        return True
    role = normalize_role(getattr(user, "role", ""))
    return role in (SUPER_ADMIN, ADMIN)


def can_view_form(user, form_doc: Dict[str, Any]) -> bool:
    """True if the user may read this form/pdf-template."""
    if has_access_override(user):
        return True
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
    assignments = user_assignments(user)
    legacy_ids = set((assignments.get("forms") or []) + (assignments.get("pdf_forms") or []))
    if form_doc.get("form_id") in legacy_ids or form_doc.get("template_id") in legacy_ids:
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
    if role == SUPER_ADMIN or has_access_override(user):
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
    if role != ADMIN or has_access_override(user):
        # access_override → treated as super_admin (see everything)
        if has_access_override(user):
            return {}
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


def require_can_create_form(user) -> None:
    if not can_create_form(user):
        raise HTTPException(403, "Only Admin, Super Admin (or users with the "
                                  "Add-on access override) can create forms.")


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
    override = has_access_override(user)
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
        "access_override": override,
    }
    if role == SUPER_ADMIN or override:
        for k in base:
            if k == "access_override":
                continue
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
                      "plants", "schedule", "site-master", "vendors",
                      "master-data", "manpower", "inventory", "reports", "audit-logs",
                      "users", "smtp", "welcome-email", "settings"])
    if role == ADMIN:
        return _menu(["dashboard", "forms", "pdf-forms", "submissions",
                      "workflows", "approvals",
                      "plants", "schedule", "site-master", "vendors",
                      "master-data", "manpower", "inventory", "users", "welcome-email", "reports"])
    if role == VENDOR_ADMIN:
        return _menu(["manpower", "forms", "pdf-forms", "submissions", "plants", "schedule", "vendors"])
    if role == VENDOR_USER:
        return _menu(["forms", "pdf-forms", "submissions", "plants", "schedule", "manpower"])
    return _menu(["forms"])


_MENU_DEFS = {
    "dashboard":          {"label": "Dashboard",           "path": "/dashboard",           "group": "workspace"},
    "forms":              {"label": "Forms",               "path": "/forms",               "group": "workspace"},
    "pdf-forms":          {"label": "PDF Forms",           "path": "/pdf-forms",           "group": "workspace"},
    "submissions":        {"label": "Submissions",         "path": "/submissions",         "group": "workspace"},
    "pdf-submissions":    {"label": "PDF Submissions",     "path": "/pdf-submissions",     "group": "workspace"},
    "workflows":          {"label": "Workflow Automation", "path": "/workflows",           "group": "workspace"},
    "workflow-analytics": {"label": "Workflow Analytics",  "path": "/workflow-analytics",  "group": "workspace"},
    "approvals":          {"label": "Approvals",           "path": "/approvals",           "group": "workspace"},
    "plants":             {"label": "Plants",              "path": "/plants",              "group": "data"},
    "schedule":           {"label": "Schedule vs Actual",  "path": "/schedule",            "group": "data"},
    "site-master":        {"label": "Site Management",     "path": "/sites",               "group": "data"},
    "vendors":            {"label": "Vendor Management",   "path": "/vendors",             "group": "data"},
    "master-data":        {"label": "Master Data",         "path": "/master-data",         "group": "data"},
    "reports":            {"label": "Reports",             "path": "/reports",             "group": "data"},
    "manpower":           {"label": "Manpower",            "path": "/manpower",            "group": "data"},
    "inventory":          {"label": "Inventory Management","path": "/inventory",           "group": "data"},
    "team":               {"label": "Team",                "path": "/team",                "group": "team"},
    "users":              {"label": "Users",               "path": "/users",               "group": "admin"},
    "audit-logs":         {"label": "Audit Logs",          "path": "/audit-logs",          "group": "admin"},
    "smtp":               {"label": "Email / SMTP",        "path": "/settings/smtp",       "group": "admin"},
    "welcome-email":      {"label": "Welcome Email",       "path": "/settings/welcome-email","group": "admin"},
    "settings":           {"label": "Settings",            "path": "/settings",            "group": "admin"},
}

# Human-friendly group headers rendered in the sidebar.
MENU_GROUPS = [
    {"key": "workspace", "label": "Workspace"},
    {"key": "data",      "label": "Data"},
    {"key": "team",      "label": "Team"},
    {"key": "admin",     "label": "Administration"},
]


def _menu(keys: List[str]) -> List[Dict[str, str]]:
    return [{**_MENU_DEFS[k], "key": k} for k in keys if k in _MENU_DEFS]
