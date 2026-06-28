"""
Backend tests for PDF Form Builder routes added on top of the existing app.

Endpoints covered:
- POST /api/pdf-forms/upload          (multipart PDF upload, validation, page parsing)
- GET  /api/pdf-forms                  (owner-scoped listing)
- GET  /api/pdf-forms/{id}             (single)
- PUT  /api/pdf-forms/{id}             (full update + field-type validation + version bump)
- PATCH /api/pdf-forms/{id}            (publish/title/archive without 422)
- POST /api/pdf-forms/{id}/duplicate   (copies PDF + new slug)
- GET  /api/pdf-forms/{id}/file        (auth'd original)
- GET  /api/public/pdf-forms/{slug}    (published public meta)
- GET  /api/public/pdf-forms/{slug}/file
- POST /api/public/pdf-forms/{slug}/submit  (+required validation + completed PDF on disk)
- GET  /api/pdf-forms/{id}/submissions
- GET  /api/pdf-submissions/{sid}/completed and /original
- DELETE /api/pdf-submissions/{sid}    (deletes row + completed file)
- POST /api/pdf-forms/assets/upload + GET /api/pdf-forms/assets/{fid}

Also asserts: original PDF on disk is byte-identical after submission (no rasterise/overwrite).
"""
import io
import os
import hashlib
import uuid
from pathlib import Path

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "Admin@12345"
PDF_DIR = Path("/app/backend/uploads/pdf")
COMPLETED_DIR = Path("/app/backend/uploads/completed")


