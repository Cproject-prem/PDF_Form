"""
Jotform-Clone Backend (FastAPI + MongoDB)

Routes are all prefixed with /api. Auth uses JWT (HS256) for primary login
and supports Emergent Google OAuth as a secondary login path. Files are
stored via the Emergent Object Storage integration.
"""
from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Request, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional, Any, Dict
from datetime import datetime, timezone, timedelta
from pathlib import Path
import os
import uuid
import logging
import bcrypt
import jwt
import io
import csv
import requests
import mimetypes

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logger = logging.getLogger("jotform")
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')

# ---------- Config ----------
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ.get('JWT_SECRET', 'dev-secret')
JWT_ALGO = 'HS256'
JWT_EXPIRE_HOURS = int(os.environ.get('JWT_EXPIRE_HOURS', 168))
APP_NAME = os.environ.get('APP_NAME', 'jotform-clone')
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY')
MAX_UPLOAD_MB = int(os.environ.get('MAX_UPLOAD_MB', 25))
SEED_ADMIN_EMAIL = os.environ.get('SEED_ADMIN_EMAIL', 'admin@local.test')
SEED_ADMIN_PASSWORD = os.environ.get('SEED_ADMIN_PASSWORD', 'Admin@12345')
SEED_ADMIN_NAME = os.environ.get('SEED_ADMIN_NAME', 'Super Admin')

ROLES = ['super_admin', 'admin', 'vendor_admin', 'vendor_user', 'member', 'user', 'vendor']

# ---------- DB ----------
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# ---------- Object Storage ----------
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
storage_key: Optional[str] = None

def init_storage() -> Optional[str]:
    global storage_key
    if storage_key:
        return storage_key
    if not EMERGENT_LLM_KEY:
        logger.warning("EMERGENT_LLM_KEY not set; uploads disabled")
        return None
    try:
        r = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_LLM_KEY}, timeout=30)
        r.raise_for_status()
        storage_key = r.json()["storage_key"]
        logger.info("Object storage initialised")
        return storage_key
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
        return None

def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    if not key:
        raise HTTPException(status_code=503, detail="Storage unavailable")
    r = requests.put(f"{STORAGE_URL}/objects/{path}",
                     headers={"X-Storage-Key": key, "Content-Type": content_type},
                     data=data, timeout=120)
    if r.status_code == 403:
        # session may have expired -> reset and retry once
        globals()['storage_key'] = None
        key = init_storage()
        r = requests.put(f"{STORAGE_URL}/objects/{path}",
                         headers={"X-Storage-Key": key, "Content-Type": content_type},
                         data=data, timeout=120)
    r.raise_for_status()
    return r.json()

def get_object(path: str):
    key = init_storage()
    if not key:
        raise HTTPException(status_code=503, detail="Storage unavailable")
    r = requests.get(f"{STORAGE_URL}/objects/{path}",
                     headers={"X-Storage-Key": key}, timeout=60)
    r.raise_for_status()
    return r.content, r.headers.get("Content-Type", "application/octet-stream")

# ---------- Models ----------
class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    email: EmailStr
    name: str
    role: str = "user"
    picture: Optional[str] = None
    is_active: bool = True
    created_at: str
    password_hash: Optional[str] = None  # not exposed via API
    vendor_id: Optional[str] = None  # set for vendor users (RLS scope)
    cluster_manager_name: Optional[str] = None  # for admin role — links to Site.cluster_manager_name
    assignments: Optional[Dict[str, List[str]]] = None  # {forms:[], pdf_forms:[], sites:[], workflows:[]}

class UserOut(BaseModel):
    user_id: str
    email: str
    name: str
    role: str
    picture: Optional[str] = None
    is_active: bool = True
    created_at: str
    vendor_id: Optional[str] = None
    cluster_manager_name: Optional[str] = None
    assignments: Optional[Dict[str, List[str]]] = None

class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1)

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class GoogleSessionIn(BaseModel):
    session_id: str

class FormField(BaseModel):
    model_config = ConfigDict(extra="allow")  # allow data_source, lookup, formula, etc.
    id: str
    type: str                 # short_text, long_text, number, email, phone, date, time,
                              # dropdown, checkbox, radio, file, url, rating, heading,
                              # paragraph, divider
    label: str = ""
    placeholder: str = ""
    description: str = ""
    required: bool = False
    read_only: bool = False
    default_value: Any = None
    options: List[str] = []   # for dropdown/checkbox/radio
    validation: Dict[str, Any] = {}  # {min,max,regex,maxLength}
    width: str = "full"       # full | half
    rich_text: str = ""       # for heading/paragraph

class FormTheme(BaseModel):
    primary_color: str = "#2563EB"
    background: str = "#FFFFFF"
    font: str = "Outfit"

class FormSettings(BaseModel):
    submission_limit: Optional[int] = None
    require_login: bool = False
    allow_multiple: bool = True
    show_progress: bool = False
    thank_you_message: str = "Thanks for your submission!"
    redirect_url: Optional[str] = None
    notify_emails: List[str] = []

