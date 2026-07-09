"""FormForge iter-5: Access Override + Form-edit RBAC hardening.

Covers the 17-scenario suite:
  - Vendor tier blocked from POST /forms, /forms/dup, /pdf-forms/upload, /pdf-forms/dup
  - Cluster-manager admin CAN create forms
  - Only super_admin can toggle access_override on PATCH /users/{id}
  - Setting access_override on vendor_admin lets them create forms
  - /api/auth/menu returns access_override & edit_forms/create_forms flip for override
  - /api/sites vendor RLS = vendor_id OR assigned_vendor_ids (share-based)
  - Regression: PUT/DELETE /forms/{id} as vendor_admin still 403
"""
import os
import uuid

import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL",
                      "https://jotform-lookup.preview.emergentagent.com").rstrip("/")

ACCOUNTS = {
    "super":   ("admin@example.com",               "Admin@12345"),
    "admin":   ("rahul.verma@example.com",         "Admin@12345"),
    "v_admin": ("vendor.admin@sunops.example.com", "Vendor@12345"),
    "v_user":  ("vendor.user@sunops.example.com",  "Vendor@12345"),
}


def _login(email, password):
    r = requests.post(f"{BASE}/api/auth/login",
                      json={"email": email, "password": password}, timeout=15)
    if r.status_code == 429 or (r.status_code == 401 and "Too many" in r.text):
        pytest.skip(f"rate-limited on {email}")
    assert r.status_code == 200, f"login failed {email}: {r.status_code} {r.text[:200]}"
    return r.json()["token"], r.json()["user"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def tokens():
    out = {}
    for k, (e, p) in ACCOUNTS.items():
        tok, user = _login(e, p)
        out[k] = tok
        out[k + "_user"] = user
    return out


# --- Helpers -----------------------------------------------------------------
def _reset_vendor_override(tokens, target_email="vendor.admin@sunops.example.com"):
    """Idempotent: ensure access_override is False for a vendor_admin at start/end."""
    su = tokens["super"]
    users = requests.get(f"{BASE}/api/users", headers=_h(su), timeout=10).json()
    target = next((u for u in users if u["email"] == target_email), None)
    if target and target.get("access_override"):
        requests.patch(f"{BASE}/api/users/{target['user_id']}",
                       headers=_h(su), json={"access_override": False}, timeout=10)
    return target


# ============================================================================
# 1. Vendor-tier blocked from form-creation endpoints (base state)
# ============================================================================
class TestVendorBlockedOnFormCreation:

    def test_vendor_admin_post_forms_403(self, tokens):
        _reset_vendor_override(tokens)
        body = {"title": f"TEST_va_{uuid.uuid4().hex[:6]}", "fields": []}
        r = requests.post(f"{BASE}/api/forms", headers=_h(tokens["v_admin"]), json=body, timeout=10)
        assert r.status_code == 403, f"expected 403 got {r.status_code}: {r.text[:200]}"
        detail = r.json().get("detail", "")
        assert "Admin" in detail and "override" in detail.lower(), f"detail mismatch: {detail}"

    def test_vendor_admin_duplicate_forms_403(self, tokens):
        # First create a form as super_admin
        body = {"title": f"TEST_dup_src_{uuid.uuid4().hex[:6]}", "fields": []}
        r0 = requests.post(f"{BASE}/api/forms", headers=_h(tokens["super"]), json=body, timeout=10)
        assert r0.status_code == 200, r0.text
        fid = r0.json()["form_id"]
        try:
            r = requests.post(f"{BASE}/api/forms/{fid}/duplicate",
                              headers=_h(tokens["v_admin"]), timeout=10)
            assert r.status_code == 403, f"expected 403 got {r.status_code}: {r.text[:200]}"
        finally:
            requests.delete(f"{BASE}/api/forms/{fid}", headers=_h(tokens["super"]), timeout=10)

    def test_vendor_admin_pdf_upload_403(self, tokens):
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
        r = requests.post(f"{BASE}/api/pdf-forms/upload",
                          headers={"Authorization": f"Bearer {tokens['v_admin']}"},
                          files=files, timeout=15)
        assert r.status_code == 403, f"expected 403 got {r.status_code}: {r.text[:200]}"

    def test_vendor_admin_pdf_duplicate_403(self, tokens):
        # Create a template as super_admin first
        try:
            from io import BytesIO
            from reportlab.pdfgen import canvas
            buf = BytesIO()
            c = canvas.Canvas(buf)
            c.drawString(50, 50, "src")
            c.save()
            pdf_bytes = buf.getvalue()
        except Exception as e:
            pytest.skip(f"reportlab unavailable: {e}")
        files = {"file": ("src.pdf", pdf_bytes, "application/pdf")}
        r0 = requests.post(f"{BASE}/api/pdf-forms/upload",
                           headers={"Authorization": f"Bearer {tokens['super']}"},
                           files=files, timeout=15)
        assert r0.status_code == 200, r0.text
        tid = r0.json()["template_id"]
        try:
            r = requests.post(f"{BASE}/api/pdf-forms/{tid}/duplicate",
                              headers=_h(tokens["v_admin"]), timeout=10)
            assert r.status_code == 403, f"expected 403 got {r.status_code}: {r.text[:200]}"
        finally:
            requests.delete(f"{BASE}/api/pdf-forms/{tid}",
                            headers=_h(tokens["super"]), timeout=10)


# ============================================================================
# 2. Cluster-manager admin can create forms (rahul.verma@example.com)
# ============================================================================
class TestAdminCanCreateForm:
    def test_admin_can_post_forms(self, tokens):
        body = {"title": f"TEST_admin_form_{uuid.uuid4().hex[:6]}", "fields": []}
        r = requests.post(f"{BASE}/api/forms", headers=_h(tokens["admin"]), json=body, timeout=10)
        assert r.status_code == 200, f"expected 200 got {r.status_code}: {r.text[:200]}"
        fid = r.json()["form_id"]
        # cleanup
        requests.delete(f"{BASE}/api/forms/{fid}", headers=_h(tokens["super"]), timeout=10)


# ============================================================================
# 3. Only super_admin can toggle access_override on PATCH /users/{id}
# ============================================================================
class TestAccessOverrideToggle:

    def _get_vendor_admin_user(self, tokens):
        users = requests.get(f"{BASE}/api/users", headers=_h(tokens["super"]), timeout=10).json()
        target = next((u for u in users if u["email"] == "vendor.admin@sunops.example.com"), None)
        assert target, "vendor.admin@sunops.example.com not found in /api/users"
        return target

    def test_super_admin_toggle_persists(self, tokens):
        _reset_vendor_override(tokens)
        target = self._get_vendor_admin_user(tokens)
        r = requests.patch(f"{BASE}/api/users/{target['user_id']}",
                           headers=_h(tokens["super"]),
                           json={"access_override": True}, timeout=10)
        assert r.status_code == 200, r.text
        assert r.json().get("access_override") is True

        # GET back and verify persistence
        r2 = requests.get(f"{BASE}/api/users", headers=_h(tokens["super"]), timeout=10)
        assert r2.status_code == 200
        updated = next((u for u in r2.json() if u["email"] == target["email"]), None)
        assert updated and updated.get("access_override") is True

        # cleanup
        requests.patch(f"{BASE}/api/users/{target['user_id']}",
                       headers=_h(tokens["super"]),
                       json={"access_override": False}, timeout=10)

    def test_admin_cannot_toggle_override(self, tokens):
        _reset_vendor_override(tokens)
        target = self._get_vendor_admin_user(tokens)
        r = requests.patch(f"{BASE}/api/users/{target['user_id']}",
                           headers=_h(tokens["admin"]),
                           json={"access_override": True}, timeout=10)
        # admin cannot see super_admin, but can see vendor_admin; still must fail on the flag
        assert r.status_code == 403, f"expected 403 got {r.status_code}: {r.text[:200]}"

    def test_vendor_admin_cannot_toggle_override(self, tokens):
        # vendor_admin can only manage their own vendor users; try patching themselves
        me = tokens["v_admin_user"]
        r = requests.patch(f"{BASE}/api/users/{me['user_id']}",
                           headers=_h(tokens["v_admin"]),
                           json={"access_override": True}, timeout=10)
        assert r.status_code == 403, f"expected 403 got {r.status_code}: {r.text[:200]}"


# ============================================================================
# 4. Vendor_admin with access_override CAN create forms
# ============================================================================
class TestOverrideGrantsFormCreate:
    def test_grant_override_then_create_form(self, tokens):
        _reset_vendor_override(tokens)
        target = requests.get(f"{BASE}/api/users", headers=_h(tokens["super"]), timeout=10).json()
        target = next((u for u in target if u["email"] == "vendor.admin@sunops.example.com"), None)
        assert target
        # Grant
        r0 = requests.patch(f"{BASE}/api/users/{target['user_id']}",
                            headers=_h(tokens["super"]),
                            json={"access_override": True}, timeout=10)
        assert r0.status_code == 200, r0.text
        try:
            body = {"title": f"TEST_ovr_form_{uuid.uuid4().hex[:6]}", "fields": []}
            r = requests.post(f"{BASE}/api/forms", headers=_h(tokens["v_admin"]),
                              json=body, timeout=10)
            assert r.status_code == 200, f"expected 200 got {r.status_code}: {r.text[:200]}"
            fid = r.json()["form_id"]
            # cleanup form
            requests.delete(f"{BASE}/api/forms/{fid}", headers=_h(tokens["super"]), timeout=10)
        finally:
            requests.patch(f"{BASE}/api/users/{target['user_id']}",
                           headers=_h(tokens["super"]),
                           json={"access_override": False}, timeout=10)


# ============================================================================
# 5. /api/auth/menu capabilities include access_override + flip create/edit
# ============================================================================
class TestAuthMenuOverride:

    def test_menu_baseline_flags_for_vendor_admin(self, tokens):
        _reset_vendor_override(tokens)
        r = requests.get(f"{BASE}/api/auth/menu", headers=_h(tokens["v_admin"]), timeout=10)
        assert r.status_code == 200
        caps = r.json().get("capabilities", {})
        assert "access_override" in caps
        assert caps.get("access_override") is False
        assert caps.get("create_forms") is False
        assert caps.get("edit_forms") is False

    def test_menu_flags_flip_with_override(self, tokens):
        target = requests.get(f"{BASE}/api/users", headers=_h(tokens["super"]), timeout=10).json()
        target = next((u for u in target if u["email"] == "vendor.admin@sunops.example.com"), None)
        r0 = requests.patch(f"{BASE}/api/users/{target['user_id']}",
                            headers=_h(tokens["super"]),
                            json={"access_override": True}, timeout=10)
        assert r0.status_code == 200
        try:
            # v_admin needs a fresh token? menu is based on live DB read, so same token OK
            r = requests.get(f"{BASE}/api/auth/menu", headers=_h(tokens["v_admin"]), timeout=10)
            assert r.status_code == 200
            caps = r.json().get("capabilities", {})
            assert caps.get("access_override") is True
            assert caps.get("create_forms") is True
            assert caps.get("edit_forms") is True
        finally:
            requests.patch(f"{BASE}/api/users/{target['user_id']}",
                           headers=_h(tokens["super"]),
                           json={"access_override": False}, timeout=10)


# ============================================================================
# 6. /api/sites vendor RLS = vendor_id OR assigned_vendor_ids (share-based)
# ============================================================================
class TestSharedSiteVisibility:

    def test_vendor_admin_sees_bravo_via_assigned_vendor_ids(self, tokens):
        # Grab bravo site id as super_admin
        rs = requests.get(f"{BASE}/api/sites", headers=_h(tokens["super"]), timeout=10)
        assert rs.status_code == 200
        bravo = next((s for s in rs.json() if s["site_name"] == "Bravo Wind 30MW"), None)
        assert bravo, "Bravo Wind 30MW site not seeded"
        sid = bravo.get("site_id") or bravo.get("id")

        # Baseline: v_admin should NOT see bravo before share
        _reset_vendor_override(tokens)
        rb = requests.get(f"{BASE}/api/sites", headers=_h(tokens["v_admin"]), timeout=10).json()
        names_before = [s["site_name"] for s in rb]
        assert "Bravo Wind 30MW" not in names_before

        # Share via assigned_vendor_ids append
        current_shared = bravo.get("assigned_vendor_ids") or []
        new_shared = list(set(current_shared + ["ven_sunops_demo"]))
        upd = requests.put(f"{BASE}/api/sites/{sid}", headers=_h(tokens["super"]),
                           json={"assigned_vendor_ids": new_shared}, timeout=10)
        # PUT may or may not accept partial — some backends want full body; try PATCH fallback
        if upd.status_code not in (200, 204):
            upd = requests.patch(f"{BASE}/api/sites/{sid}", headers=_h(tokens["super"]),
                                 json={"assigned_vendor_ids": new_shared}, timeout=10)
        try:
            assert upd.status_code in (200, 204), f"share update failed: {upd.status_code} {upd.text[:200]}"

            ra = requests.get(f"{BASE}/api/sites", headers=_h(tokens["v_admin"]), timeout=10)
            assert ra.status_code == 200
            names_after = [s["site_name"] for s in ra.json()]
            assert "Bravo Wind 30MW" in names_after, \
                f"vendor_admin should see shared Bravo now; got {names_after}"
        finally:
            # revert
            requests.put(f"{BASE}/api/sites/{sid}", headers=_h(tokens["super"]),
                         json={"assigned_vendor_ids": current_shared}, timeout=10)
            requests.patch(f"{BASE}/api/sites/{sid}", headers=_h(tokens["super"]),
                           json={"assigned_vendor_ids": current_shared}, timeout=10)


# ============================================================================
# 7. Regression: PUT/DELETE /forms/{id} as vendor_admin still 403
# ============================================================================
class TestFormEditRegressionVendor:

    def test_vendor_admin_put_forms_403(self, tokens):
        # Create a form assigned to sunops so v_admin CAN view it, but not edit
        _reset_vendor_override(tokens)
        body = {
            "title": f"TEST_regress_edit_{uuid.uuid4().hex[:6]}",
            "fields": [],
            "assigned_vendor_ids": ["ven_sunops_demo"],
        }
        r0 = requests.post(f"{BASE}/api/forms", headers=_h(tokens["super"]), json=body, timeout=10)
        assert r0.status_code == 200, r0.text
        fid = r0.json()["form_id"]
        try:
            r = requests.put(f"{BASE}/api/forms/{fid}", headers=_h(tokens["v_admin"]),
                             json={**body, "title": "HACKED"}, timeout=10)
            assert r.status_code == 403, f"PUT expected 403 got {r.status_code}: {r.text[:200]}"
            r2 = requests.delete(f"{BASE}/api/forms/{fid}", headers=_h(tokens["v_admin"]), timeout=10)
            assert r2.status_code == 403, f"DELETE expected 403 got {r2.status_code}: {r2.text[:200]}"
        finally:
            requests.delete(f"{BASE}/api/forms/{fid}", headers=_h(tokens["super"]), timeout=10)
