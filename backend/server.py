"""
Jotform-Clone Backend (FastAPI + MongoDB)

Routes are all prefixed with /api. Auth uses JWT (HS256) for primary login
and supports Emergent Google OAuth as a secondary login path. Files are
stored via the Emergent Object Storage integration.
"""
from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Header, Query, Request, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional, Any, Dict
from datetime import datetime, timezone, timedelta
from pathlib import Path
import os, uuid, logging, bcrypt, jwt, io, csv, requests, mimetypes

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

ROLES = ['super_admin', 'admin', 'member', 'user']

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
    user.pop("password_hash", None); user.pop("_id", None)
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

@api.patch("/users/{user_id}", response_model=UserOut)
async def update_user(user_id: str, body: UserUpdateIn, user: User = Depends(require_role("super_admin"))):
    updates = {}
    if body.name is not None: updates["name"] = body.name
    if body.role is not None:
        if body.role not in ROLES: raise HTTPException(400, "Invalid role")
        updates["role"] = body.role
    if body.is_active is not None: updates["is_active"] = body.is_active
    if body.password: updates["password_hash"] = hash_password(body.password)
    if not updates: raise HTTPException(400, "No fields")
    res = await db.users.update_one({"user_id": user_id}, {"$set": updates})
    if not res.matched_count: raise HTTPException(404, "User not found")
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
    query: Dict[str, Any] = {"is_deleted": False, "is_archived": archived}
    if user.role in ("vendor", "vendor_admin"):
        # vendor users only see forms explicitly assigned to them
        assigned = (user.assignments or {}).get("forms") or []
        query["form_id"] = {"$in": assigned}
    elif user.role not in ("super_admin",):
        query["owner_id"] = user.user_id
    if favorite is not None:
        query["is_favorite"] = favorite
    if q:
        query["title"] = {"$regex": q, "$options": "i"}
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

async def _get_form_for_user(form_id: str, user: User) -> dict:
    doc = await db.forms.find_one({"form_id": form_id, "is_deleted": False}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Form not found")
    if user.role in ("vendor", "vendor_admin"):
        assigned = (user.assignments or {}).get("forms") or []
        if form_id not in assigned:
            raise HTTPException(403, "Forbidden")
    elif user.role != "super_admin" and doc["owner_id"] != user.user_id:
        raise HTTPException(403, "Forbidden")
    return doc

@api.get("/forms/{form_id}", response_model=Form)
async def get_form(form_id: str, user: User = Depends(get_current_user)):
    return Form(**await _get_form_for_user(form_id, user))

@api.put("/forms/{form_id}", response_model=Form)
async def update_form(form_id: str, body: FormIn, user: User = Depends(get_current_user)):
    existing = await _get_form_for_user(form_id, user)
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
    existing = await _get_form_for_user(form_id, user)
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
    await _get_form_for_user(form_id, user)
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
    if not form: raise HTTPException(404, "Form not found")
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
        await _ft(db, "form_submitted",
                  {"submission_id": sid, "form_id": form["form_id"], "form_name": form.get("title"),
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
    if not sub: raise HTTPException(404, "Not found")
    await _get_form_for_user(sub["form_id"], user)
    return Submission(**sub)

class SubmissionStatusIn(BaseModel):
    status: str  # submitted | approved | rejected

@api.patch("/submissions/{submission_id}", response_model=Submission)
async def update_submission_status(submission_id: str, body: SubmissionStatusIn,
                                   user: User = Depends(get_current_user)):
    sub = await db.submissions.find_one({"submission_id": submission_id}, {"_id": 0})
    if not sub: raise HTTPException(404, "Not found")
    await _get_form_for_user(sub["form_id"], user)
    if body.status not in ("submitted", "approved", "rejected"):
        raise HTTPException(400, "Invalid status")
    await db.submissions.update_one({"submission_id": submission_id}, {"$set": {"status": body.status}})
    sub["status"] = body.status
    return Submission(**sub)

@api.delete("/submissions/{submission_id}")
async def delete_submission(submission_id: str, user: User = Depends(get_current_user)):
    sub = await db.submissions.find_one({"submission_id": submission_id}, {"_id": 0})
    if not sub: raise HTTPException(404, "Not found")
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
from workflow_routes import build_workflow_routers, fire_trigger, seed_workflow_templates
(_wf_router, _apv_router, _audit_router, _wfa_router, _smtp_router, _pub_apv_router) = \
    build_workflow_routers(db, get_current_user)
api.include_router(_wf_router)
api.include_router(_apv_router)
api.include_router(_audit_router)
api.include_router(_wfa_router)
api.include_router(_smtp_router)
api.include_router(_pub_apv_router)

# ---------- Vendor Management / Site Master / Master Data ----------
from vendor_routes import build_routers as _build_vendor_routers, seed_demo_sites
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