class FormIn(BaseModel):
    title: str = "Untitled Form"
    description: str = ""
    fields: List[FormField] = []
    theme: FormTheme = FormTheme()
    settings: FormSettings = FormSettings()
    status: str = "draft"     # draft | published | archived
    # ---- Assignment fields (row-level security) ----
    assigned_site_ids: List[str] = []
    assigned_vendor_ids: List[str] = []
    assigned_vendor_user_ids: List[str] = []
    assigned_admin_ids: List[str] = []
    assigned_member_ids: List[str] = []
    assigned_department_ids: List[str] = []
    assigned_team_ids: List[str] = []
    assigned_cluster_managers: List[str] = []

class Form(FormIn):
    form_id: str
    slug: str
    owner_id: str
    created_at: str
    updated_at: str
    is_favorite: bool = False
    is_archived: bool = False
    is_deleted: bool = False

class SubmissionIn(BaseModel):
    values: Dict[str, Any]    # {field_id: value}

class Submission(BaseModel):
    submission_id: str
    form_id: str
    values: Dict[str, Any]
    submitted_by: Optional[str] = None
    ip: Optional[str] = None
    user_agent: Optional[str] = None
    status: str = "submitted"  # submitted | approved | rejected
    created_at: str

# ---------- App ----------
app = FastAPI(title="Jotform Clone API")
api = APIRouter(prefix="/api")

@app.on_event("startup")
async def startup():
    # indexes
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.forms.create_index("form_id", unique=True)
    await db.forms.create_index("slug", unique=True)
    await db.submissions.create_index("submission_id", unique=True)
    await db.submissions.create_index("form_id")
    # PDF Form Builder indexes
    await db.pdf_templates.create_index("template_id", unique=True)
    await db.pdf_templates.create_index("slug", unique=True)
    await db.pdf_submissions.create_index("submission_id", unique=True)
    await db.pdf_submissions.create_index("template_id")
    # Workflow indexes
    await db.workflows.create_index("workflow_id", unique=True)
    await db.workflow_executions.create_index("execution_id", unique=True)
    await db.workflow_executions.create_index("workflow_id")
    await db.approvals.create_index("approval_id", unique=True)
    await db.approval_tokens.create_index("token", unique=True)
    await db.audit_logs.create_index("created_at")
    # seed workflow templates (idempotent)
    try:
        from workflow_routes import seed_workflow_templates as _seed_wf
        await _seed_wf(db)
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Workflow template seed skipped: {e}")
    # seed demo sites (idempotent — does nothing if any site exists)
    try:
        from vendor_routes import seed_demo_sites as _seed_sites
        await _seed_sites(db)
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Site demo seed skipped: {e}")
    # additional indexes for vendor / site / master
    await db.vendors.create_index("vendor_id", unique=True)
    await db.sites.create_index("site_id", unique=True)
    await db.sites.create_index("site_code")
    await db.master_data.create_index([("table", 1), ("row_id", 1)])
    # seed super admin
    existing = await db.users.find_one({"email": SEED_ADMIN_EMAIL.lower()}, {"_id": 0})
    if not existing:
        uid = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": uid,
            "email": SEED_ADMIN_EMAIL.lower(),
            "name": SEED_ADMIN_NAME,
            "role": "super_admin",
            "password_hash": bcrypt.hashpw(SEED_ADMIN_PASSWORD.encode(), bcrypt.gensalt()).decode(),
            "picture": None,
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info(f"Seeded super admin: {SEED_ADMIN_EMAIL}")

    # Seed demo accounts for the four-role permission model (idempotent).
    async def _ensure(email: str, name: str, role: str, password: str, **extra):
        if await db.users.find_one({"email": email}):
            return
        uid = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": uid, "email": email, "name": name, "role": role,
            "password_hash": bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode(),
            "picture": None, "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
            **extra,
        })
        logger.info(f"Seeded {role}: {email}")
    # Cluster-Manager admin scoped to Rahul Verma (sees Alpha + Bravo only)
    await _ensure("rahul.verma@example.com", "Rahul Verma (Cluster Mgr)",
                  "admin", "Admin@12345", cluster_manager_name="Rahul Verma")
    # Vendor admin for SunOps (sees Alpha + Charlie only)
    sunops_vid = "ven_sunops_demo"
    if not await db.vendors.find_one({"vendor_id": sunops_vid}):
        await db.vendors.insert_one({
            "vendor_id": sunops_vid, "vendor_name": "SunOps Pvt Ltd",
            "vendor_email": "ops@sunops.example.com",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    # Backfill sites with vendor_id where vendor_email matches
    await db.sites.update_many({"vendor_email": "ops@sunops.example.com", "vendor_id": {"$exists": False}},
                               {"$set": {"vendor_id": sunops_vid}})
    await _ensure("vendor.admin@sunops.example.com", "SunOps Vendor Admin",
                  "vendor_admin", "Vendor@12345", vendor_id=sunops_vid)
    await _ensure("vendor.user@sunops.example.com", "SunOps Vendor User",
                  "vendor_user", "Vendor@12345", vendor_id=sunops_vid)

    init_storage()

@app.on_event("shutdown")
async def shutdown():
    client.close()

# ---------- Auth helpers ----------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def check_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False

def make_token(user_id: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

bearer = HTTPBearer(auto_error=False)

async def get_current_user(creds: HTTPAuthorizationCredentials = Depends(bearer)) -> User:
    if not creds or not creds.credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    data = decode_token(creds.credentials)
    user = await db.users.find_one({"user_id": data["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="User disabled")
    return User(**user)

async def get_optional_user(creds: HTTPAuthorizationCredentials = Depends(bearer)) -> Optional[User]:
    if not creds or not creds.credentials:
        return None
    try:
        data = decode_token(creds.credentials)
        user = await db.users.find_one({"user_id": data["sub"]}, {"_id": 0, "password_hash": 0})
        return User(**user) if user else None
    except Exception:
        return None

def require_role(*roles):
    async def _dep(user: User = Depends(get_current_user)):
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="Forbidden")
        return user
    return _dep

# ---------- Auth routes ----------
@api.post("/auth/register")
async def register(body: RegisterIn):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="Email already registered")
    uid = f"user_{uuid.uuid4().hex[:12]}"
    user_doc = {
        "user_id": uid,
        "email": email,
        "name": body.name,
        "role": "user",
        "password_hash": hash_password(body.password),
        "picture": None,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user_doc)
    token = make_token(uid, "user")
    return {"token": token, "user": UserOut(**{k: v for k, v in user_doc.items() if k != "password_hash"})}

@api.post("/auth/login")
async def login(body: LoginIn):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not user.get("password_hash") or not check_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="User disabled")
    token = make_token(user["user_id"], user["role"])
    user.pop("password_hash", None)
    user.pop("_id", None)
    return {"token": token, "user": UserOut(**user)}

@api.post("/auth/google/session")
async def google_session(body: GoogleSessionIn):
    # Exchange session_id with Emergent Auth and create/update user
    try:
        r = requests.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": body.session_id}, timeout=15
        )
        r.raise_for_status()
        info = r.json()
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Google session exchange failed: {e}")
    email = info["email"].lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        uid = f"user_{uuid.uuid4().hex[:12]}"
        user = {
            "user_id": uid,
            "email": email,
            "name": info.get("name", email.split("@")[0]),
            "role": "user",
            "picture": info.get("picture"),
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "password_hash": None,
        }
        await db.users.insert_one(user)
    else:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"picture": info.get("picture")}})
        user["picture"] = info.get("picture")
    user.pop("password_hash", None)
    token = make_token(user["user_id"], user["role"])
    return {"token": token, "user": UserOut(**user)}

