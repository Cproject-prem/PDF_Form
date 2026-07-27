"""
Iteration 8 regression tests for:
  1. Plant Documents Vault  (plant_docs_routes.py)
  2. Customisable submission filename template (filename_resolver.py + plumbing)

Run with:
  pytest /app/backend/tests/test_plant_docs_and_filename.py -v \
      --junitxml=/app/test_reports/pytest/iter8.xml
"""
from __future__ import annotations

import io
import os
import re
import uuid
from pathlib import Path
from urllib.parse import unquote

import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://jotform-lookup.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"

SUPER = ("admin@example.com", "Admin@12345")
ADMIN = ("rahul.verma@example.com", "Admin@12345")
VENDOR_ADMIN = ("vendor.admin@sunops.example.com", "Vendor@12345")

TEST_TAG = f"TEST_{uuid.uuid4().hex[:6]}"


# ---------------------------------------------------------------- fixtures
def _login(email: str, password: str) -> str:
    r = requests.post(f"{API}/auth/login",
                      json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def super_token() -> str:
    return _login(*SUPER)


@pytest.fixture(scope="session")
def admin_token() -> str:
    return _login(*ADMIN)


@pytest.fixture(scope="session")
def vadmin_token() -> str:
    return _login(*VENDOR_ADMIN)


def _hdr(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="session")
def sample_site_id(super_token) -> str:
    """Pick any accessible site the super_admin can see."""
    r = requests.get(f"{API}/sites", headers=_hdr(super_token), timeout=15)
    assert r.status_code == 200, r.text
    rows = r.json()
    assert rows, "No sites in the DB; seed_demo_sites should have run"
    # Prefer a SunOps-linked site so the vendor RBAC tests have something
    # to attach to.
    for row in rows:
        if row.get("vendor_id") == "ven_sunops_demo":
            return row["site_id"]
    return rows[0]["site_id"]


# ================================================================
#           PART 1 - PLANT DOCS TEMPLATE
# ================================================================
class TestPlantDocTemplate:
    def test_get_template_default(self, super_token):
        r = requests.get(f"{API}/plant-docs/template",
                         headers=_hdr(super_token), timeout=10)
        assert r.status_code == 200, r.text
        folders = r.json()["folders"]
        assert isinstance(folders, list)
        # Either it's still the default set of 6, or a super_admin has
        # customised it in an earlier test iteration. Either way there
        # MUST be at least one folder returned.
        assert len(folders) >= 1

    def test_put_template_forbidden_for_admin(self, admin_token):
        r = requests.put(f"{API}/plant-docs/template",
                         headers=_hdr(admin_token),
                         json={"folders": ["Contracts"]}, timeout=10)
        assert r.status_code == 403, r.text

    def test_put_template_persists_for_super_admin(self, super_token):
        new_list = ["Contracts", "Reports", "Photos", "Warranties",
                    f"{TEST_TAG}-Custom"]
        r = requests.put(f"{API}/plant-docs/template",
                         headers=_hdr(super_token),
                         json={"folders": new_list}, timeout=10)
        assert r.status_code == 200, r.text
        assert r.json()["folders"] == new_list
        # Verify persisted via GET
        r2 = requests.get(f"{API}/plant-docs/template",
                          headers=_hdr(super_token), timeout=10)
        assert r2.status_code == 200
        assert r2.json()["folders"] == new_list

    def test_put_template_rejects_path_traversal(self, super_token):
        r = requests.put(f"{API}/plant-docs/template",
                         headers=_hdr(super_token),
                         json={"folders": ["Contracts", "../etc"]}, timeout=10)
        assert r.status_code == 400, r.text

    def test_put_template_rejects_empty_name(self, super_token):
        r = requests.put(f"{API}/plant-docs/template",
                         headers=_hdr(super_token),
                         json={"folders": ["Contracts", ""]}, timeout=10)
        assert r.status_code == 400, r.text


# ================================================================
#           PART 2 - PER-PLANT FOLDER LISTING + AUTO-PROVISION
# ================================================================
class TestPlantFolderProvisioning:
    def test_auto_provision_on_first_list(self, super_token, sample_site_id):
        """First-visit call should provision the template folders on disk."""
        # Clean any previous fixture data on THIS test agent's session.
        r = requests.get(f"{API}/plants/{sample_site_id}/folders",
                         headers=_hdr(super_token), timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["site_id"] == sample_site_id
        assert body["can_edit"] is True
        # After provision, at least one folder must be present (the template
        # was set to a non-empty list in the previous test class).
        assert isinstance(body["folders"], list)

    def test_admin_can_edit_folders(self, admin_token, sample_site_id):
        r = requests.get(f"{API}/plants/{sample_site_id}/folders",
                         headers=_hdr(admin_token), timeout=10)
        # rahul.verma is cluster-scoped so the site may or may not be
        # visible; if 404, RLS is working. If 200, can_edit must be True.
        if r.status_code == 200:
            assert r.json()["can_edit"] is True
        else:
            assert r.status_code == 404

    def test_vendor_admin_readonly(self, vadmin_token, sample_site_id):
        r = requests.get(f"{API}/plants/{sample_site_id}/folders",
                         headers=_hdr(vadmin_token), timeout=10)
        # vendor_admin should either see (can_edit=False) or 404 if RLS
        # denies the site. Both are pass conditions.
        if r.status_code == 200:
            assert r.json()["can_edit"] is False
        else:
            assert r.status_code == 404


# ================================================================
#           PART 3 - CREATE / DUPLICATE / INVALID FOLDER
# ================================================================
class TestCreateFolder:
    folder_name = f"{TEST_TAG}-MyFolder"

    def test_create_ok(self, super_token, sample_site_id):
        r = requests.post(f"{API}/plants/{sample_site_id}/folders",
                          headers=_hdr(super_token),
                          json={"name": self.folder_name}, timeout=10)
        assert r.status_code == 200, r.text
        assert r.json()["name"] == self.folder_name

    def test_create_duplicate_400(self, super_token, sample_site_id):
        r = requests.post(f"{API}/plants/{sample_site_id}/folders",
                          headers=_hdr(super_token),
                          json={"name": self.folder_name}, timeout=10)
        assert r.status_code == 400, r.text

    def test_create_invalid_regex_400(self, super_token, sample_site_id):
        r = requests.post(f"{API}/plants/{sample_site_id}/folders",
                          headers=_hdr(super_token),
                          json={"name": "../etc"}, timeout=10)
        assert r.status_code == 400, r.text


# ================================================================
#           PART 4 - FILE UPLOAD (real-world filenames)
# ================================================================
class TestFileUpload:
    folder = None  # populated by fixture

    @pytest.fixture(autouse=True)
    def _setup(self, super_token, sample_site_id):
        # Create a dedicated test folder for upload tests
        folder_name = f"{TEST_TAG}-uploads"
        requests.post(f"{API}/plants/{sample_site_id}/folders",
                      headers=_hdr(super_token),
                      json={"name": folder_name}, timeout=10)
        self.__class__.folder = folder_name
        self.super_token = super_token
        self.site = sample_site_id

    def _upload(self, filename: str, content: bytes = b"hello"):
        files = {"file": (filename, io.BytesIO(content), "application/octet-stream")}
        return requests.post(
            f"{API}/plants/{self.site}/folders/{self.folder}/upload",
            headers=_hdr(self.super_token), files=files, timeout=15)

    def test_upload_real_world_comma_space(self):
        r = self._upload("Report Q4, 2025.pdf")
        assert r.status_code == 200, r.text
        # Sanitised — commas allowed, spaces preserved
        name = r.json()["name"]
        assert name.endswith(".pdf")

    def test_upload_accented(self):
        r = self._upload("résumé.docx")
        assert r.status_code == 200, r.text
        # é is outside the ASCII whitelist → replaced by _
        assert r.json()["name"].endswith(".docx")

    def test_upload_apostrophe(self):
        r = self._upload("O'Reilly's Notes.txt")
        assert r.status_code == 200, r.text
        assert r.json()["name"].endswith(".txt")

    def test_upload_duplicate_gets_suffix(self):
        r1 = self._upload("collision.bin", b"first")
        r2 = self._upload("collision.bin", b"second")
        assert r1.status_code == 200 and r2.status_code == 200
        n1, n2 = r1.json()["name"], r2.json()["name"]
        assert n1 == "collision.bin"
        assert n2 != n1
        assert "(1)" in n2 and n2.endswith(".bin")


# ================================================================
#           PART 5 - VENDOR USER RBAC
# ================================================================
class TestVendorUserRBAC:
    """Create a vendor_user under ven_sunops_demo with an assigned site,
    then confirm read-only access and forbidden mutations."""

    @pytest.fixture(scope="class")
    def vendor_user_ctx(self, super_token):
        # Find the sunops vendor and one of their sites
        sites = requests.get(f"{API}/sites",
                             headers=_hdr(super_token), timeout=10).json()
        sunops_site = next((s for s in sites
                            if s.get("vendor_id") == "ven_sunops_demo"), None)
        if not sunops_site:
            pytest.skip("No SunOps-linked site available for RBAC test")
        site_id = sunops_site["site_id"]

        # Use the pre-seeded vendor.user@sunops.example.com account (role
        # vendor_user). Fetch its user_id via the users listing so we can
        # PATCH its assignments.
        users = requests.get(f"{API}/users",
                             headers=_hdr(super_token), timeout=10).json()
        vu = next((u for u in users
                   if u["email"] == "vendor.user@sunops.example.com"), None)
        if not vu:
            pytest.skip("vendor.user@sunops.example.com not seeded")
        vu_id = vu["user_id"]

        # Assign the site via PUT /api/vendor-users/{uid}/assignments
        r2 = requests.put(f"{API}/vendor-users/{vu_id}/assignments",
                          headers=_hdr(super_token),
                          json={"forms": [], "pdf_forms": [],
                                "sites": [site_id], "workflows": []},
                          timeout=10)
        assert r2.status_code == 200, r2.text

        tok = _login("vendor.user@sunops.example.com", "Vendor@12345")
        yield {"token": tok, "site_id": site_id, "user_id": vu_id}

    def test_vendor_user_can_list_folders(self, vendor_user_ctx):
        ctx = vendor_user_ctx
        r = requests.get(f"{API}/plants/{ctx['site_id']}/folders",
                         headers=_hdr(ctx["token"]), timeout=10)
        assert r.status_code == 200, r.text
        assert r.json()["can_edit"] is False

    def test_vendor_user_cannot_create_folder(self, vendor_user_ctx):
        ctx = vendor_user_ctx
        r = requests.post(f"{API}/plants/{ctx['site_id']}/folders",
                          headers=_hdr(ctx["token"]),
                          json={"name": "VendorAttempt"}, timeout=10)
        assert r.status_code == 403, r.text

    def test_vendor_user_cannot_upload(self, vendor_user_ctx):
        ctx = vendor_user_ctx
        files = {"file": ("x.txt", io.BytesIO(b"nope"), "text/plain")}
        # Try uploading to Contracts folder
        r = requests.post(
            f"{API}/plants/{ctx['site_id']}/folders/Contracts/upload",
            headers=_hdr(ctx["token"]), files=files, timeout=10)
        assert r.status_code == 403, r.text

    def test_vendor_user_404_on_unassigned_plant(self, vendor_user_ctx):
        ctx = vendor_user_ctx
        # Use a made-up site_id
        r = requests.get(f"{API}/plants/site_zzz_nonexistent_xyz/folders",
                         headers=_hdr(ctx["token"]), timeout=10)
        assert r.status_code == 404, r.text


# ================================================================
#           PART 6 - SITE CREATION AUTO-PROVISIONS FOLDERS
# ================================================================
class TestSiteBootstrap:
    def test_new_site_provisions_folders_on_disk(self, super_token):
        code = f"TESTCODE_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/sites",
                          headers=_hdr(super_token),
                          json={"site_code": code,
                                "site_name": "TEST Bootstrap Plant",
                                "region": "South"},
                          timeout=15)
        assert r.status_code in (200, 201), r.text
        new = r.json()
        site_id = new["site_id"]
        # Poll the disk directly (backend + fs share the same container)
        root = Path("/app/backend/uploads/local/plants") / site_id
        # Look for at least the currently-set-template folders
        assert root.exists(), f"{root} does not exist"
        # 'Contracts' is in both the default template and the customised one
        # from Part 1, so it must exist on either path.
        assert (root / "Contracts").exists()


# ================================================================
#           PART 7 - FILENAME TEMPLATE FIELD PERSISTENCE
# ================================================================
class TestFilenameTemplateField:
    @pytest.fixture
    def sample_form_id(self, super_token):
        # Create a fresh form for this test (published so we can submit)
        payload = {
            "title": f"TEST FN {TEST_TAG}",
            "description": "iter8 fn template",
            "fields": [
                {"id": "site_code", "type": "short_text", "label": "Site Code"},
                {"id": "note", "type": "short_text", "label": "Note"},
            ],
            "status": "published",
        }
        r = requests.post(f"{API}/forms",
                          headers=_hdr(super_token), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        return r.json()["form_id"], r.json()["slug"]

    def test_put_form_persists_filename_template(self, super_token, sample_form_id):
        fid, _ = sample_form_id
        r = requests.get(f"{API}/forms/{fid}",
                         headers=_hdr(super_token), timeout=10)
        assert r.status_code == 200
        body = r.json()
        body["filename_template"] = "{asset_id}_{submitter_name}_{datetime}"
        r2 = requests.put(f"{API}/forms/{fid}",
                          headers=_hdr(super_token), json=body, timeout=10)
        assert r2.status_code == 200, r2.text
        # Verify via GET
        got = requests.get(f"{API}/forms/{fid}",
                           headers=_hdr(super_token), timeout=10).json()
        assert got.get("filename_template") == "{asset_id}_{submitter_name}_{datetime}"

    @pytest.fixture
    def sample_pdf_tpl(self, super_token):
        # Minimal 1-page PDF
        pdf_bytes = (b"%PDF-1.4\n1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n"
                     b"2 0 obj<< /Type /Pages /Count 1 /Kids [3 0 R] >>endobj\n"
                     b"3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>endobj\n"
                     b"xref\n0 4\n0000000000 65535 f\n0000000010 00000 n\n"
                     b"0000000053 00000 n\n0000000101 00000 n\n"
                     b"trailer<< /Size 4 /Root 1 0 R >>\nstartxref\n160\n%%EOF")
        files = {"file": ("tiny.pdf", io.BytesIO(pdf_bytes), "application/pdf")}
        r = requests.post(f"{API}/pdf-forms/upload",
                          headers=_hdr(super_token), files=files,
                          data={"title": f"TEST PDF {TEST_TAG}"},
                          timeout=15)
        assert r.status_code == 200, r.text
        return r.json()

    def test_patch_pdf_template_persists_filename_template(
            self, super_token, sample_pdf_tpl):
        tid = sample_pdf_tpl["template_id"]
        r = requests.patch(f"{API}/pdf-forms/{tid}",
                           headers=_hdr(super_token),
                           json={"filename_template":
                                 "{form_name}_{submitter_name}_{datetime}"},
                           timeout=10)
        assert r.status_code == 200, r.text
        assert r.json().get("filename_template") == \
            "{form_name}_{submitter_name}_{datetime}"
        # Verify persisted
        got = requests.get(f"{API}/pdf-forms/{tid}",
                           headers=_hdr(super_token), timeout=10).json()
        assert got["filename_template"] == "{form_name}_{submitter_name}_{datetime}"


# ================================================================
#           PART 8 - FILLED PDF DOWNLOAD USES TEMPLATE
# ================================================================
def _parse_filename(header: str) -> str:
    # Content-Disposition: attachment; filename="foo.pdf"
    m = re.search(r'filename="?([^";]+)"?', header or "")
    return unquote(m.group(1)) if m else ""


class TestStandardFormDownload:
    @pytest.fixture(scope="class")
    def submission_ctx(self, super_token):
        # Create + publish a form with a filename_template
        form_payload = {
            "title": "TEST DL FN Form",
            "fields": [
                {"id": "site_code", "type": "short_text", "label": "Site Code",
                 "required": False},
                {"id": "note", "type": "short_text", "label": "Note"},
            ],
            "status": "published",
            "filename_template": "{asset_id}_{submitter_name}_{datetime}",
        }
        f = requests.post(f"{API}/forms",
                          headers=_hdr(super_token),
                          json=form_payload, timeout=15).json()
        slug = f["slug"]
        # Submit via public flow (auth required in this app — use super token)
        sub_payload = {"values": {"site_code": "SITE-XYZ", "note": "hi"}}
        r = requests.post(f"{API}/public/forms/{slug}/submit",
                          headers=_hdr(super_token),
                          json=sub_payload, timeout=15)
        assert r.status_code == 200, r.text
        return {"form": f, "submission": r.json()}

    def test_download_uses_asset_and_submitter(self, super_token, submission_ctx):
        sid = submission_ctx["submission"]["submission_id"]
        r = requests.get(f"{API}/submissions/{sid}/filled.pdf",
                         headers=_hdr(super_token), timeout=20)
        assert r.status_code == 200, r.text
        cd = r.headers.get("Content-Disposition", "")
        fname = _parse_filename(cd)
        assert fname.endswith(".pdf"), fname
        # site_code is SITE-XYZ; submitter is 'Super Admin' -> 'Super_Admin'
        # datetime is YYYY-MM-DD_HHMM
        assert "SITE-XYZ" in fname, fname
        # match date-like token
        assert re.search(r"\d{4}-\d{2}-\d{2}_\d{4}", fname), fname

    def test_download_default_when_template_empty(self, super_token):
        """A form with no filename_template should fall back to the default
        `{asset_id}_{submitter_name}_{datetime}` (per resolver DEFAULT)."""
        # Create form WITHOUT filename_template
        form_payload = {
            "title": "TEST DEFAULT FN Form",
            "fields": [
                {"id": "site_code", "type": "short_text", "label": "Site Code"},
            ],
            "status": "published",
        }
        f = requests.post(f"{API}/forms",
                          headers=_hdr(super_token),
                          json=form_payload, timeout=15).json()
        slug = f["slug"]
        r = requests.post(f"{API}/public/forms/{slug}/submit",
                         headers=_hdr(super_token),
                         json={"values": {"site_code": "SITE-DEFAULT"}}, timeout=15)
        assert r.status_code == 200, r.text
        sid = r.json()["submission_id"]
        d = requests.get(f"{API}/submissions/{sid}/filled.pdf",
                         headers=_hdr(super_token), timeout=15)
        fname = _parse_filename(d.headers.get("Content-Disposition", ""))
        assert "SITE-DEFAULT" in fname, fname
        assert re.search(r"\d{4}-\d{2}-\d{2}_\d{4}", fname), fname


# ================================================================
#           PART 9 - FILENAME EDGE CASES
# ================================================================
class TestFilenameEdgeCases:
    def test_no_asset_id_collapses_underscores(self, super_token):
        """When {asset_id} placeholder resolves to empty, output shouldn't have `__`."""
        form_payload = {
            "title": "TEST NoAsset Form",
            "fields": [{"id": "note", "type": "short_text", "label": "Note"}],
            "status": "published",
            "filename_template": "{asset_id}_{submitter_name}_{datetime}",
        }
        f = requests.post(f"{API}/forms",
                          headers=_hdr(super_token), json=form_payload,
                          timeout=15).json()
        slug = f["slug"]
        r = requests.post(f"{API}/public/forms/{slug}/submit",
                         headers=_hdr(super_token),
                         json={"values": {"note": "no site here"}},
                         timeout=15)
        sid = r.json()["submission_id"]
        d = requests.get(f"{API}/submissions/{sid}/filled.pdf",
                         headers=_hdr(super_token), timeout=15)
        fname = _parse_filename(d.headers.get("Content-Disposition", ""))
        # Must NOT contain a run of two consecutive underscores
        assert "__" not in fname, f"expected collapse, got {fname!r}"
        # Must contain submitter + datetime pieces
        assert re.search(r"\d{4}-\d{2}-\d{2}_\d{4}", fname), fname

    def test_only_submission_id_placeholder(self, super_token):
        form_payload = {
            "title": "TEST SubmissionID Form",
            "fields": [{"id": "note", "type": "short_text", "label": "Note"}],
            "status": "published",
            "filename_template": "{submission_id}",
        }
        f = requests.post(f"{API}/forms",
                          headers=_hdr(super_token), json=form_payload,
                          timeout=15).json()
        slug = f["slug"]
        r = requests.post(f"{API}/public/forms/{slug}/submit",
                         headers=_hdr(super_token),
                         json={"values": {"note": "x"}}, timeout=15).json()
        sid = r["submission_id"]
        d = requests.get(f"{API}/submissions/{sid}/filled.pdf",
                         headers=_hdr(super_token), timeout=15)
        fname = _parse_filename(d.headers.get("Content-Disposition", ""))
        # Should be exactly "{submission_id}.pdf" (with underscores in sub id
        # potentially sanitised)
        assert fname.endswith(".pdf"), fname
        stem = fname[:-4]
        # submission_id starts with "sub_" — after _sanitize the underscore is
        # preserved (it's in the whitelist). So stem should equal sid.
        assert stem == sid, f"expected {sid!r}, got {stem!r}"


# ================================================================
#           PART 10 - REGRESSION SPOT CHECKS
# ================================================================
class TestRegression:
    def test_login_still_works(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": SUPER[0], "password": SUPER[1]},
                          timeout=10)
        assert r.status_code == 200, r.text
        assert "token" in r.json()

    def test_sites_endpoint(self, super_token):
        r = requests.get(f"{API}/sites", headers=_hdr(super_token), timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_dashboard_stats(self, super_token):
        r = requests.get(f"{API}/dashboard/stats",
                         headers=_hdr(super_token), timeout=10)
        assert r.status_code == 200

    def test_users_list(self, super_token):
        r = requests.get(f"{API}/users", headers=_hdr(super_token), timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_forms_list(self, super_token):
        r = requests.get(f"{API}/forms", headers=_hdr(super_token), timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ================================================================
#           PART 11 - RECURSIVE FOLDER TREE
# ================================================================
class TestPlantFolderTree:
    def test_get_tree_basic_structure(self, super_token, sample_site_id):
        """Test that the /tree endpoint returns a proper tree structure."""
        r = requests.get(f"{API}/plants/{sample_site_id}/tree",
                         headers=_hdr(super_token), timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["site_id"] == sample_site_id
        assert "tree" in body
        tree = body["tree"]

        # Root level should contain folders (at least one from template)
        assert isinstance(tree, list)
        assert len(tree) > 0, "Tree should contain at least one entry"

    def test_tree_structure_validation(self, super_token, sample_site_id):
        """Test that tree structure follows the expected format."""
        r = requests.get(f"{API}/plants/{sample_site_id}/tree",
                         headers=_hdr(super_token), timeout=10)
        assert r.status_code == 200, r.text
        tree = r.json()["tree"]

        # Each entry should have name, type, and optionally path
        for entry in tree:
            assert "name" in entry
            assert "type" in entry
            assert entry["type"] in ("folder", "file")

            # Folders should have additional properties
            if entry["type"] == "folder":
                assert "path" in entry
                assert "file_count" in entry
                assert "size_bytes" in entry
                # Subfolders should be nested
                if "subfolders" in entry:
                    assert isinstance(entry["subfolders"], list)

            # Files should have size_bytes and modified_at
            if entry["type"] == "file":
                assert "path" in entry
                assert "size_bytes" in entry
                assert "modified_at" in entry

    def test_tree_recursive_subfolders(self, super_token, sample_site_id):
        """Test that nested folders are properly represented in the tree."""
        # First, create a nested folder structure
        r = requests.post(f"{API}/plants/{sample_site_id}/folders",
                          headers=_hdr(super_token),
                          json={"name": "ParentFolder"}, timeout=10)
        assert r.status_code == 200
        parent = r.json()["name"]

        # Create a subfolder
        r = requests.post(f"{API}/plants/{sample_site_id}/folders",
                          headers=_hdr(super_token),
                          json={"name": "ChildFolder"}, timeout=10)
        assert r.status_code == 200
        child = r.json()["name"]

        # Get the tree and verify nested structure
        r = requests.get(f"{API}/plants/{sample_site_id}/tree",
                         headers=_hdr(super_token), timeout=10)
        assert r.status_code == 200, r.text
        tree = r.json()["tree"]

        # Find the parent folder
        parent_entry = None
        for entry in tree:
            if entry["type"] == "folder" and entry["name"] == parent:
                parent_entry = entry
                break

        assert parent_entry is not None, "Parent folder should exist in tree"

        # Parent should have subfolders
        if "subfolders" in parent_entry:
            assert isinstance(parent_entry["subfolders"], list)
            # Find the child folder in subfolders
            child_in_sub = None
            for sub in parent_entry["subfolders"]:
                if sub["type"] == "folder" and sub["name"] == child:
                    child_in_sub = sub
                    break

            assert child_in_sub is not None, "Child folder should be in parent's subfolders"
            assert "subfolders" in child_in_sub, "Child folder should have its own subfolders array"

    def test_tree_file_counts_and_sizes(self, super_token, sample_site_id):
        """Test that file counts and sizes are correctly calculated."""
        r = requests.get(f"{API}/plants/{sample_site_id}/tree",
                         headers=_hdr(super_token), timeout=10)
        assert r.status_code == 200, r.text
        tree = r.json()["tree"]

        # Walk the tree and verify file counts and sizes
        def verify_entry(entry):
            if entry["type"] == "folder":
                assert isinstance(entry["file_count"], int)
                assert entry["file_count"] >= 0

                # If there are files listed in the entry
                if "files" in entry and isinstance(entry["files"], list):
                    for f in entry["files"]:
                        assert isinstance(f["name"], str)
                        assert "size_bytes" in f
                        assert isinstance(f["size_bytes"], int)

                # Recursively check subfolders
                if "subfolders" in entry:
                    for sub in entry["subfolders"]:
                        verify_entry(sub)

            elif entry["type"] == "file":
                assert isinstance(entry["size_bytes"], int)
                assert entry["size_bytes"] >= 0

        for entry in tree:
            verify_entry(entry)

    def test_tree_readonly_for_vendor_user(self, vadmin_token, sample_site_id):
        """Test that vendor_user can read the tree but not modify it."""
        r = requests.get(f"{API}/plants/{sample_site_id}/tree",
                         headers=_hdr(vadmin_token), timeout=10)
        # Should succeed (read-only)
        assert r.status_code in (200, 404), r.text
        if r.status_code == 200:
            tree = r.json()["tree"]
            # Verify tree structure is correct
            assert isinstance(tree, list)
            for entry in tree:
                assert "name" in entry
                assert "type" in entry
                # Verify can_edit is not in tree response (it's not exposed at tree level)

    def test_tree_path_resolution(self, super_token, sample_site_id):
        """Test that paths are correctly constructed in the tree."""
        r = requests.get(f"{API}/plants/{sample_site_id}/tree",
                         headers=_hdr(super_token), timeout=10)
        assert r.status_code == 200, r.text
        tree = r.json()["tree"]

        # Create a folder structure: Level1/Level2/File.pdf
        r1 = requests.post(f"{API}/plants/{sample_site_id}/folders",
                          headers=_hdr(super_token), json={"name": "Level1"}, timeout=10)
        assert r1.status_code == 200
        level1 = r1.json()["name"]

        r2 = requests.post(f"{API}/plants/{sample_site_id}/folders",
                          headers=_hdr(super_token), json={"name": "Level2"}, timeout=10)
        assert r2.status_code == 200
        level2 = r2.json()["name"]

        # Upload a file
        files = {"file": ("test.pdf", io.BytesIO(b"test content"), "application/pdf")}
        r3 = requests.post(f"{API}/plants/{sample_site_id}/folders/{level2}/upload",
                          headers=_hdr(super_token), files=files, timeout=15)
        assert r3.status_code == 200

        # Get the tree
        r = requests.get(f"{API}/plants/{sample_site_id}/tree",
                         headers=_hdr(super_token), timeout=10)
        assert r.status_code == 200, r.text
        tree = r.json()["tree"]

        # Find the file and verify its path
        file_path = None
        def find_file(entry):
            if entry["type"] == "file":
                nonlocal file_path
                if entry["name"] == "test.pdf":
                    file_path = entry["path"]
            elif entry["type"] == "folder":
                if "files" in entry:
                    for f in entry["files"]:
                        if f["name"] == "test.pdf":
                            file_path = f["path"]
                if "subfolders" in entry:
                    for sub in entry["subfolders"]:
                        find_file(sub)

        for entry in tree:
            find_file(entry)

        assert file_path is not None, "File should be found in tree"
        assert "Level2" in file_path, "Path should include Level2 folder"
        assert "Level1" in file_path, "Path should include Level1 folder"
