"""
Backend API regression tests for Jotform-clone (FastAPI + MongoDB).
All endpoints live under /api on REACT_APP_BACKEND_URL.

Coverage:
- Health
- Auth (login, me, register)
- Forms CRUD + patch (favorite/archive/status) + duplicate + delete (soft)
- Public form access + public submission (with required-field validation)
- Submissions list/get/patch/delete and CSV export
- Upload (auth + public) + file download (Emergent object storage)
- Dashboard /api/dashboard/stats
- Users admin CRUD
- Settings GET/PUT with password masking
- RBAC: regular user gets 403 on /api/users and only sees own forms
"""
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://pdf-merge-forms.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "Admin@12345"


# ------------------------- Fixtures -------------------------

@pytest.fixture(scope="session")
def s():
    return requests.Session()


@pytest.fixture(scope="session")
def admin_token(s):
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and data["user"]["role"] == "super_admin"
    return data["token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def user_account(s):
    """Register a regular user; reused across tests."""
    suffix = uuid.uuid4().hex[:8]
    email = f"TEST_user_{suffix}@example.com"
    body = {"email": email, "password": "Passw0rd!", "name": f"TEST User {suffix}"}
    r = s.post(f"{API}/auth/register", json=body, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["user"]["role"] == "user"
    return {"email": email, "password": body["password"], "token": data["token"], "user": data["user"]}


@pytest.fixture(scope="session")
def user_headers(user_account):
    return {"Authorization": f"Bearer {user_account['token']}", "Content-Type": "application/json"}


# ------------------------- Health -------------------------

def test_health(s):
    r = s.get(f"{API}/health", timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert "time" in body


# ------------------------- Auth -------------------------

class TestAuth:
    def test_login_admin(self, s):
        r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body.get("token"), str) and len(body["token"]) > 20
        assert body["user"]["email"] == ADMIN_EMAIL
        assert body["user"]["role"] == "super_admin"

    def test_login_bad_password(self, s):
        r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_me(self, s, admin_headers):
        r = s.get(f"{API}/auth/me", headers=admin_headers)
        assert r.status_code == 200
        u = r.json()
        assert u["email"] == ADMIN_EMAIL
        assert u["role"] == "super_admin"

    def test_me_requires_token(self, s):
        r = s.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_register_creates_user_role(self, s):
        suffix = uuid.uuid4().hex[:8]
        email = f"TEST_reg_{suffix}@example.com"
        r = s.post(f"{API}/auth/register", json={"email": email, "password": "Passw0rd!", "name": "Reg"})
        assert r.status_code == 200
        data = r.json()
        # backend lower-cases stored email
        assert data["user"]["email"].lower() == email.lower()
        assert data["user"]["role"] == "user"
        # duplicate registration -> 409
        r2 = s.post(f"{API}/auth/register", json={"email": email, "password": "Passw0rd!", "name": "Reg"})
        assert r2.status_code == 409


# ------------------------- Forms CRUD + Publish + Public submit -------------------------

@pytest.fixture(scope="session")
def created_form(s, admin_headers):
    payload = {
        "title": f"TEST Form {uuid.uuid4().hex[:6]}",
        "description": "A test form",
        "fields": [
            {"id": "name", "type": "short_text", "label": "Your name", "required": True},
            {"id": "email", "type": "email", "label": "Email", "required": True},
            {"id": "comment", "type": "long_text", "label": "Comments", "required": False},
        ],
        "status": "draft",
    }
    r = s.post(f"{API}/forms", json=payload, headers=admin_headers)
    assert r.status_code == 200, r.text
    return r.json()


class TestForms:
    def test_create(self, created_form):
        assert created_form["form_id"].startswith("form_")
        assert created_form["slug"]
        assert created_form["status"] == "draft"
        assert created_form["is_deleted"] is False

    def test_list(self, s, admin_headers, created_form):
        r = s.get(f"{API}/forms", headers=admin_headers)
        assert r.status_code == 200
        ids = [f["form_id"] for f in r.json()]
        assert created_form["form_id"] in ids

    def test_get_by_id(self, s, admin_headers, created_form):
        r = s.get(f"{API}/forms/{created_form['form_id']}", headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["title"] == created_form["title"]

    def test_update_put(self, s, admin_headers, created_form):
        body = {
            "title": created_form["title"] + " (Updated)",
            "description": "Updated",
            "fields": created_form["fields"],
            "status": "draft",
        }
        r = s.put(f"{API}/forms/{created_form['form_id']}", json=body, headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["title"].endswith("(Updated)")

    def test_patch_favorite_and_status(self, s, admin_headers, created_form):
        r = s.patch(f"{API}/forms/{created_form['form_id']}", json={"is_favorite": True}, headers=admin_headers)
        assert r.status_code == 200 and r.json()["is_favorite"] is True
        # publish
        r2 = s.patch(f"{API}/forms/{created_form['form_id']}", json={"status": "published"}, headers=admin_headers)
        assert r2.status_code == 200 and r2.json()["status"] == "published"

    def test_duplicate(self, s, admin_headers, created_form):
        r = s.post(f"{API}/forms/{created_form['form_id']}/duplicate", headers=admin_headers)
        assert r.status_code == 200
        dup = r.json()
        assert dup["form_id"] != created_form["form_id"]
        assert "(Copy)" in dup["title"]
        # cleanup duplicate
        s.delete(f"{API}/forms/{dup['form_id']}", headers=admin_headers)


class TestPublicFormAccess:
    def test_draft_public_get_returns_403(self, s, admin_headers):
        # Create a new draft form so the published one above doesn't interfere
        body = {"title": "TEST Draft", "fields": [{"id": "q", "type": "short_text", "label": "Q"}], "status": "draft"}
        r = s.post(f"{API}/forms", json=body, headers=admin_headers)
        assert r.status_code == 200
        f = r.json()
        r2 = requests.get(f"{API}/public/forms/{f['slug']}")
        assert r2.status_code == 403
        # cleanup
        s.delete(f"{API}/forms/{f['form_id']}", headers=admin_headers)

    def test_published_public_get(self, s, admin_headers, created_form):
        # ensure published
        s.patch(f"{API}/forms/{created_form['form_id']}", json={"status": "published"}, headers=admin_headers)
        r = requests.get(f"{API}/public/forms/{created_form['slug']}")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "published"
        assert "owner_id" not in body  # owner_id stripped

    def test_public_submit_missing_required(self, s, created_form):
        # missing required 'email'
        r = requests.post(f"{API}/public/forms/{created_form['slug']}/submit",
                          json={"values": {"name": "Alice"}})
        assert r.status_code == 400

    def test_public_submit_success(self, s, created_form):
        r = requests.post(f"{API}/public/forms/{created_form['slug']}/submit",
                          json={"values": {"name": "Alice", "email": "alice@example.com",
                                            "comment": "Hello"}})
        assert r.status_code == 200, r.text
        sub = r.json()
        assert sub["submission_id"].startswith("sub_")
        assert sub["status"] == "submitted"
        assert sub["form_id"] == created_form["form_id"]
        pytest.submission_id = sub["submission_id"]  # share via module attr


# ------------------------- Submissions list/get/patch/delete + CSV -------------------------

class TestSubmissions:
    def test_list_submissions(self, s, admin_headers, created_form):
        r = s.get(f"{API}/forms/{created_form['form_id']}/submissions", headers=admin_headers)
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) >= 1
        assert any(x["submission_id"] == pytest.submission_id for x in rows)

    def test_get_submission(self, s, admin_headers):
        r = s.get(f"{API}/submissions/{pytest.submission_id}", headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["submission_id"] == pytest.submission_id

    def test_patch_submission_status(self, s, admin_headers):
        r = s.patch(f"{API}/submissions/{pytest.submission_id}", json={"status": "approved"}, headers=admin_headers)
        assert r.status_code == 200 and r.json()["status"] == "approved"

    def test_export_csv(self, s, admin_headers, created_form):
        r = s.get(f"{API}/forms/{created_form['form_id']}/submissions/export.csv", headers=admin_headers)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("text/csv")
        text = r.text
        lines = text.strip().splitlines()
        assert len(lines) >= 2  # header + at least 1 row
        header = lines[0]
        assert "submission_id" in header and "status" in header
        # the row should mention the submission id
        assert pytest.submission_id in text

    def test_delete_submission(self, s, admin_headers, created_form):
        # Create one more submission via public endpoint, then delete it
        r = requests.post(f"{API}/public/forms/{created_form['slug']}/submit",
                          json={"values": {"name": "Bob", "email": "bob@example.com"}})
        assert r.status_code == 200
        sid = r.json()["submission_id"]
        d = s.delete(f"{API}/submissions/{sid}", headers=admin_headers)
        assert d.status_code == 200
        g = s.get(f"{API}/submissions/{sid}", headers=admin_headers)
        assert g.status_code == 404


# ------------------------- Uploads -------------------------

class TestUploads:
    def test_upload_auth(self, s, admin_token):
        # multipart; do NOT set Content-Type header (requests does it)
        files = {"file": ("test.txt", b"hello jotform-clone", "text/plain")}
        r = s.post(f"{API}/upload", files=files, headers={"Authorization": f"Bearer {admin_token}"})
        if r.status_code == 503:
            pytest.skip("Object storage temporarily unavailable (503)")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "file_id" in data and data["filename"] == "test.txt"
        # fetch the file
        r2 = s.get(f"{API}/files/{data['file_id']}")
        if r2.status_code == 503:
            pytest.skip("Storage unavailable on read")
        assert r2.status_code == 200
        assert r2.content == b"hello jotform-clone"

    def test_public_upload(self, s):
        files = {"file": ("anon.txt", b"anon data", "text/plain")}
        r = requests.post(f"{API}/public/upload", files=files)
        if r.status_code == 503:
            pytest.skip("Object storage temporarily unavailable (503)")
        assert r.status_code == 200, r.text
        assert "file_id" in r.json()


# ------------------------- Dashboard -------------------------

class TestDashboard:
    def test_stats_shape(self, s, admin_headers):
        r = s.get(f"{API}/dashboard/stats", headers=admin_headers)
        assert r.status_code == 200
        body = r.json()
        for k in ("totals", "trend", "activity", "per_form"):
            assert k in body
        totals = body["totals"]
        for k in ("forms", "submissions", "today", "pending", "users", "storage_bytes"):
            assert k in totals and isinstance(totals[k], int)
        assert isinstance(body["trend"], list) and len(body["trend"]) == 14
        # totals should reflect at least the form+submission we just created
        assert totals["forms"] >= 1
        assert totals["submissions"] >= 1


# ------------------------- Users admin + RBAC -------------------------

class TestUsersAdmin:
    def test_list_users_as_admin(self, s, admin_headers):
        r = s.get(f"{API}/users", headers=admin_headers)
        assert r.status_code == 200
        assert any(u["email"] == ADMIN_EMAIL for u in r.json())

    def test_create_update_delete_user(self, s, admin_headers):
        suffix = uuid.uuid4().hex[:8]
        email = f"TEST_admin_create_{suffix}@example.com"
        c = s.post(f"{API}/users",
                   json={"email": email, "name": "T", "password": "Passw0rd!", "role": "member"},
                   headers=admin_headers)
        assert c.status_code == 200, c.text
        uid = c.json()["user_id"]
        # patch role
        p = s.patch(f"{API}/users/{uid}", json={"role": "admin", "is_active": False}, headers=admin_headers)
        assert p.status_code == 200
        assert p.json()["role"] == "admin"
        assert p.json()["is_active"] is False
        # delete
        d = s.delete(f"{API}/users/{uid}", headers=admin_headers)
        assert d.status_code == 200

    def test_regular_user_cannot_list_users(self, s, user_headers):
        r = s.get(f"{API}/users", headers=user_headers)
        assert r.status_code == 403


# ------------------------- RBAC: forms scoping for regular user -------------------------

class TestRbacForms:
    def test_user_only_sees_own_forms(self, s, user_headers, admin_headers, created_form):
        # list as regular user - should NOT include admin-owned form
        r = s.get(f"{API}/forms", headers=user_headers)
        assert r.status_code == 200
        ids = [f["form_id"] for f in r.json()]
        assert created_form["form_id"] not in ids

        # user creates own form
        body = {"title": "TEST user form", "fields": [], "status": "draft"}
        cr = s.post(f"{API}/forms", json=body, headers=user_headers)
        assert cr.status_code == 200
        own_id = cr.json()["form_id"]
        # appears in their list
        r2 = s.get(f"{API}/forms", headers=user_headers)
        assert own_id in [f["form_id"] for f in r2.json()]
        # cannot access admin's form
        r3 = s.get(f"{API}/forms/{created_form['form_id']}", headers=user_headers)
        assert r3.status_code == 403
        # cleanup
        s.delete(f"{API}/forms/{own_id}", headers=user_headers)


# ------------------------- Settings -------------------------

class TestSettings:
    def test_get_defaults_and_update_smtp(self, s, admin_headers):
        r = s.get(f"{API}/settings", headers=admin_headers)
        assert r.status_code == 200
        body = r.json()
        assert "smtp" in body
        # PUT smtp settings with real password, then GET back masked
        new = {
            "company_name": "TEST Co",
            "company_logo_url": "",
            "primary_color": "#123456",
            "smtp": {
                "host": "smtp.example.com",
                "port": 587,
                "username": "user@example.com",
                "password": "s3cret-pw",
                "from_email": "no-reply@example.com",
                "use_tls": True,
                "enabled": True,
            },
        }
        p = s.put(f"{API}/settings", json=new, headers=admin_headers)
        assert p.status_code == 200
        assert p.json()["smtp"]["password"] == "********"
        # GET shows masked
        g = s.get(f"{API}/settings", headers=admin_headers)
        assert g.status_code == 200
        assert g.json()["company_name"] == "TEST Co"
        assert g.json()["smtp"]["password"] == "********"
        # Putting back with masked password should keep the existing one
        masked = g.json()
        p2 = s.put(f"{API}/settings", json=masked, headers=admin_headers)
        assert p2.status_code == 200

    def test_non_admin_cannot_access_settings(self, s, user_headers):
        r = s.get(f"{API}/settings", headers=user_headers)
        assert r.status_code == 403


# ------------------------- Cleanup (soft-delete created form) -------------------------

def test_zz_cleanup_form(s, admin_headers, created_form):
    r = s.delete(f"{API}/forms/{created_form['form_id']}", headers=admin_headers)
    assert r.status_code == 200
    # listing again should not include it
    r2 = s.get(f"{API}/forms", headers=admin_headers)
    assert created_form["form_id"] not in [f["form_id"] for f in r2.json()]
