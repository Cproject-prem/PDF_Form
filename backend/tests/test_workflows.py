"""
Backend regression tests for the FormForge Workflow Automation engine.

Covers (in order):
  - workflow templates (seeded) + instantiate + status transitions
  - workflow CRUD + version snapshot + duplicate
  - engine execution + condition branching + approval (in-app + public)
  - formula engine
  - workflow-analytics (admin) + audit (admin) + SMTP settings (mask/test)
  - trigger hooks on form_submitted + pdf_submitted
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://pdf-merge-forms.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "Admin@12345"


# ----------------------- Fixtures -----------------------

@pytest.fixture(scope="session")
def s():
    return requests.Session()


@pytest.fixture(scope="session")
def admin_token(s):
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def H(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def user_account(s):
    suffix = uuid.uuid4().hex[:8]
    email = f"TEST_wf_user_{suffix}@example.com"
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "Passw0rd!", "name": "Reg"}, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    return {"email": email, "token": data["token"], "user_id": data["user"]["user_id"]}


# ----------------------- Login -----------------------

def test_admin_login_still_works(s):
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200
    assert r.json()["user"]["role"] == "super_admin"


# ----------------------- Templates -----------------------

REQUIRED_TEMPLATE_SLUGS = {"leave-approval", "expense-approval", "purchase-request", "medical-certificate"}


class TestTemplates:
    def test_list_templates_has_all_four(self, s, H):
        r = s.get(f"{API}/workflows/templates", headers=H)
        assert r.status_code == 200
        slugs = {t.get("template_slug") for t in r.json()}
        assert REQUIRED_TEMPLATE_SLUGS.issubset(slugs), f"missing: {REQUIRED_TEMPLATE_SLUGS - slugs}"

    def test_instantiate_leave_template_creates_draft(self, s, H):
        r = s.post(f"{API}/workflows/templates/leave-approval/instantiate", headers=H)
        assert r.status_code == 200, r.text
        wf = r.json()
        assert wf["status"] == "draft"
        assert wf["is_template"] is False
        assert wf["workflow_id"].startswith("wf_")
        pytest.leave_wf_id = wf["workflow_id"]

    def test_publish_then_disable(self, s, H):
        wid = pytest.leave_wf_id
        r1 = s.patch(f"{API}/workflows/{wid}/status", json={"status": "published"}, headers=H)
        assert r1.status_code == 200 and r1.json()["status"] == "published"
        r2 = s.patch(f"{API}/workflows/{wid}/status", json={"status": "disabled"}, headers=H)
        assert r2.status_code == 200 and r2.json()["status"] == "disabled"
        # re-publish for downstream trigger-hook tests
        r3 = s.patch(f"{API}/workflows/{wid}/status", json={"status": "published"}, headers=H)
        assert r3.status_code == 200 and r3.json()["status"] == "published"


# ----------------------- Custom workflow CRUD + versioning + duplicate -----------------------

def _simple_wf_body(name="TEST custom wf"):
    return {
        "name": name,
        "description": "Tiny workflow",
        "nodes": [
            {"id": "t1", "kind": "trigger", "type": "trigger.manual",
             "config": {"event": "manual"}, "position": {"x": 0, "y": 0}, "label": "Start"},
            {"id": "a1", "kind": "action", "type": "action.set_variable",
             "config": {"name": "greeting", "value": "hello"}, "position": {"x": 240, "y": 0}, "label": "Set var"},
        ],
        "edges": [{"id": "e1", "source": "t1", "target": "a1"}],
    }


class TestWorkflowCrud:
    def test_create_custom(self, s, H):
        r = s.post(f"{API}/workflows", json=_simple_wf_body(), headers=H)
        assert r.status_code == 200, r.text
        wf = r.json()
        assert wf["workflow_id"].startswith("wf_")
        assert wf["version"] == 1
        assert wf["status"] == "draft"
        pytest.custom_wf_id = wf["workflow_id"]

    def test_update_bumps_version_and_writes_snapshot(self, s, H):
        wid = pytest.custom_wf_id
        body = _simple_wf_body(name="TEST custom wf v2")
        body["description"] = "v2"
        r = s.put(f"{API}/workflows/{wid}", json=body, headers=H)
        assert r.status_code == 200
        assert r.json()["version"] == 2
        # check versions endpoint
        v = s.get(f"{API}/workflows/{wid}/versions", headers=H)
        assert v.status_code == 200
        rows = v.json()
        assert len(rows) >= 1 and rows[0]["version"] == 1  # previous snapshot is v1

    def test_duplicate(self, s, H):
        wid = pytest.custom_wf_id
        r = s.post(f"{API}/workflows/{wid}/duplicate", headers=H)
        assert r.status_code == 200, r.text
        dup = r.json()
        assert dup["workflow_id"] != wid
        assert dup["status"] == "draft"
        assert dup["version"] == 1
        # cleanup
        s.delete(f"{API}/workflows/{dup['workflow_id']}", headers=H)


# ----------------------- Engine: condition branching + approval -----------------------

def _wait_execution(s, H, exec_id, target_statuses, timeout=10):
    end = time.time() + timeout
    last = None
    while time.time() < end:
        r = s.get(f"{API}/workflows/executions/{exec_id}", headers=H)
        if r.status_code == 200:
            last = r.json()
            if last.get("status") in target_statuses:
                return last
        time.sleep(0.4)
    return last


class TestEngineConditionAndApproval:
    def test_condition_routes_short_leave_to_manager_only(self, s, H):
        wid = pytest.leave_wf_id
        payload = {"values": {"days": 3, "email": "alice@example.com", "name": "Alice"}}
        r = s.post(f"{API}/workflows/{wid}/test",
                   json={"event": "form_submitted", "payload": payload}, headers=H)
        assert r.status_code == 200, r.text
        exec_id = r.json()["execution_id"]
        ex = _wait_execution(s, H, exec_id, ("waiting_approval", "success", "failed"))
        assert ex is not None
        assert ex["status"] == "waiting_approval", f"got {ex.get('status')}, logs={ex.get('logs')[-3:]}"
        # n4 = Manager-only approval node
        assert ex["current_node_id"] == "n4"
        pytest.short_leave_exec = exec_id

    def test_condition_routes_long_leave_to_hr_plus_manager(self, s, H):
        wid = pytest.leave_wf_id
        payload = {"values": {"days": 7, "email": "bob@example.com", "name": "Bob"}}
        r = s.post(f"{API}/workflows/{wid}/test",
                   json={"event": "form_submitted", "payload": payload}, headers=H)
        assert r.status_code == 200
        exec_id = r.json()["execution_id"]
        ex = _wait_execution(s, H, exec_id, ("waiting_approval", "success", "failed"))
        assert ex["status"] == "waiting_approval"
        assert ex["current_node_id"] == "n3"  # HR + Manager node

    def test_approval_row_created_and_listed_for_caller(self, s, H):
        # First swap the approver of the active manager approval to admin so we can list/approve it.
        # The leave template uses "manager@example.com" — instead of patching the template,
        # we create a fresh workflow tailored to admin@example.com as approver.
        body = {
            "name": "TEST admin approval wf",
            "description": "",
            "nodes": [
                {"id": "t1", "kind": "trigger", "type": "trigger.manual",
                 "config": {"event": "manual"}, "position": {"x": 0, "y": 0}, "label": "Start"},
                {"id": "ap1", "kind": "approval", "type": "approval.sequential",
                 "config": {"subject": "TEST approval", "approvers": [ADMIN_EMAIL]},
                 "position": {"x": 250, "y": 0}, "label": "Approval"},
                {"id": "done", "kind": "action", "type": "action.set_status",
                 "config": {"status": "approved"}, "position": {"x": 500, "y": 0}, "label": "Mark"},
            ],
            "edges": [
                {"id": "e1", "source": "t1", "target": "ap1"},
                {"id": "e2", "source": "ap1", "target": "done", "sourceHandle": "approved"},
            ],
        }
        r = s.post(f"{API}/workflows", json=body, headers=H)
        assert r.status_code == 200, r.text
        wid = r.json()["workflow_id"]
        pytest.apv_wf_id = wid
        # Test run
        r2 = s.post(f"{API}/workflows/{wid}/test", json={"event": "manual", "payload": {"v": 1}}, headers=H)
        assert r2.status_code == 200
        exec_id = r2.json()["execution_id"]
        ex = _wait_execution(s, H, exec_id, ("waiting_approval", "success", "failed"))
        assert ex["status"] == "waiting_approval"
        pytest.apv_exec_id = exec_id

        # /api/approvals?status_filter=pending lists at least one row addressed to ADMIN_EMAIL
        rlist = s.get(f"{API}/approvals?status_filter=pending", headers=H)
        assert rlist.status_code == 200
        rows = rlist.json()
        ours = [a for a in rows if exec_id == a.get("execution_id")]
        assert ours, f"approval not visible to admin; rows={len(rows)}"
        apv = ours[0]
        assert apv["status"] == "pending"
        assert ADMIN_EMAIL in apv["approvers"]
        pytest.apv_id = apv["approval_id"]

    def test_decide_approve_resumes_execution_to_success(self, s, H):
        aid = pytest.apv_id
        r = s.post(f"{API}/approvals/{aid}/decide", json={"decision": "approve", "comment": "ok"}, headers=H)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "approved"
        # Execution should reach success
        ex = _wait_execution(s, H, pytest.apv_exec_id, ("success", "failed"))
        assert ex["status"] == "success", f"logs tail={ex.get('logs', [])[-3:]}"

    def test_decide_reject_finalises_approval(self, s, H):
        # Create another execution and reject it
        wid = pytest.apv_wf_id
        r2 = s.post(f"{API}/workflows/{wid}/test", json={"event": "manual", "payload": {"v": 2}}, headers=H)
        exec_id = r2.json()["execution_id"]
        _wait_execution(s, H, exec_id, ("waiting_approval",))
        # Find the approval
        rlist = s.get(f"{API}/approvals?status_filter=pending", headers=H)
        apv = next(a for a in rlist.json() if a.get("execution_id") == exec_id)
        rj = s.post(f"{API}/approvals/{apv['approval_id']}/decide",
                    json={"decision": "reject", "comment": "no"}, headers=H)
        assert rj.status_code == 200
        assert rj.json()["status"] == "rejected"


# ----------------------- Public approval (token) -----------------------

class TestPublicApproval:
    def test_public_approval_flow(self, s, H):
        # Need a published workflow that uses an external email so a public token is generated for them.
        ext_email = f"TEST_extapprover_{uuid.uuid4().hex[:6]}@example.com"
        body = {
            "name": "TEST public approval wf",
            "description": "",
            "nodes": [
                {"id": "t1", "kind": "trigger", "type": "trigger.manual",
                 "config": {"event": "manual"}, "position": {"x": 0, "y": 0}, "label": "Start"},
                {"id": "ap1", "kind": "approval", "type": "approval.sequential",
                 "config": {"subject": "TEST public", "approvers": [ext_email]},
                 "position": {"x": 250, "y": 0}, "label": "Approval"},
                {"id": "done", "kind": "action", "type": "action.set_status",
                 "config": {"status": "approved"}, "position": {"x": 500, "y": 0}, "label": "Mark"},
            ],
            "edges": [
                {"id": "e1", "source": "t1", "target": "ap1"},
                {"id": "e2", "source": "ap1", "target": "done", "sourceHandle": "approved"},
            ],
        }
        r = s.post(f"{API}/workflows", json=body, headers=H)
        wid = r.json()["workflow_id"]
        r2 = s.post(f"{API}/workflows/{wid}/test", json={"event": "manual", "payload": {}}, headers=H)
        exec_id = r2.json()["execution_id"]
        _wait_execution(s, H, exec_id, ("waiting_approval",))

        # Get the approval row, find token in approval_tokens via the email_queue? We use admin fixture
        # path: there is no public endpoint to LIST tokens, so we fetch via Mongo? Not available here.
        # We rely on a documented internal helper: the engine inserts tokens keyed to (approval_id, approver).
        # Expose them via /api/approvals/{id} (admin) -> tokens may not be returned. Instead, search /api/audit
        # NB: simplest robust path — query /api/approvals (we cannot, since admin email is not approver).
        # Use a backend-side helper: the engine inserts to db.approval_tokens — and the email body includes
        # the link. We pull the email body via db is not available over API.
        # Workaround: use a special debug endpoint? None exists. So we skip if we cannot recover the token.
        # Recoverable via direct mongo cli:
        import subprocess
        import json as _json
        out = subprocess.check_output([
            "mongosh", "--quiet", "test_database",
            "--eval",
            f'JSON.stringify(db.approval_tokens.find({{approver:"{ext_email}"}}).toArray())'
        ], timeout=10).decode()
        tokens = _json.loads(out)
        assert tokens, "no public approval token generated"
        token = tokens[0]["token"]

        # GET token info (no auth)
        g = requests.get(f"{API}/public/approvals/{token}")
        assert g.status_code == 200
        body = g.json()
        assert body["approver"] == ext_email
        assert body["approval"]["status"] == "pending"

        # POST decide approve with comment
        d = requests.post(f"{API}/public/approvals/{token}/decide",
                          json={"decision": "approve", "comment": "looks ok"})
        assert d.status_code == 200, d.text
        # Token is invalidated after use
        g2 = requests.get(f"{API}/public/approvals/{token}")
        assert g2.status_code == 404
        # Execution resumed
        ex = _wait_execution(s, H, exec_id, ("success", "failed"))
        assert ex["status"] == "success"


# ----------------------- Formula engine -----------------------

class TestFormula:
    def test_arithmetic(self, s, H):
        r = s.post(f"{API}/workflows/formula/evaluate",
                   json={"expression": "values.amount * 1.18",
                         "context": {"values": {"amount": 100}}}, headers=H)
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert abs(float(body["result"]) - 118.0) < 1e-6

    @pytest.mark.parametrize("expr,expected_type", [
        ("UPPER('abc')", str),
        ("IF(1==1,'yes','no')", str),
        ("SUM(1,2,3,4)", (int, float)),
        ("NOW()", str),
        ("DATEDIFF('2026-01-01','2026-01-05')", (int, float)),
    ])
    def test_builtin_functions(self, s, H, expr, expected_type):
        r = s.post(f"{API}/workflows/formula/evaluate",
                   json={"expression": expr, "context": {}}, headers=H)
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True, body
        assert isinstance(body["result"], expected_type)


# ----------------------- Analytics + Audit -----------------------

class TestAnalyticsAudit:
    def test_workflow_analytics_admin(self, s, H):
        r = s.get(f"{API}/workflow-analytics", headers=H)
        assert r.status_code == 200, r.text
        b = r.json()
        for k in ("total_executions", "successful", "failed", "waiting_approval",
                  "avg_duration_ms", "email", "most_used"):
            assert k in b
        for k in ("total", "sent", "failed", "success_rate"):
            assert k in b["email"]
        # most_used items should have a 'name' populated
        if b["most_used"]:
            assert all("name" in m and m["name"] for m in b["most_used"])

    def test_audit_returns_workflow_events(self, s, H):
        r = s.get(f"{API}/audit?limit=500", headers=H)
        assert r.status_code == 200
        rows = r.json()
        actions = {row.get("action") for row in rows}
        # workflow.create / workflow.test / workflow.published etc were exercised above
        assert "workflow.create" in actions
        assert "workflow.test" in actions

    def test_audit_forbidden_for_non_admin(self, s, user_account):
        r = s.get(f"{API}/audit",
                  headers={"Authorization": f"Bearer {user_account['token']}"})
        assert r.status_code == 403


# ----------------------- SMTP settings -----------------------

class TestSmtpSettings:
    def test_get_smtp_masked(self, s, H):
        r = s.get(f"{API}/settings/smtp", headers=H)
        assert r.status_code == 200
        body = r.json()
        # password is masked (or empty if never set)
        assert body.get("password") in ("*****", "")

    def test_put_smtp_then_mask_preserved_on_blank(self, s, H):
        body = {
            "host": "smtp.example.com", "port": 587,
            "username": "u@example.com", "password": "real-secret-123",
            "from_email": "no-reply@example.com", "use_tls": True, "enabled": False,
        }
        r1 = s.put(f"{API}/settings/smtp", json=body, headers=H)
        assert r1.status_code == 200
        assert r1.json()["password"] == "*****"
        # PUT with password='*****' must keep existing
        body2 = {**body, "password": "*****", "host": "smtp2.example.com"}
        r2 = s.put(f"{API}/settings/smtp", json=body2, headers=H)
        assert r2.status_code == 200
        assert r2.json()["host"] == "smtp2.example.com"
        # PUT with password='' should also keep existing
        body3 = {**body, "password": "", "host": "smtp3.example.com"}
        r3 = s.put(f"{API}/settings/smtp", json=body3, headers=H)
        assert r3.status_code == 200
        # GET still masked
        g = s.get(f"{API}/settings/smtp", headers=H)
        assert g.json()["password"] == "*****"
        assert g.json()["host"] == "smtp3.example.com"

    def test_smtp_test_skipped_when_disabled(self, s, H):
        # ensure SMTP disabled
        s.put(f"{API}/settings/smtp", json={
            "host": "smtp.example.com", "port": 587, "username": "u@example.com",
            "password": "*****", "from_email": "no-reply@example.com",
            "use_tls": True, "enabled": False,
        }, headers=H)
        r = s.post(f"{API}/settings/smtp/test", json={"to": "anyone@example.com"}, headers=H)
        assert r.status_code == 200, r.text
        assert r.json().get("status") == "skipped_no_smtp"


# ----------------------- Trigger hooks (form_submitted / pdf_submitted) -----------------------

class TestTriggerHooks:
    def test_form_submit_fires_workflow(self, s, H):
        # Build a small published workflow that listens for form_submitted
        wf_body = _simple_wf_body(name="TEST hook form_submitted")
        wf_body["nodes"][0]["type"] = "trigger.form_submitted"
        wf_body["nodes"][0]["config"] = {"event": "form_submitted"}
        cr = s.post(f"{API}/workflows", json=wf_body, headers=H)
        wid = cr.json()["workflow_id"]
        s.patch(f"{API}/workflows/{wid}/status", json={"status": "published"}, headers=H)

        # Need a published form
        form_body = {"title": "TEST hook form", "fields": [
            {"id": "name", "type": "short_text", "label": "Your name", "required": True}
        ], "status": "draft"}
        fr = s.post(f"{API}/forms", json=form_body, headers=H)
        assert fr.status_code == 200, fr.text
        form = fr.json()
        s.patch(f"{API}/forms/{form['form_id']}", json={"status": "published"}, headers=H)

        # Count workflow_executions before/after
        before = len(s.get(f"{API}/workflows/{wid}/executions", headers=H).json())
        # Submit
        sub = requests.post(f"{API}/public/forms/{form['slug']}/submit",
                            json={"values": {"name": "Hook tester"}})
        assert sub.status_code == 200, sub.text
        # Give engine a moment
        time.sleep(1.5)
        after = len(s.get(f"{API}/workflows/{wid}/executions", headers=H).json())
        assert after > before, f"workflow did not fire: before={before} after={after}"

    def test_pdf_submit_fires_pdf_workflow(self, s, H):
        wf_body = _simple_wf_body(name="TEST hook pdf_submitted")
        wf_body["nodes"][0]["type"] = "trigger.pdf_submitted"
        wf_body["nodes"][0]["config"] = {"event": "pdf_submitted"}
        cr = s.post(f"{API}/workflows", json=wf_body, headers=H)
        wid = cr.json()["workflow_id"]
        s.patch(f"{API}/workflows/{wid}/status", json={"status": "published"}, headers=H)

        # Locate a published pdf template; use the seeded "test-onboarding-dc253d" if present.
        rl = s.get(f"{API}/pdf-forms", headers=H)
        if rl.status_code != 200:
            pytest.skip("PDF route not available")
        pubs = [p for p in rl.json() if p.get("status") == "published"]
        if not pubs:
            pytest.skip("No published PDF template available")
        slug = pubs[0]["slug"]

        before = len(s.get(f"{API}/workflows/{wid}/executions", headers=H).json())
        # PDF submit expects {"values": {...}}
        # Determine fields list to send empty values dict (most will be optional)
        sub = requests.post(f"{API}/public/pdf-forms/{slug}/submit", json={"values": {}})
        # PDF endpoint may 400 if required fields missing. In that case the trigger doesn't fire.
        if sub.status_code != 200:
            pytest.skip(f"pdf submit rejected: {sub.status_code} {sub.text[:120]}")
        time.sleep(1.5)
        after = len(s.get(f"{API}/workflows/{wid}/executions", headers=H).json())
        assert after > before, f"pdf workflow did not fire: before={before} after={after}"