@api.get("/auth/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return UserOut(**user.model_dump())


@api.get("/auth/menu")
async def auth_menu(user: User = Depends(get_current_user)):
    """Return the sidebar menu + capability matrix appropriate for this user."""
    from permissions import capabilities_for, menu_for, normalize_role
    return {
        "menu": menu_for(user),
        "capabilities": capabilities_for(user),
        "role": normalize_role(user.role),
    }


# ---------- Global submissions list (admin / vendor admin views) ----------
@api.get("/submissions", response_model=List[Submission])
async def list_all_submissions(user: User = Depends(get_current_user), q: Optional[str] = None,
                               status: Optional[str] = None, form_id: Optional[str] = None):
    """List submissions visible to the current user.

      super_admin → all
      admin       → submissions for forms they own/are assigned to
      vendor_admin→ submissions from their vendor's users
      vendor_user → only their own submissions
    """
    from permissions import normalize_role, form_filter, is_super_admin
    role = normalize_role(user.role)
    query: Dict[str, Any] = {}

    if not is_super_admin(user):
        # First find form_ids visible to this user
        ff = form_filter(user)
        forms_visible = await db.forms.find(ff, {"_id": 0, "form_id": 1}).to_list(2000)
        visible_ids = [f["form_id"] for f in forms_visible]
        clauses: List[Dict[str, Any]] = [{"form_id": {"$in": visible_ids}}]
        if role == "vendor_user":
            clauses = [{"submitted_by": user.user_id}]  # strict: only own
        elif role == "vendor_admin":
            # vendor's submissions = submitted by any user with vendor_id == ours
            vid = user.vendor_id
            if vid:
                team = await db.users.find({"vendor_id": vid}, {"_id": 0, "user_id": 1}).to_list(2000)
                clauses.append({"submitted_by": {"$in": [u["user_id"] for u in team]}})
            else:
                return []
        query = {"$and": clauses} if len(clauses) > 1 else clauses[0]
    if form_id:
        query.setdefault("form_id", form_id)
    if status:
        query["status"] = status
    if q:
        query["values"] = {"$regex": q, "$options": "i"}
    rows = await db.submissions.find(query, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return [Submission(**r) for r in rows]


# ---------- Consolidated submissions overview (all forms + PDF forms, grouped) ----------
@api.get("/submissions/overview")
async def submissions_overview(user: User = Depends(get_current_user)):
    """Return submissions grouped form-wise across BOTH standard forms and PDF forms.

    Response shape:
      [{ kind: "form"|"pdf", form_id, title, slug, count, submissions: [...] }]
    """
    from permissions import (
        normalize_role, form_filter, is_super_admin, submission_filter,
    )
    role = normalize_role(user.role)
    groups: List[Dict[str, Any]] = []

    # --- Standard forms ---------------------------------------------------
    if is_super_admin(user):
        form_q: Dict[str, Any] = {}
    else:
        form_q = form_filter(user)
    forms = await db.forms.find(form_q, {"_id": 0}).sort("updated_at", -1).to_list(2000)

    # Restrict which subs a vendor_user can see (only own)
    sub_q_extra: Dict[str, Any] = {}
    if role == "vendor_user":
        sub_q_extra = {"submitted_by": user.user_id}
    elif role == "vendor_admin" and user.vendor_id:
        team = await db.users.find(
            {"vendor_id": user.vendor_id}, {"_id": 0, "user_id": 1},
        ).to_list(2000)
        sub_q_extra = {"submitted_by": {"$in": [u["user_id"] for u in team]}}

    for f in forms:
        sq = {"form_id": f["form_id"], **sub_q_extra}
        subs = await db.submissions.find(sq, {"_id": 0}).sort("created_at", -1).to_list(500)
        groups.append({
            "kind": "form",
            "id": f["form_id"],
            "title": f.get("title") or "Untitled",
            "slug": f.get("slug"),
            "status": f.get("status"),
            "field_summary": [
                {"id": fd["id"], "label": fd.get("label") or fd["id"], "type": fd.get("type")}
                for fd in (f.get("fields") or [])
                if fd.get("type") not in ("heading", "paragraph", "divider")
            ][:6],
            "count": len(subs),
            "submissions": subs,
        })

    # --- PDF forms --------------------------------------------------------
    if is_super_admin(user):
        pdf_q: Dict[str, Any] = {"is_deleted": False}
    else:
        from permissions import form_filter as _ff
        rls = _ff(user)
        import json as _json
        rls = _json.loads(_json.dumps(rls).replace('"form_id"', '"template_id"'))
        pdf_q = {"$and": [{"is_deleted": False}, rls]}
    pdfs = await db.pdf_templates.find(pdf_q, {"_id": 0}).sort("updated_at", -1).to_list(2000)
    for t in pdfs:
        sq = {"template_id": t["template_id"], **sub_q_extra}
        subs = await db.pdf_submissions.find(sq, {"_id": 0}).sort("created_at", -1).to_list(500)
        groups.append({
            "kind": "pdf",
            "id": t["template_id"],
            "title": t.get("title") or "Untitled PDF",
            "slug": t.get("slug"),
            "status": t.get("status"),
            "field_summary": [
                {"id": fd.get("id"), "label": fd.get("label") or fd.get("name") or fd.get("id"), "type": fd.get("type")}
                for fd in (t.get("fields") or [])
                if fd.get("type") not in ("heading", "paragraph", "static_text", "divider", "hidden")
            ][:6],
            "count": len(subs),
            "submissions": subs,
        })
    # Sort groups: those with subs first, then alphabetical
    groups.sort(key=lambda g: (-g["count"], g["title"].lower()))
    return groups


# ---------- Excel (.xlsx) export ----------
def _xlsx_val(v):
    if v is None:
        return ""
    if isinstance(v, (list, tuple)):
        return ", ".join(str(x) for x in v)
    if isinstance(v, dict):
        # display friendly for file/upload/signature dicts
        if "filename" in v:
            return str(v.get("filename"))
        return str(v)
    if isinstance(v, str) and v.startswith("data:image"):
        return "[signature image]"
    return v


@api.get("/forms/{form_id}/submissions/export.xlsx")
async def export_submissions_xlsx(form_id: str, user: User = Depends(get_current_user)):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill
    form = await _get_form_for_user(form_id, user)
    rows = await db.submissions.find({"form_id": form_id}, {"_id": 0}) \
        .sort("created_at", 1).to_list(5000)
    fields = [f for f in (form.get("fields") or [])
              if f.get("type") not in ("heading", "paragraph", "divider")]
    field_ids = [f["id"] for f in fields]
    field_labels = {f["id"]: (f.get("label") or f["id"]) for f in fields}

    wb = Workbook()
    ws = wb.active
    ws.title = (form.get("title") or "Submissions")[:31]
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="2563EB")
    sub_font = Font(italic=True, color="475569")
    # Row 1 = human-friendly labels
    label_row = ["Submission ID", "Status", "Submitted At", "Submitted By"] + \
                [field_labels[fid] for fid in field_ids]
    # Row 2 = machine-friendly keys/IDs
    key_row = ["submission_id", "status", "created_at", "submitted_by"] + field_ids

    ws.append(label_row)
    ws.append(key_row)
    for cell in ws[1]:
        cell.font = header_font
        cell.fill = header_fill
    for cell in ws[2]:
        cell.font = sub_font

    for r in rows:
        vals = r.get("values") or {}
        ws.append(
            [r.get("submission_id"), r.get("status"), r.get("created_at"),
             r.get("submitted_by") or ""] +
            [_xlsx_val(vals.get(fid, "")) for fid in field_ids],
        )
    # simple column autosize
    for i, col in enumerate(ws.columns, start=1):
        w = max((len(str(c.value or "")) for c in col), default=8)
        ws.column_dimensions[col[0].column_letter].width = min(max(w + 2, 12), 48)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    safe_slug = form.get("slug") or form_id
    return Response(
        content=buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{safe_slug}-submissions.xlsx"'},
    )


# ---------- Users (admin) ----------
@api.get("/users", response_model=List[UserOut])
async def list_users(user: User = Depends(require_role("super_admin"))):
    rows = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(1000)
    return [UserOut(**r) for r in rows]

class UserCreateIn(BaseModel):
    email: EmailStr
    name: str
    password: str = Field(min_length=6)
    role: str = "user"

@api.post("/users", response_model=UserOut)
async def create_user(body: UserCreateIn, user: User = Depends(require_role("super_admin"))):
    if body.role not in ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="Email taken")
    uid = f"user_{uuid.uuid4().hex[:12]}"
    doc = {
        "user_id": uid, "email": email, "name": body.name, "role": body.role,
        "password_hash": hash_password(body.password), "picture": None,
        "is_active": True, "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    doc.pop("password_hash", None)
    return UserOut(**doc)

class UserUpdateIn(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None
    vendor_id: Optional[str] = None
    cluster_manager_name: Optional[str] = None
    assignments: Optional[Dict[str, List[str]]] = None

@api.patch("/users/{user_id}", response_model=UserOut)
async def update_user(user_id: str, body: UserUpdateIn, user: User = Depends(require_role("super_admin"))):
    updates = {}
    if body.name is not None:
        updates["name"] = body.name
    if body.role is not None:
        if body.role not in ROLES:
            raise HTTPException(400, "Invalid role")
        updates["role"] = body.role
    if body.is_active is not None:
        updates["is_active"] = body.is_active
    if body.password:
        updates["password_hash"] = hash_password(body.password)
    if body.vendor_id is not None:
        updates["vendor_id"] = body.vendor_id or None
    if body.cluster_manager_name is not None:
        updates["cluster_manager_name"] = body.cluster_manager_name or None
    if body.assignments is not None:
        updates["assignments"] = body.assignments
    if not updates:
        raise HTTPException(400, "No fields")
    res = await db.users.update_one({"user_id": user_id}, {"$set": updates})
    if not res.matched_count:
        raise HTTPException(404, "User not found")
    doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return UserOut(**doc)

@api.delete("/users/{user_id}")
async def delete_user(user_id: str, user: User = Depends(require_role("super_admin"))):
    if user_id == user.user_id:
        raise HTTPException(400, "Cannot delete yourself")
    await db.users.delete_one({"user_id": user_id})
    return {"ok": True}

# ---------- Forms ----------
def _slug(title: str) -> str:
    base = "".join(c.lower() if c.isalnum() else "-" for c in title).strip("-")[:40] or "form"
    return f"{base}-{uuid.uuid4().hex[:6]}"

@api.get("/forms", response_model=List[Form])
async def list_forms(user: User = Depends(get_current_user),
                     archived: bool = False, favorite: Optional[bool] = None,
                     q: Optional[str] = None):
    from permissions import form_filter, is_super_admin
    query: Dict[str, Any] = {"is_deleted": False, "is_archived": archived}
    # Apply role-based RLS unless super admin
    if not is_super_admin(user):
        query = {"$and": [query, form_filter(user)]}
    if favorite is not None:
        # Keep the favorite filter outside the $and rewrap so we don't lose it
        if "$and" in query:
            query["$and"].append({"is_favorite": favorite})
        else:
            query["is_favorite"] = favorite
    if q:
        clause = {"title": {"$regex": q, "$options": "i"}}
        if "$and" in query:
            query["$and"].append(clause)
        else:
            query["title"] = clause["title"]
    rows = await db.forms.find(query, {"_id": 0}).sort("updated_at", -1).to_list(500)
    return [Form(**r) for r in rows]

@api.post("/forms", response_model=Form)
async def create_form(body: FormIn, user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    fid = f"form_{uuid.uuid4().hex[:12]}"
    doc = body.model_dump()
    doc.update({
        "form_id": fid, "slug": _slug(body.title), "owner_id": user.user_id,
        "created_at": now, "updated_at": now,
        "is_favorite": False, "is_archived": False, "is_deleted": False,
    })
    await db.forms.insert_one(doc)
    doc.pop("_id", None)
    return Form(**doc)

async def _get_form_for_user(form_id: str, user: User, *, write: bool = False) -> dict:
    from permissions import can_edit_form, can_view_form
    doc = await db.forms.find_one({"form_id": form_id, "is_deleted": False}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Form not found")
    if write:
        if not can_edit_form(user, doc):
            raise HTTPException(403, "You do not have permission to edit this form")
    else:
        if not can_view_form(user, doc):
            raise HTTPException(403, "You do not have permission to view this form")
    return doc

@api.get("/forms/{form_id}", response_model=Form)
async def get_form(form_id: str, user: User = Depends(get_current_user)):
    return Form(**await _get_form_for_user(form_id, user))

@api.put("/forms/{form_id}", response_model=Form)
async def update_form(form_id: str, body: FormIn, user: User = Depends(get_current_user)):
    existing = await _get_form_for_user(form_id, user, write=True)
    updates = body.model_dump()
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.forms.update_one({"form_id": form_id}, {"$set": updates})
    existing.update(updates)
    return Form(**existing)

class FormPatch(BaseModel):
    is_favorite: Optional[bool] = None
    is_archived: Optional[bool] = None
    status: Optional[str] = None
    title: Optional[str] = None

@api.patch("/forms/{form_id}", response_model=Form)
async def patch_form(form_id: str, body: FormPatch, user: User = Depends(get_current_user)):
    existing = await _get_form_for_user(form_id, user, write=True)
    upd = {k: v for k, v in body.model_dump().items() if v is not None}
    upd["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.forms.update_one({"form_id": form_id}, {"$set": upd})
    existing.update(upd)
    return Form(**existing)

@api.post("/forms/{form_id}/duplicate", response_model=Form)
async def duplicate_form(form_id: str, user: User = Depends(get_current_user)):
    existing = await _get_form_for_user(form_id, user)
    new_id = f"form_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    new_doc = {**existing,
               "form_id": new_id,
               "slug": _slug(existing["title"]),
               "title": existing["title"] + " (Copy)",
               "owner_id": user.user_id,
               "created_at": now, "updated_at": now,
               "is_favorite": False, "is_archived": False, "status": "draft"}
    await db.forms.insert_one(new_doc)
    new_doc.pop("_id", None)
    return Form(**new_doc)

@api.delete("/forms/{form_id}")
async def delete_form(form_id: str, user: User = Depends(get_current_user)):
    await _get_form_for_user(form_id, user, write=True)
    await db.forms.update_one({"form_id": form_id}, {"$set": {"is_deleted": True}})
    return {"ok": True}

# ---------- Public form access ----------
@api.get("/public/forms/{slug}")
async def public_get_form(slug: str):
    doc = await db.forms.find_one({"slug": slug, "is_deleted": False, "is_archived": False},
                                  {"_id": 0, "owner_id": 0})
    if not doc:
        raise HTTPException(404, "Form not found")
    if doc.get("status") != "published":
        raise HTTPException(403, "Form is not published")
    return doc

@api.post("/public/forms/{slug}/submit", response_model=Submission)
async def public_submit(slug: str, body: SubmissionIn, request: Request,
                        viewer: Optional[User] = Depends(get_optional_user)):
    form = await db.forms.find_one({"slug": slug, "is_deleted": False}, {"_id": 0})
    if not form:
        raise HTTPException(404, "Form not found")
    if form.get("status") != "published":
        raise HTTPException(403, "Form is not accepting submissions")
    # required-field validation
    for f in form.get("fields", []):
        if f.get("required") and f["type"] not in ("heading", "paragraph", "divider"):
            v = body.values.get(f["id"])
            if v is None or v == "" or (isinstance(v, list) and len(v) == 0):
                raise HTTPException(400, f"Field '{f.get('label') or f['id']}' is required")
    sid = f"sub_{uuid.uuid4().hex[:12]}"
    doc = {
        "submission_id": sid, "form_id": form["form_id"], "values": body.values,
        "submitted_by": viewer.user_id if viewer else None,
        "ip": request.client.host if request.client else None,
        "user_agent": request.headers.get("user-agent"),
        "status": "submitted",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.submissions.insert_one(doc)
    doc.pop("_id", None)
    # fire workflow trigger (best-effort; never blocks the response)
    try:
        from workflow_routes import fire_trigger as _ft
        # Section 8 — workflow triggers carry enough context to identify which
        # form/PDF, which site, which vendor, and the current submission status.
        site_name = body.values.get("site_name") or body.values.get("site")
        vendor_name = body.values.get("vendor_name") or body.values.get("vendor")
        await _ft(db, "form_submitted",
                  {"submission_id": sid,
                   "submission_kind": "form",
                   "form_id": form["form_id"], "form_name": form.get("title"),
                   "form_type": "form",
                   "site_name": site_name,
                   "vendor_name": vendor_name,
                   "current_status": doc["status"],
                   "values": body.values, "user_id": viewer.user_id if viewer else None,
                   "user_email": viewer.email if viewer else None, "ip": doc["ip"]})
    except Exception as _e:  # noqa: BLE001
        logger.warning(f"workflow trigger form_submitted failed: {_e}")
    return Submission(**doc)

# ---------- Submissions (owner view) ----------
@api.get("/forms/{form_id}/submissions", response_model=List[Submission])
async def list_submissions(form_id: str, user: User = Depends(get_current_user)):
    await _get_form_for_user(form_id, user)
    rows = await db.submissions.find({"form_id": form_id}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return [Submission(**r) for r in rows]

@api.get("/submissions/{submission_id}", response_model=Submission)
async def get_submission(submission_id: str, user: User = Depends(get_current_user)):
    sub = await db.submissions.find_one({"submission_id": submission_id}, {"_id": 0})
    if not sub:
        raise HTTPException(404, "Not found")
    await _get_form_for_user(sub["form_id"], user)
    return Submission(**sub)

class SubmissionStatusIn(BaseModel):
    status: str  # submitted | approved | rejected

@api.patch("/submissions/{submission_id}", response_model=Submission)
async def update_submission_status(submission_id: str, body: SubmissionStatusIn,
                                   user: User = Depends(get_current_user)):
    sub = await db.submissions.find_one({"submission_id": submission_id}, {"_id": 0})
    if not sub:
        raise HTTPException(404, "Not found")
    await _get_form_for_user(sub["form_id"], user)
    if body.status not in ("submitted", "approved", "rejected"):
        raise HTTPException(400, "Invalid status")
    await db.submissions.update_one({"submission_id": submission_id}, {"$set": {"status": body.status}})
    sub["status"] = body.status
    return Submission(**sub)

@api.delete("/submissions/{submission_id}")
async def delete_submission(submission_id: str, user: User = Depends(get_current_user)):
    sub = await db.submissions.find_one({"submission_id": submission_id}, {"_id": 0})
    if not sub:
        raise HTTPException(404, "Not found")
    await _get_form_for_user(sub["form_id"], user)
    await db.submissions.delete_one({"submission_id": submission_id})
    return {"ok": True}

@api.get("/forms/{form_id}/submissions/export.csv")
async def export_submissions_csv(form_id: str, user: User = Depends(get_current_user)):
    form = await _get_form_for_user(form_id, user)
    rows = await db.submissions.find({"form_id": form_id}, {"_id": 0}).sort("created_at", 1).to_list(5000)
    field_ids = [f["id"] for f in form.get("fields", []) if f["type"] not in ("heading", "paragraph", "divider")]
    field_labels = {f["id"]: f.get("label") or f["id"] for f in form.get("fields", [])}
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["submission_id", "status", "created_at"] + [field_labels[fid] for fid in field_ids])
    for r in rows:
        vals = r.get("values", {})
        w.writerow([r["submission_id"], r["status"], r["created_at"]] +
                   [_csv_val(vals.get(fid, "")) for fid in field_ids])
    out = buf.getvalue()
    return Response(content=out, media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{form["slug"]}-submissions.csv"'})

def _csv_val(v):
    if isinstance(v, (list, tuple)):
        return ", ".join(str(x) for x in v)
    if isinstance(v, dict):
        return str(v)
    return v if v is not None else ""

# ---------- Uploads ----------
ALLOWED_EXTS = {"pdf", "doc", "docx", "png", "jpg", "jpeg", "zip", "rar",
                "mp4", "xlsx", "csv", "txt", "gif", "webp"}

@api.post("/upload")
async def upload(file: UploadFile = File(...), user: User = Depends(get_current_user)):
    data = await file.read()
    if len(data) > MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(413, f"File exceeds {MAX_UPLOAD_MB}MB limit")
    ext = (file.filename.rsplit(".", 1)[-1] if "." in file.filename else "bin").lower()
    if ext not in ALLOWED_EXTS:
        raise HTTPException(400, f"Extension '{ext}' not allowed")
    file_id = uuid.uuid4().hex
    path = f"{APP_NAME}/uploads/{user.user_id}/{file_id}.{ext}"
    ct = file.content_type or mimetypes.guess_type(file.filename)[0] or "application/octet-stream"
    result = put_object(path, data, ct)
    doc = {
        "file_id": file_id, "storage_path": result["path"], "original_filename": file.filename,
        "content_type": ct, "size": result.get("size", len(data)),
        "uploaded_by": user.user_id, "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.files.insert_one(doc)
    return {"file_id": file_id, "filename": file.filename, "size": doc["size"], "content_type": ct,
            "url": f"/api/files/{file_id}"}

@api.post("/public/upload")
async def public_upload(file: UploadFile = File(...)):
    """Anonymous uploads for public form submissions."""
    data = await file.read()
    if len(data) > MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(413, f"File exceeds {MAX_UPLOAD_MB}MB limit")
    ext = (file.filename.rsplit(".", 1)[-1] if "." in file.filename else "bin").lower()
    if ext not in ALLOWED_EXTS:
        raise HTTPException(400, f"Extension '{ext}' not allowed")
    file_id = uuid.uuid4().hex
    path = f"{APP_NAME}/uploads/public/{file_id}.{ext}"
    ct = file.content_type or mimetypes.guess_type(file.filename)[0] or "application/octet-stream"
    result = put_object(path, data, ct)
    doc = {
        "file_id": file_id, "storage_path": result["path"], "original_filename": file.filename,
        "content_type": ct, "size": result.get("size", len(data)),
        "uploaded_by": None, "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.files.insert_one(doc)
    return {"file_id": file_id, "filename": file.filename, "size": doc["size"], "content_type": ct,
            "url": f"/api/files/{file_id}"}

@api.get("/files/{file_id}")
async def download_file(file_id: str):
    record = await db.files.find_one({"file_id": file_id, "is_deleted": False}, {"_id": 0})
    if not record:
        raise HTTPException(404, "File not found")
    data, ct = get_object(record["storage_path"])
    return Response(content=data, media_type=record.get("content_type", ct),
                    headers={"Content-Disposition": f'inline; filename="{record["original_filename"]}"'})

# ---------- Dashboard ----------
@api.get("/dashboard/stats")
async def dashboard_stats(user: User = Depends(get_current_user)):
    form_q: Dict[str, Any] = {"is_deleted": False}
    if user.role != "super_admin":
        form_q["owner_id"] = user.user_id
    total_forms = await db.forms.count_documents(form_q)
    form_ids = [d["form_id"] async for d in db.forms.find(form_q, {"form_id": 1})]
    sub_q: Dict[str, Any] = {"form_id": {"$in": form_ids}} if form_ids else {"form_id": {"$in": []}}
    total_subs = await db.submissions.count_documents(sub_q)
    today_iso = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    today_subs = await db.submissions.count_documents({**sub_q, "created_at": {"$gte": today_iso}})
    pending = await db.submissions.count_documents({**sub_q, "status": "submitted"})
    users_count = await db.users.count_documents({}) if user.role == "super_admin" else 1
    # storage
    files_q: Dict[str, Any] = {"is_deleted": False}
    if user.role != "super_admin":
        files_q["uploaded_by"] = user.user_id
    storage_bytes = 0
    async for d in db.files.find(files_q, {"size": 1, "_id": 0}):
        storage_bytes += int(d.get("size") or 0)
    # 14-day series
    series = []
    for i in range(13, -1, -1):
        day = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=i)
        next_day = day + timedelta(days=1)
        c = await db.submissions.count_documents({**sub_q, "created_at": {"$gte": day.isoformat(), "$lt": next_day.isoformat()}})
        series.append({"date": day.strftime("%b %d"), "count": c})
    # recent activity
    recent_subs = await db.submissions.find(sub_q, {"_id": 0}).sort("created_at", -1).limit(8).to_list(8)
    form_titles = {d["form_id"]: d["title"] async for d in db.forms.find({"form_id": {"$in": form_ids}}, {"form_id": 1, "title": 1})}
    activity = [{
        "type": "submission", "form_title": form_titles.get(s["form_id"], "Form"),
        "submission_id": s["submission_id"], "created_at": s["created_at"], "status": s["status"]
    } for s in recent_subs]
    # form analytics
    per_form = []
    for fid in form_ids[:10]:
        cnt = await db.submissions.count_documents({"form_id": fid})
        per_form.append({"form_id": fid, "title": form_titles.get(fid, ""), "count": cnt})
    per_form.sort(key=lambda x: x["count"], reverse=True)
    return {
        "totals": {
            "forms": total_forms, "submissions": total_subs, "today": today_subs,
            "pending": pending, "users": users_count, "storage_bytes": storage_bytes,
        },
        "trend": series,
        "activity": activity,
        "per_form": per_form[:6],
    }

# ---------- Settings ----------
class SmtpIn(BaseModel):
    host: str = ""
    port: int = 587
    username: str = ""
    password: str = ""
    from_email: str = ""
    use_tls: bool = True
    enabled: bool = False

class SettingsIn(BaseModel):
    company_name: str = "FormForge"
    company_logo_url: str = ""
    primary_color: str = "#2563EB"
    smtp: SmtpIn = SmtpIn()

@api.get("/settings", response_model=SettingsIn)
async def get_settings(user: User = Depends(require_role("super_admin"))):
    doc = await db.settings.find_one({"_id": "global"}, {"_id": 0})
    if not doc:
        return SettingsIn()
    # don't leak password back to UI
    if "smtp" in doc and "password" in doc["smtp"]:
        doc["smtp"]["password"] = "********" if doc["smtp"]["password"] else ""
    return SettingsIn(**doc)

@api.put("/settings", response_model=SettingsIn)
async def update_settings(body: SettingsIn, user: User = Depends(require_role("super_admin"))):
    doc = body.model_dump()
    # if password is mask, keep existing
    if doc["smtp"]["password"] == "********":
        existing = await db.settings.find_one({"_id": "global"})
        if existing and existing.get("smtp", {}).get("password"):
            doc["smtp"]["password"] = existing["smtp"]["password"]
        else:
            doc["smtp"]["password"] = ""
    await db.settings.update_one({"_id": "global"}, {"$set": doc}, upsert=True)
    if doc["smtp"]["password"]:
        doc["smtp"]["password"] = "********"
    return SettingsIn(**doc)

@api.get("/health")
async def health():
    return {"status": "ok", "time": datetime.now(timezone.utc).isoformat()}

# ---------- PDF Form Builder ----------
from pdf_routes import build_pdf_router
_pdf_tpl_router, _pdf_public_router, _pdf_sub_router = build_pdf_router(
    db, get_current_user, get_optional_user
)
api.include_router(_pdf_tpl_router)
api.include_router(_pdf_public_router)
api.include_router(_pdf_sub_router)

# ---------- Workflow Automation ----------
from workflow_routes import build_workflow_routers
(_wf_router, _apv_router, _audit_router, _wfa_router, _smtp_router, _pub_apv_router) = \
    build_workflow_routers(db, get_current_user)
api.include_router(_wf_router)
api.include_router(_apv_router)
api.include_router(_audit_router)
api.include_router(_wfa_router)
api.include_router(_smtp_router)
api.include_router(_pub_apv_router)

# ---------- Vendor Management / Site Master / Master Data ----------
from vendor_routes import build_routers as _build_vendor_routers
_vendors_r, _vusers_r, _sites_r, _master_r, _lookup_r, _pub_lookup_r = _build_vendor_routers(
    db, get_current_user, hash_password,
)
api.include_router(_vendors_r)
api.include_router(_vusers_r)
api.include_router(_sites_r)
api.include_router(_master_r)
api.include_router(_lookup_r)
api.include_router(_pub_lookup_r)

# ---------- Formula Engine ----------
from formula_routes import build_formula_router
api.include_router(build_formula_router(db, get_current_user))

# ---------- Extended Data Sources (REST API / JSON / CSV / Excel / Another Form / Workflow Variable) ----------
from datasource_routes import build_datasource_router
api.include_router(build_datasource_router(db, get_current_user))

# Mount router
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)