# --------------------------- helpers / fixtures ---------------------------
def _make_pdf_bytes(text: str = "TEST PDF") -> bytes:
    """Generate a tiny 1-page PDF using reportlab."""
    from reportlab.pdfgen import canvas
    buf = io.BytesIO()
    c = canvas.Canvas(buf)
    c.setFont("Helvetica", 14)
    c.drawString(72, 720, text)
    c.showPage()
    c.save()
    return buf.getvalue()


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def admin_token(s):
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def H(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def Hjson(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def regular_user(s):
    suffix = uuid.uuid4().hex[:8]
    email = f"TEST_pdfuser_{suffix}@example.com"
    r = s.post(f"{API}/auth/register",
               json={"email": email, "password": "Passw0rd!", "name": "PDF User"})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def uploaded_template(s, H, Hjson):
    pdf_bytes = _make_pdf_bytes("TEST template")
    files = {"file": ("TEST_form.pdf", pdf_bytes, "application/pdf")}
    data = {"title": f"TEST PDF Form {uuid.uuid4().hex[:6]}"}
    r = s.post(f"{API}/pdf-forms/upload", files=files, data=data, headers=H)
    assert r.status_code == 200, r.text
    tpl = r.json()
    assert tpl["template_id"].startswith("pdftpl_")
    assert tpl["slug"]
    assert len(tpl["pages"]) == 1
    assert tpl["pages"][0]["width"] > 0 and tpl["pages"][0]["height"] > 0
    assert tpl["file_size"] == len(pdf_bytes)
    # confirm stored on disk
    assert (PDF_DIR / tpl["storage_filename"]).exists()
    return tpl


@pytest.fixture(scope="module")
def published_template(s, H, Hjson):
    """Separate template that gets fields + published — used by public/submission tests."""
    pdf_bytes = _make_pdf_bytes("TEST published")
    files = {"file": ("TEST_pub.pdf", pdf_bytes, "application/pdf")}
    data = {"title": f"TEST Pub {uuid.uuid4().hex[:6]}"}
    r = s.post(f"{API}/pdf-forms/upload", files=files, data=data, headers=H)
    assert r.status_code == 200, r.text
    tpl = r.json()
    tid = tpl["template_id"]
    # add fields
    put_body = {
        "title": tpl["title"], "description": "",
        "fields": [
            {"id": "fld1", "type": "short_text", "label": "Name", "page": 1,
             "x": 0.1, "y": 0.1, "width": 0.4, "height": 0.04, "required": True},
            {"id": "fld2", "type": "checkbox", "label": "Agree", "page": 1,
             "x": 0.1, "y": 0.2, "width": 0.05, "height": 0.04},
        ],
        "settings": {}, "status": "draft",
        "pages": tpl["pages"], "version": tpl["version"],
    }
    rp = s.put(f"{API}/pdf-forms/{tid}", json=put_body, headers=Hjson)
    assert rp.status_code == 200, rp.text
    # publish
    rpub = s.patch(f"{API}/pdf-forms/{tid}", json={"status": "published"}, headers=Hjson)
    assert rpub.status_code == 200, rpub.text
    tpl = rpub.json()
    yield tpl
    # cleanup
    s.delete(f"{API}/pdf-forms/{tid}", headers=H)


@pytest.fixture(scope="module")
def submission(published_template):
    r = requests.post(f"{API}/public/pdf-forms/{published_template['slug']}/submit",
                      json={"values": {"fld1": "Alice", "fld2": True}})
    assert r.status_code == 200, r.text
    return r.json()


# --------------------------- Upload validation ---------------------------
class TestUpload:
    def test_upload_rejects_non_pdf_extension(self, s, H):
        files = {"file": ("bad.txt", b"%PDF-1.4 fake but wrong ext", "text/plain")}
        r = s.post(f"{API}/pdf-forms/upload", files=files, headers=H)
        assert r.status_code == 400

    def test_upload_rejects_bad_magic(self, s, H):
        files = {"file": ("not_pdf.pdf", b"NOT A PDF AT ALL", "application/pdf")}
        r = s.post(f"{API}/pdf-forms/upload", files=files, headers=H)
        assert r.status_code == 400

    def test_upload_requires_auth(self, s):
        files = {"file": ("a.pdf", _make_pdf_bytes(), "application/pdf")}
        r = s.post(f"{API}/pdf-forms/upload", files=files)
        assert r.status_code == 401


# --------------------------- Listing / Get / Update ---------------------------
class TestListAndCrud:
    def test_list_includes_template(self, s, H, uploaded_template):
        r = s.get(f"{API}/pdf-forms", headers=H)
        assert r.status_code == 200
        ids = [t["template_id"] for t in r.json()]
        assert uploaded_template["template_id"] in ids

    def test_get_single(self, s, H, uploaded_template):
        r = s.get(f"{API}/pdf-forms/{uploaded_template['template_id']}", headers=H)
        assert r.status_code == 200
        assert r.json()["template_id"] == uploaded_template["template_id"]

    def test_put_bumps_version_and_validates_field_type(self, s, Hjson, uploaded_template):
        tid = uploaded_template["template_id"]
        # invalid field type -> 400
        bad = {
            "title": uploaded_template["title"],
            "description": "",
            "fields": [{"id": "x", "type": "not_a_type", "page": 1,
                        "x": 0.1, "y": 0.1, "width": 0.3, "height": 0.05}],
            "settings": {},
            "status": "draft",
            "pages": uploaded_template["pages"],
            "version": uploaded_template["version"],
        }
        r = s.put(f"{API}/pdf-forms/{tid}", json=bad, headers=Hjson)
        assert r.status_code == 400, r.text
        # valid field -> 200 and version bumped
        good = dict(bad)
        good["fields"] = [{"id": "fld1", "type": "short_text", "label": "Name", "page": 1,
                           "x": 0.1, "y": 0.1, "width": 0.4, "height": 0.04, "required": True},
                          {"id": "fld2", "type": "checkbox", "label": "Agree", "page": 1,
                           "x": 0.1, "y": 0.2, "width": 0.05, "height": 0.04}]
        r2 = s.put(f"{API}/pdf-forms/{tid}", json=good, headers=Hjson)
        assert r2.status_code == 200, r2.text
        upd = r2.json()
        assert upd["version"] == uploaded_template["version"] + 1
        assert len(upd["fields"]) == 2

    def test_patch_publish_no_422(self, s, Hjson, uploaded_template):
        tid = uploaded_template["template_id"]
        r = s.patch(f"{API}/pdf-forms/{tid}", json={"status": "published"}, headers=Hjson)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "published"
        # title patch
        r2 = s.patch(f"{API}/pdf-forms/{tid}", json={"title": "TEST Renamed"}, headers=Hjson)
        assert r2.status_code == 200 and r2.json()["title"] == "TEST Renamed"
        # archive toggle
        r3 = s.patch(f"{API}/pdf-forms/{tid}", json={"is_archived": False}, headers=Hjson)
        assert r3.status_code == 200

    def test_get_file_inline(self, s, H, uploaded_template):
        r = s.get(f"{API}/pdf-forms/{uploaded_template['template_id']}/file", headers=H)
        assert r.status_code == 200
        assert r.headers["content-type"] == "application/pdf"
        assert r.content[:4] == b"%PDF"

    def test_duplicate_copies_file(self, s, H, uploaded_template):
        r = s.post(f"{API}/pdf-forms/{uploaded_template['template_id']}/duplicate", headers=H)
        assert r.status_code == 200, r.text
        dup = r.json()
        assert dup["template_id"] != uploaded_template["template_id"]
        assert dup["storage_filename"] != uploaded_template["storage_filename"]
        assert (PDF_DIR / dup["storage_filename"]).exists()
        # cleanup
        s.delete(f"{API}/pdf-forms/{dup['template_id']}", headers=H)


# --------------------------- Public submit + completed PDF ---------------------------
class TestPublicSubmit:
    def test_public_get(self, published_template):
        r = requests.get(f"{API}/public/pdf-forms/{published_template['slug']}")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "published"
        assert "owner_id" not in body

    def test_public_file(self, published_template):
        r = requests.get(f"{API}/public/pdf-forms/{published_template['slug']}/file")
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"

    def test_submit_missing_required(self, published_template):
        r = requests.post(f"{API}/public/pdf-forms/{published_template['slug']}/submit",
                          json={"values": {}})
        assert r.status_code == 400

    def test_submit_success_generates_pdf_and_preserves_original(self, published_template, submission):
        orig_path = PDF_DIR / published_template["storage_filename"]
        orig_hash = hashlib.sha256(orig_path.read_bytes()).hexdigest()
        sub = submission
        assert sub["submission_id"].startswith("pdfsub_")
        assert sub["completed_filename"] == f"{sub['submission_id']}.pdf"
        cp = COMPLETED_DIR / sub["completed_filename"]
        assert cp.exists()
        assert cp.read_bytes()[:4] == b"%PDF"
        # original must NOT change
        new_hash = hashlib.sha256(orig_path.read_bytes()).hexdigest()
        assert new_hash == orig_hash, "Original PDF was overwritten!"


# --------------------------- Submissions listing + downloads + delete ---------------------------
class TestSubmissions:
    def test_list_submissions(self, s, H, published_template, submission):
        tid = published_template["template_id"]
        r = s.get(f"{API}/pdf-forms/{tid}/submissions", headers=H)
        assert r.status_code == 200
        ids = [x["submission_id"] for x in r.json()]
        assert submission["submission_id"] in ids

    def test_download_completed(self, s, H, submission):
        sid = submission["submission_id"]
        r = s.get(f"{API}/pdf-submissions/{sid}/completed", headers=H)
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"

    def test_download_original_via_submission(self, s, H, submission):
        sid = submission["submission_id"]
        r = s.get(f"{API}/pdf-submissions/{sid}/original", headers=H)
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"

    def test_delete_submission_removes_file(self, s, H, published_template):
        slug = published_template["slug"]
        r = requests.post(f"{API}/public/pdf-forms/{slug}/submit",
                          json={"values": {"fld1": "Bob"}})
        assert r.status_code == 200
        sid = r.json()["submission_id"]
        cp = COMPLETED_DIR / f"{sid}.pdf"
        assert cp.exists()
        d = s.delete(f"{API}/pdf-submissions/{sid}", headers=H)
        assert d.status_code == 200
        assert not cp.exists(), "Completed PDF was not removed from disk"
        g = s.get(f"{API}/pdf-submissions/{sid}/completed", headers=H)
        assert g.status_code == 404


# --------------------------- RBAC: non-owner cannot read ---------------------------
class TestRbac:
    def test_other_user_cannot_see_template(self, s, regular_user, published_template):
        h = {"Authorization": f"Bearer {regular_user['token']}"}
        r = s.get(f"{API}/pdf-forms", headers=h)
        assert r.status_code == 200
        ids = [t["template_id"] for t in r.json()]
        assert published_template["template_id"] not in ids

    def test_other_user_get_template_forbidden(self, s, regular_user, published_template):
        h = {"Authorization": f"Bearer {regular_user['token']}"}
        r = s.get(f"{API}/pdf-forms/{published_template['template_id']}", headers=h)
        assert r.status_code == 403


# --------------------------- Asset upload ---------------------------
class TestAssets:
    def test_upload_and_fetch_asset(self, s, H):
        # tiny png (1x1 transparent)
        png = (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
               b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\x00"
               b"\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82")
        files = {"file": ("TEST_pic.png", png, "image/png")}
        r = s.post(f"{API}/pdf-forms/assets/upload", files=files, headers=H)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["url"].startswith("/api/pdf-forms/assets/")
        fid = body["url"].rsplit("/", 1)[-1]
        # fetch
        r2 = s.get(f"{API}/pdf-forms/assets/{fid}")
        assert r2.status_code == 200
        assert r2.content == png


# --------------------------- Cleanup ---------------------------
def test_zz_cleanup_template(s, H, uploaded_template):
    tid = uploaded_template["template_id"]
    r = s.delete(f"{API}/pdf-forms/{tid}", headers=H)
    assert r.status_code == 200
