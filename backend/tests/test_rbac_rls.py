"""FormForge iteration-2: 4-role RBAC + Row-Level Security backend tests.

Covers:
  - /api/auth/menu role-specific menu output
  - /api/sites RLS for super_admin / admin (cluster manager) / vendor_admin / vendor_user
  - /api/lookup/options RLS (site_name list per role)
  - /api/lookup/resolve cross-vendor block
  - /api/submissions RLS
  - form_filter (assigned_vendor_ids gating) on /api/forms
  - write guard (vendor_user cannot PUT a form)
  - master-data guard (non-super_admin cannot create/edit sites)
  - PDF form parity (data_source / lookup / formula on PDFField, plus assignment fields)
"""
import os
import uuid

import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://jotform-lookup.preview.emergentagent.com").rstrip("/")

ACCOUNTS = {
    "super":   ("admin@example.com",                  "Admin@12345"),
    "admin":   ("rahul.verma@example.com",            "Admin@12345"),   # cluster_manager_name='Rahul Verma'
    "v_admin": ("vendor.admin@sunops.example.com",    "Vendor@12345"),
    "v_user":  ("vendor.user@sunops.example.com",     "Vendor@12345"),
}


def _login(email, password):
    r = requests.post(f"{BASE}/api/auth/login",
                      json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def tokens():
    return {k: _login(*v) for k, v in ACCOUNTS.items()}


# ---------------------------------------------------------------------------
# /api/auth/menu role-specific
# ---------------------------------------------------------------------------
class TestAuthMenu:
    def test_super_admin_menu(self, tokens):
        r = requests.get(f"{BASE}/api/auth/menu", headers=_h(tokens["super"]), timeout=10)
        assert r.status_code == 200
        d = r.json()
        keys = [m["key"] for m in d["menu"]]
        assert d["role"] == "super_admin"
        for k in ("dashboard", "forms", "pdf-forms", "users", "smtp", "settings"):
            assert k in keys, f"super_admin missing menu key {k}"
        assert len(keys) >= 14

    def test_admin_menu_no_users_smtp_settings(self, tokens):
        r = requests.get(f"{BASE}/api/auth/menu", headers=_h(tokens["admin"]), timeout=10)
        assert r.status_code == 200
        d = r.json()
        keys = set(m["key"] for m in d["menu"])
        for k in ("dashboard", "forms", "pdf-forms", "submissions",
                  "workflows", "approvals", "site-master", "vendors", "reports"):
            assert k in keys, f"admin missing menu key {k}"
        for forbidden in ("users", "smtp", "settings"):
            assert forbidden not in keys, f"admin should NOT see {forbidden}"

    def test_vendor_admin_menu(self, tokens):
        r = requests.get(f"{BASE}/api/auth/menu", headers=_h(tokens["v_admin"]), timeout=10)
        assert r.status_code == 200
        keys = set(m["key"] for m in r.json()["menu"])
        assert keys == {"manpower", "forms", "submissions", "team"}, keys

    def test_vendor_user_menu(self, tokens):
        r = requests.get(f"{BASE}/api/auth/menu", headers=_h(tokens["v_user"]), timeout=10)
        assert r.status_code == 200
        keys = set(m["key"] for m in r.json()["menu"])
        assert keys == {"forms", "submissions"}, keys


# ---------------------------------------------------------------------------
# /api/sites RLS
# ---------------------------------------------------------------------------
class TestSitesRLS:
    def test_super_admin_sees_all(self, tokens):
        r = requests.get(f"{BASE}/api/sites", headers=_h(tokens["super"]), timeout=10)
        assert r.status_code == 200, r.text
        names = sorted([s["site_name"] for s in r.json()])
        assert names == ["Alpha Solar 50MW", "Bravo Wind 30MW", "Charlie Hybrid 25MW"]

    def test_cluster_manager_admin_sees_alpha_bravo(self, tokens):
        r = requests.get(f"{BASE}/api/sites", headers=_h(tokens["admin"]), timeout=10)
        assert r.status_code == 200, r.text
        names = sorted([s["site_name"] for s in r.json()])
        # Cluster manager Rahul Verma assigned to Alpha + Bravo
        assert "Alpha Solar 50MW" in names
        assert "Bravo Wind 30MW" in names
        assert "Charlie Hybrid 25MW" not in names

    def test_vendor_admin_sees_alpha_charlie(self, tokens):
        r = requests.get(f"{BASE}/api/sites", headers=_h(tokens["v_admin"]), timeout=10)
        assert r.status_code == 200
        names = sorted([s["site_name"] for s in r.json()])
        assert "Alpha Solar 50MW" in names
        assert "Charlie Hybrid 25MW" in names
        assert "Bravo Wind 30MW" not in names

    def test_vendor_user_sees_alpha_charlie(self, tokens):
        r = requests.get(f"{BASE}/api/sites", headers=_h(tokens["v_user"]), timeout=10)
        assert r.status_code == 200
        names = sorted([s["site_name"] for s in r.json()])
        assert "Alpha Solar 50MW" in names
        assert "Charlie Hybrid 25MW" in names
        assert "Bravo Wind 30MW" not in names


# ---------------------------------------------------------------------------
# /api/lookup/options RLS
# ---------------------------------------------------------------------------
class TestLookupOptionsRLS:
    @staticmethod
    def _fetch(tok):
        r = requests.get(f"{BASE}/api/lookup/options",
                         params={"source": "sites", "column": "site_name"},
                         headers=_h(tok), timeout=10)
        return r

    @staticmethod
    def _values(payload):
        if isinstance(payload, dict):
            payload = payload.get("options") or payload.get("items") or []
        return set(o.get("value") if isinstance(o, dict) else o for o in payload)

    def test_super_sees_3(self, tokens):
        r = self._fetch(tokens["super"])
        assert r.status_code == 200, r.text
        vals = self._values(r.json())
        assert vals >= {"Alpha Solar 50MW", "Bravo Wind 30MW", "Charlie Hybrid 25MW"}

    def test_admin_sees_2(self, tokens):
        r = self._fetch(tokens["admin"])
        assert r.status_code == 200, r.text
        vals = self._values(r.json())
        assert "Alpha Solar 50MW" in vals
        assert "Bravo Wind 30MW" in vals
        assert "Charlie Hybrid 25MW" not in vals

    def test_vendor_user_sees_2(self, tokens):
        r = self._fetch(tokens["v_user"])
        assert r.status_code == 200
        vals = self._values(r.json())
        assert "Alpha Solar 50MW" in vals
        assert "Charlie Hybrid 25MW" in vals
        assert "Bravo Wind 30MW" not in vals


# ---------------------------------------------------------------------------
# /api/lookup/resolve cross-vendor block
# ---------------------------------------------------------------------------
class TestLookupResolveRLS:
    def test_vendor_user_blocked_on_bravo(self, tokens):
        body = {"source": "sites", "value": "Bravo Wind 30MW",
                "fill": ["asset_id", "plant_name"]}
        r = requests.post(f"{BASE}/api/lookup/resolve",
                          headers=_h(tokens["v_user"]), json=body, timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("matched") is False, f"vendor_user must NOT match cross-vendor row; got {d}"

    def test_vendor_user_can_resolve_alpha(self, tokens):
        body = {"source": "sites", "value": "Alpha Solar 50MW",
                "fill": ["asset_id", "plant_name", "ac_capacity", "dc_capacity"]}
        r = requests.post(f"{BASE}/api/lookup/resolve",
                          headers=_h(tokens["v_user"]), json=body, timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("matched") is True, d
        fill = d.get("fill") or d.get("values") or {}
        assert fill.get("asset_id") == "AST-1001"


# ---------------------------------------------------------------------------
# /api/submissions RLS
# ---------------------------------------------------------------------------
class TestSubmissionsRLS:
    def test_super_admin_sees_some_or_all(self, tokens):
        r = requests.get(f"{BASE}/api/submissions", headers=_h(tokens["super"]), timeout=10)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_vendor_user_only_own(self, tokens):
        r = requests.get(f"{BASE}/api/submissions", headers=_h(tokens["v_user"]), timeout=10)
        assert r.status_code == 200, r.text
        # All returned submissions must be submitted_by this user
        # we can't know user_id directly here but server enforces filter
        rows = r.json()
        # auth/me to get our user_id
        me = requests.get(f"{BASE}/api/auth/me", headers=_h(tokens["v_user"]), timeout=10).json()
        uid = me["user_id"]
        for s in rows:
            assert s.get("submitted_by") == uid


# ---------------------------------------------------------------------------
# /api/forms — assigned_vendor_ids gating
# ---------------------------------------------------------------------------
class TestFormFilter:
    def test_vendor_user_sees_only_assigned_form(self, tokens):
        # Create two forms as super_admin: one assigned to SunOps, one not.
        suffix = uuid.uuid4().hex[:6]
        f_assigned = {
            "title": f"TEST_RBAC_Assigned_{suffix}",
            "slug": f"test-rbac-assigned-{suffix}",
            "fields": [],
            "assigned_vendor_ids": ["ven_sunops_demo"],
        }
        f_unassigned = {
            "title": f"TEST_RBAC_Unassigned_{suffix}",
            "slug": f"test-rbac-unassigned-{suffix}",
            "fields": [],
            "assigned_vendor_ids": [],
        }
        r1 = requests.post(f"{BASE}/api/forms", headers=_h(tokens["super"]), json=f_assigned, timeout=10)
        assert r1.status_code in (200, 201), r1.text
        r2 = requests.post(f"{BASE}/api/forms", headers=_h(tokens["super"]), json=f_unassigned, timeout=10)
        assert r2.status_code in (200, 201), r2.text
        fid_a = r1.json()["form_id"]
        fid_u = r2.json()["form_id"]

        # Vendor user list
        rl = requests.get(f"{BASE}/api/forms", headers=_h(tokens["v_user"]), timeout=10)
        assert rl.status_code == 200, rl.text
        ids = [f["form_id"] for f in rl.json()]
        assert fid_a in ids, "vendor_user must see form assigned to its vendor"
        assert fid_u not in ids, "vendor_user must NOT see unassigned form"

        # Cleanup
        requests.delete(f"{BASE}/api/forms/{fid_a}", headers=_h(tokens["super"]), timeout=10)
        requests.delete(f"{BASE}/api/forms/{fid_u}", headers=_h(tokens["super"]), timeout=10)

    def test_vendor_user_cannot_edit_form(self, tokens):
        # Create assigned form
        suffix = uuid.uuid4().hex[:6]
        body = {
            "title": f"TEST_RBAC_Edit_{suffix}",
            "slug": f"test-rbac-edit-{suffix}",
            "fields": [],
            "assigned_vendor_ids": ["ven_sunops_demo"],
        }
        rc = requests.post(f"{BASE}/api/forms", headers=_h(tokens["super"]), json=body, timeout=10)
        assert rc.status_code in (200, 201), rc.text
        fid = rc.json()["form_id"]
        try:
            put = requests.put(f"{BASE}/api/forms/{fid}",
                               headers=_h(tokens["v_user"]),
                               json={**body, "title": "HACKED"},
                               timeout=10)
            assert put.status_code == 403, f"expected 403, got {put.status_code} {put.text}"
        finally:
            requests.delete(f"{BASE}/api/forms/{fid}", headers=_h(tokens["super"]), timeout=10)


# ---------------------------------------------------------------------------
# Master-data edit guard
# ---------------------------------------------------------------------------
class TestMasterDataGuard:
    def test_admin_cannot_create_site(self, tokens):
        # admin role (rahul.verma) — should be 403
        body = {"site_name": "TEST_RBAC_Site",
                "asset_id": "TEST-9999",
                "plant_name": "TestPlant",
                "ac_capacity": 1, "dc_capacity": 1,
                "vendor_email": "ops@sunops.example.com"}
        r = requests.post(f"{BASE}/api/sites", headers=_h(tokens["admin"]), json=body, timeout=10)
        # Self-healing cleanup: if the guard is missing the row leaks into seeded data.
        if r.status_code == 200:
            sid = r.json().get("site_id")
            if sid:
                requests.delete(f"{BASE}/api/sites/{sid}", headers=_h(tokens["super"]), timeout=10)
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"

    def test_admin_cannot_patch_site(self, tokens):
        # Get an existing site as super_admin to use as target
        rs = requests.get(f"{BASE}/api/sites", headers=_h(tokens["super"]), timeout=10).json()
        if not rs:
            pytest.skip("no sites seeded")
        target = rs[0]
        sid = target.get("site_id") or target.get("id")
        original_plant = target.get("plant_name")
        # API exposes PUT /api/sites/{id} for updates. Only super_admin should be able to.
        r = requests.put(f"{BASE}/api/sites/{sid}",
                         headers=_h(tokens["admin"]),
                         json={"plant_name": "__SHOULD_NOT_APPLY__"}, timeout=10)
        # Self-healing: if the guard is missing, immediately revert the change so we don't
        # corrupt the seeded data for downstream tests.
        if r.status_code == 200:
            requests.put(f"{BASE}/api/sites/{sid}",
                         headers=_h(tokens["super"]),
                         json={"plant_name": original_plant}, timeout=10)
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text[:200]}"


# ---------------------------------------------------------------------------
# PDF Form Builder parity
# ---------------------------------------------------------------------------
class TestPdfFormParity:
    def test_pdf_field_extra_allow_and_assignments(self, tokens):
        # Build a valid 1-page PDF in-memory using reportlab so the upload accepts it.
        try:
            from io import BytesIO
            from reportlab.pdfgen import canvas
            buf = BytesIO()
            c = canvas.Canvas(buf)
            c.drawString(100, 100, "test")
            c.save()
            pdf_bytes = buf.getvalue()
        except Exception as e:
            pytest.skip(f"reportlab unavailable: {e}")

        files = {"file": ("blank.pdf", pdf_bytes, "application/pdf")}
        up = requests.post(f"{BASE}/api/pdf-forms/upload",
                           headers={"Authorization": f"Bearer {tokens['super']}"},
                           files=files, timeout=20)
        assert up.status_code in (200, 201), f"pdf upload failed: {up.status_code} {up.text[:300]}"
        d = up.json()
        tid = d.get("template_id") or d.get("id") or d.get("pdf_template_id")
        assert tid, f"upload response missing id: {d}"
        try:
            payload = {
                "title": "TEST_RBAC_PDFParity",
                "name": "TEST_RBAC_PDFParity",
                "fields": [{
                    "id": "f1",
                    "name": "f1",
                    "type": "short_text",
                    "page": 1,
                    "x": 0.1, "y": 0.1, "width": 0.2, "height": 0.04,
                    "data_source": {"type": "sites", "display_column": "site_name"},
                    "lookup": {"enabled": True, "trigger_field_id": "X", "return_column": "asset_id"},
                    "formula": {"enabled": True, "expression": "ROUND({{a}}*2,1)"},
                }],
                "assigned_vendor_ids": ["ven_sunops_demo"],
                "assigned_vendor_user_ids": [],
                "assigned_admin_ids": [],
                "assigned_cluster_managers": [],
            }
            up2 = requests.put(f"{BASE}/api/pdf-forms/{tid}",
                               headers=_h(tokens["super"]), json=payload, timeout=15)
            assert up2.status_code == 200, f"PUT pdf-forms got {up2.status_code}: {up2.text[:400]}"
            d2 = up2.json()
            # Verify field data_source / lookup / formula preserved (extra='allow')
            f = d2["fields"][0]
            assert f.get("data_source", {}).get("type") == "sites"
            assert f.get("lookup", {}).get("enabled") is True
            assert f.get("formula", {}).get("expression") == "ROUND({{a}}*2,1)"
        finally:
            requests.delete(f"{BASE}/api/pdf-forms/{tid}",
                            headers=_h(tokens["super"]), timeout=10)
