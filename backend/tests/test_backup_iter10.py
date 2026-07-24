"""
Iteration 10 — Backup & Restore focused re-tests
------------------------------------------------

Covers the specific items called out in the review request:
  * Loop-variable-leak fix — POST /api/backups returns a proper
    `formforge-YYYY-MM-DD_HHMMSS.tar.gz` filename, NOT the leaked
    inner-loop value ('assets').
  * Tar contents — top-level entries are exactly:
        manifest.json, mongo/dump.archive,
        uploads/{local,pdf,completed,assets}/
  * Restore round-trip: marker doc in db.settings + marker file under
    /app/backend/uploads/completed/ both come back after restore.
  * Regression: retention pruning still deletes old tarballs.
  * Regression: DELETE /api/backups/{name} removes the file.
  * Regression: 403 on all /api/backups/* + /api/backup-config for
    non-super-admin.
  * Regression: login + /api/dashboard/stats + /api/users + /api/sites
    all return 200 for super_admin.
"""
from __future__ import annotations

import io
import json
import os
import re
import tarfile
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

import pytest
import requests
from pymongo import MongoClient


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
            break
API = f"{BASE_URL}/api"

BACKUP_ROOT = Path("/app/backend/uploads/backups")
COMPLETED_ROOT = Path("/app/backend/uploads/completed")

SUPER = {"email": "admin@example.com", "password": "Admin@12345"}
ADMIN = {"email": "rahul.verma@example.com", "password": "Admin@12345"}

NAME_RE = re.compile(r"^formforge-\d{4}-\d{2}-\d{2}_\d{6}\.tar\.gz$")


# -------------------------- fixtures --------------------------
@pytest.fixture(scope="session")
def super_token() -> str:
    r = requests.post(f"{API}/auth/login", json=SUPER, timeout=30)
    assert r.status_code == 200, f"super login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_token() -> str:
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _h(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="session")
def mongo():
    url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    dbn = os.environ.get("DB_NAME", "formforge")
    c = MongoClient(url)
    yield c[dbn]
    c.close()


# -------------------------- loop-var-leak fix --------------------------
class TestLoopVarLeakFix:
    """The bug: `name` was clobbered by the inner-loop variable, so POST
    /api/backups returned {'name': 'assets', ...} instead of the tar
    filename.  We just POST and confirm the returned name matches the
    filename pattern AND actually exists on disk."""

    def test_create_returns_real_filename(self, super_token):
        r = requests.post(f"{API}/backups", headers=_h(super_token), timeout=60)
        assert r.status_code == 200, r.text
        info = r.json()
        name = info.get("name", "")
        # not the leaked loop-var
        assert name not in ("local", "pdf", "completed", "assets"), \
            f"loop-variable leak still present: name={name!r}"
        # is a legit archive filename
        assert NAME_RE.match(name), f"unexpected name shape: {name!r}"
        # physically exists
        assert (BACKUP_ROOT / name).exists()
        assert info["size_bytes"] > 0
        assert info["reason"] == "manual"
        pytest.LATEST_BACKUP = name


# -------------------------- tar contents --------------------------
class TestTarContents:
    def test_toplevel_and_upload_subdirs(self, super_token):
        name = getattr(pytest, "LATEST_BACKUP", None)
        assert name, "no snapshot to inspect"
        p = BACKUP_ROOT / name
        with tarfile.open(p, "r:gz") as tar:
            entries = tar.getnames()

        # top-level: manifest.json + mongo/dump.archive + uploads/
        assert "manifest.json" in entries
        assert "mongo/dump.archive" in entries

        # every upload root sub-dir present
        first2 = {e.split("/", 2)[0] + "/" + e.split("/", 2)[1]
                  for e in entries if "/" in e}
        for sub in ("local", "pdf", "completed", "assets"):
            assert f"uploads/{sub}" in first2, \
                f"uploads/{sub}/ missing from tarball entries"


# -------------------------- restore round-trip: db marker --------------------------
class TestRestoreRoundTripDb:
    def test_marker_doc_restored(self, super_token, mongo):
        # 1) insert marker
        mongo.settings.delete_one({"_id": "iter10_marker"})
        mongo.settings.insert_one({"_id": "iter10_marker",
                                    "value": "iter10-hello",
                                    "ts": time.time()})
        assert mongo.settings.find_one({"_id": "iter10_marker"})

        # 2) fresh snapshot
        r = requests.post(f"{API}/backups", headers=_h(super_token), timeout=60)
        assert r.status_code == 200
        snap = r.json()["name"]

        # 3) drop marker
        mongo.settings.delete_one({"_id": "iter10_marker"})
        assert mongo.settings.find_one({"_id": "iter10_marker"}) is None

        # 4) restore
        r = requests.post(f"{API}/backups/{snap}/restore",
                          headers=_h(super_token), timeout=180)
        assert r.status_code == 200, r.text
        assert r.json()["name"] == snap

        # 5) marker back
        d = mongo.settings.find_one({"_id": "iter10_marker"})
        assert d is not None, "marker missing after restore"
        assert d.get("value") == "iter10-hello"

        # cleanup
        mongo.settings.delete_one({"_id": "iter10_marker"})


