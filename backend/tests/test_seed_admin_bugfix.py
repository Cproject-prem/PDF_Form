"""
Backend regression tests for the "Super admin login shows Invalid credentials" bug fix.

The fix: the startup seed block was made idempotent — on every backend boot it
now re-hashes SEED_ADMIN_PASSWORD if it no longer matches the stored hash, and
re-activates a disabled super admin. Same treatment applied to demo accounts
via _ensure().

These tests validate the AFTER-fix behavior by:
  1. Baseline: admin + demo accounts log in with .env credentials.
  2. Corruption recovery: overwrite admin.password_hash with garbage → restart
     backend → login must still succeed (auto-repair).
  3. Reactivation: set admin.is_active=False → restart backend → login must
     succeed (i.e. NOT return 403 User disabled).
  4. Regression: wrong password still returns 401.
  5. Regression: authenticated endpoints (/api/users, /api/sites) still accept
     the freshly re-seeded token.
  6. Same idempotency applied to demo accounts (rahul.verma).
"""
import os
import time
import subprocess

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://jotform-lookup.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "formforge"

ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "Admin@12345"
CLUSTER_EMAIL = "rahul.verma@example.com"
REGION_EMAIL = "south.admin@example.com"
DEMO_PASSWORD = "Admin@12345"

BROKEN_HASH = "$2b$12$brokenhashabcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH"


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def mongo():
    client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=5000)
    yield client[DB_NAME]
    client.close()


def _restart_backend_and_wait(timeout: float = 20.0):
    """Restart backend via supervisor and poll until /api/health responds."""
    subprocess.run(
        ["sudo", "supervisorctl", "restart", "backend"],
        check=True, capture_output=True,
    )
    deadline = time.time() + timeout
    last_err = None
    while time.time() < deadline:
        try:
            r = requests.get(f"{API}/health", timeout=3)
            if r.status_code == 200:
                # give the startup event a moment to finish seeding
                time.sleep(1.5)
                return
        except Exception as e:  # noqa: BLE001
            last_err = e
        time.sleep(0.5)
    raise RuntimeError(f"Backend did not come back up in {timeout}s: {last_err}")


def _login(email: str, password: str) -> requests.Response:
    return requests.post(
        f"{API}/auth/login",
        json={"email": email, "password": password},
        timeout=10,
    )


# ---------- 1. Baseline ----------
class TestBaseline:
    """Fresh startup: super admin + demo users must log in with .env creds."""

    def test_super_admin_login_ok(self):
        r = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data and len(data["token"]) > 20
        assert data["user"]["email"] == ADMIN_EMAIL
        assert data["user"]["role"] == "super_admin"
        assert data["user"]["is_active"] is True

    def test_cluster_admin_login_ok(self):
        r = _login(CLUSTER_EMAIL, DEMO_PASSWORD)
        assert r.status_code == 200, r.text
        assert r.json()["user"]["role"] == "admin"

    def test_region_admin_login_ok(self):
        r = _login(REGION_EMAIL, DEMO_PASSWORD)
        assert r.status_code == 200, r.text
        assert r.json()["user"]["role"] == "admin"

    def test_wrong_password_401(self):
        r = _login(ADMIN_EMAIL, "totally-wrong-password")
        assert r.status_code == 401
        assert "Invalid credentials" in r.text

    def test_admin_hash_format_bcrypt(self, mongo):
        doc = mongo.users.find_one({"email": ADMIN_EMAIL})
        assert doc is not None
        assert doc.get("password_hash", "").startswith("$2b$"), \
            f"Expected bcrypt hash starting with $2b$, got: {doc.get('password_hash')[:10]}"


# ---------- 2. Corruption recovery ----------
class TestCorruptionRecovery:
    """Overwrite hash with garbage → restart backend → login still works."""

    def test_corrupt_admin_hash_then_restart_recovers_login(self, mongo):
        # Corrupt the super admin's password_hash directly in Mongo.
        res = mongo.users.update_one(
            {"email": ADMIN_EMAIL},
            {"$set": {"password_hash": BROKEN_HASH}},
        )
        assert res.matched_count == 1, "super admin row must exist"

        # Sanity: login should now fail (proves corruption took effect).
        pre = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert pre.status_code == 401, \
            f"Corruption pre-check failed: expected 401 but got {pre.status_code} {pre.text}"

        # Restart backend — startup seed should re-hash.
        _restart_backend_and_wait()

        # Now login should succeed again.
        post = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert post.status_code == 200, \
            f"Auto-repair failed: {post.status_code} {post.text}"
        assert "token" in post.json()

        # Confirm the hash on disk is a fresh, valid bcrypt hash (not the bogus one).
        doc = mongo.users.find_one({"email": ADMIN_EMAIL})
        assert doc["password_hash"] != BROKEN_HASH
        assert doc["password_hash"].startswith("$2b$")

    def test_corrupt_demo_admin_hash_then_restart_recovers_login(self, mongo):
        # Same test but for a demo account routed via _ensure().
        res = mongo.users.update_one(
            {"email": CLUSTER_EMAIL},
            {"$set": {"password_hash": BROKEN_HASH}},
        )
        assert res.matched_count == 1

        pre = _login(CLUSTER_EMAIL, DEMO_PASSWORD)
        assert pre.status_code == 401

        _restart_backend_and_wait()

        post = _login(CLUSTER_EMAIL, DEMO_PASSWORD)
        assert post.status_code == 200, post.text


# ---------- 3. Reactivation ----------
class TestReactivation:
    """is_active=False → restart → seed flips back to True (login works)."""

    def test_disabled_admin_reactivated_on_restart(self, mongo):
        res = mongo.users.update_one(
            {"email": ADMIN_EMAIL},
            {"$set": {"is_active": False}},
        )
        assert res.matched_count == 1

        # Confirm disabled state actually blocks login (should be 401, since
        # the login handler checks password first — a valid password on a
        # disabled account would give 403, but we want to confirm the
        # server sees the flag; either 401 or 403 pre-fix would indicate
        # a lockout condition).
        pre = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert pre.status_code in (401, 403), pre.text

        _restart_backend_and_wait()

        post = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert post.status_code == 200, \
            f"Re-activation on startup failed: {post.status_code} {post.text}"
        assert post.json()["user"]["is_active"] is True

        # And verify DB flag was flipped back.
        doc = mongo.users.find_one({"email": ADMIN_EMAIL})
        assert doc.get("is_active", True) is True


# ---------- 4. Downstream API works with fresh token ----------
class TestAuthenticatedEndpointsAfterReseed:
    """After re-seeding, the fresh token must work on protected routes."""

    @pytest.fixture(scope="class")
    def token(self):
        r = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert r.status_code == 200, r.text
        return r.json()["token"]

    def test_get_users_with_admin_token(self, token):
        r = requests.get(
            f"{API}/users",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        # Response can be list or {items:[...]} — accept either.
        items = body if isinstance(body, list) else body.get("items", body.get("users", []))
        assert isinstance(items, list)
        emails = [u.get("email") for u in items]
        assert ADMIN_EMAIL in emails

    def test_get_sites_with_admin_token(self, token):
        r = requests.get(
            f"{API}/sites",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
        assert r.status_code == 200, r.text

    def test_auth_me_returns_super_admin(self, token):
        r = requests.get(
            f"{API}/auth/me",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
        assert r.status_code == 200, r.text
        assert r.json()["role"] == "super_admin"