# -------------------------- restore round-trip: completed/ marker file -----------
class TestRestoreRoundTripUploads:
    def test_completed_marker_file_restored(self, super_token):
        COMPLETED_ROOT.mkdir(parents=True, exist_ok=True)
        marker = COMPLETED_ROOT / "iter10_upload_marker.txt"
        marker.write_text("iter10-completed-upload-marker")
        assert marker.exists()

        # snapshot
        r = requests.post(f"{API}/backups", headers=_h(super_token), timeout=60)
        assert r.status_code == 200
        snap = r.json()["name"]

        # confirm marker inside the tar
        with tarfile.open(BACKUP_ROOT / snap, "r:gz") as tar:
            entries = tar.getnames()
        assert "uploads/completed/iter10_upload_marker.txt" in entries

        # delete marker file
        marker.unlink()
        assert not marker.exists()

        # restore
        r = requests.post(f"{API}/backups/{snap}/restore",
                          headers=_h(super_token), timeout=180)
        assert r.status_code == 200, r.text
        # marker file back
        assert marker.exists(), "completed/iter10_upload_marker.txt missing after restore"
        assert marker.read_text() == "iter10-completed-upload-marker"

        # cleanup
        try:
            marker.unlink()
        except OSError:
            pass


# -------------------------- retention pruning --------------------------
class TestRetention:
    def test_prune_old(self, super_token):
        # ensure retention=3 days
        requests.put(f"{API}/backup-config",
                     json={"retention_days": 3},
                     headers=_h(super_token), timeout=15)

        # place 3 old dummy .tar.gz files
        old_names = []
        old_mtime = time.time() - 5 * 86400
        for i in range(3):
            p = BACKUP_ROOT / f"formforge-iter10-old-{i}.tar.gz"
            with tarfile.open(p, "w:gz") as tar:
                info = tarfile.TarInfo("dummy.txt")
                info.size = 1
                tar.addfile(info, io.BytesIO(b"x"))
            os.utime(p, (old_mtime, old_mtime))
            old_names.append(p.name)
        for n in old_names:
            assert (BACKUP_ROOT / n).exists()

        # trigger create → prunes
        r = requests.post(f"{API}/backups",
                          headers=_h(super_token), timeout=60)
        assert r.status_code == 200

        remaining = {p.name for p in BACKUP_ROOT.iterdir()}
        for n in old_names:
            assert n not in remaining, f"old snapshot {n} not pruned"


# -------------------------- delete --------------------------
class TestDelete:
    def test_delete_removes_file(self, super_token):
        r = requests.post(f"{API}/backups", headers=_h(super_token), timeout=60)
        name = r.json()["name"]
        p = BACKUP_ROOT / name
        assert p.exists()
        r = requests.delete(f"{API}/backups/{name}",
                            headers=_h(super_token), timeout=15)
        assert r.status_code == 200
        assert not p.exists()


# -------------------------- RBAC --------------------------
class TestRBAC:
    def test_admin_403_list(self, admin_token):
        r = requests.get(f"{API}/backups", headers=_h(admin_token), timeout=15)
        assert r.status_code == 403

    def test_admin_403_create(self, admin_token):
        r = requests.post(f"{API}/backups", headers=_h(admin_token), timeout=15)
        assert r.status_code == 403

    def test_admin_403_delete(self, admin_token):
        r = requests.delete(f"{API}/backups/whatever.tar.gz",
                            headers=_h(admin_token), timeout=15)
        assert r.status_code == 403

    def test_admin_403_restore(self, admin_token):
        r = requests.post(f"{API}/backups/whatever.tar.gz/restore",
                          headers=_h(admin_token), timeout=15)
        assert r.status_code == 403

    def test_admin_403_config_get(self, admin_token):
        r = requests.get(f"{API}/backup-config",
                        headers=_h(admin_token), timeout=15)
        assert r.status_code == 403

    def test_admin_403_config_put(self, admin_token):
        r = requests.put(f"{API}/backup-config",
                        json={"enabled": True},
                        headers=_h(admin_token), timeout=15)
        assert r.status_code == 403


# -------------------------- core API regression --------------------------
class TestCoreRegression:
    def test_login_super(self):
        r = requests.post(f"{API}/auth/login", json=SUPER, timeout=15)
        assert r.status_code == 200

    def test_dashboard_stats(self, super_token):
        r = requests.get(f"{API}/dashboard/stats",
                         headers=_h(super_token), timeout=15)
        assert r.status_code == 200

    def test_users(self, super_token):
        r = requests.get(f"{API}/users",
                         headers=_h(super_token), timeout=15)
        assert r.status_code == 200

    def test_sites(self, super_token):
        r = requests.get(f"{API}/sites",
                         headers=_h(super_token), timeout=15)
        assert r.status_code == 200
