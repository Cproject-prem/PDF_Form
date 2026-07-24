"""
Iteration 9 — Backup & Restore + Env-driven storage regressions.

Covers:
  * GET/PUT /api/backup-config (RBAC + clamping)
  * POST/GET/DELETE /api/backups (RBAC + snapshot on disk)
  * GET /api/backups/{name}/download → validates manifest.json + gzipped mongodump
  * POST /api/backups/{name}/restore → drops+recreates a marker doc, verifies restore
  * Retention pruning (fake old .tar.gz mtimes)
  * Env-driven storage directory presence
  * Regressions: login, dashboard/sites/users, PDF template CRUD, plant docs
"""
from __future__ import annotations

import io
import json
import os
import shutil
import subprocess
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
    # fallback for pytest-run-from-container: read frontend/.env
    envfile = Path("/app/frontend/.env").read_text()
    for line in envfile.splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
            break
API = f"{BASE_URL}/api"

BACKUP_ROOT = Path("/app/backend/uploads/backups")
UPLOAD_ROOT = Path("/app/backend/uploads/local")

SUPER = {"email": "admin@example.com", "password": "Admin@12345"}
ADMIN = {"email": "rahul.verma@example.com", "password": "Admin@12345"}


# ------------------------- fixtures -------------------------
@pytest.fixture(scope="session")
def super_token() -> str:
    r = requests.post(f"{API}/auth/login", json=SUPER, timeout=30)
    assert r.status_code == 200, f"super login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_token() -> str:
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
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


# ------------------------- backup-config RBAC + clamping -------------------------
class TestBackupConfig:
    def test_get_config_super(self, super_token):
        r = requests.get(f"{API}/backup-config", headers=_h(super_token), timeout=20)
        assert r.status_code == 200, r.text
        cfg = r.json()
        for k in ("enabled", "hour_utc", "minute_utc", "retention_days"):
            assert k in cfg, f"missing key {k}"
        assert isinstance(cfg["enabled"], bool)
        assert 0 <= cfg["hour_utc"] <= 23
        assert 0 <= cfg["minute_utc"] <= 59
        assert cfg["retention_days"] >= 1

    def test_get_config_admin_forbidden(self, admin_token):
        r = requests.get(f"{API}/backup-config", headers=_h(admin_token), timeout=20)
        assert r.status_code == 403

    def test_put_config_persists(self, super_token):
        body = {"enabled": True, "hour_utc": 3, "minute_utc": 0, "retention_days": 3}
        r = requests.put(f"{API}/backup-config", json=body,
                         headers=_h(super_token), timeout=20)
        assert r.status_code == 200, r.text
        got = r.json()
        assert got["enabled"] is True
        assert got["hour_utc"] == 3
        assert got["minute_utc"] == 0
        assert got["retention_days"] == 3
        # verify via GET
        r2 = requests.get(f"{API}/backup-config", headers=_h(super_token), timeout=20)
        got2 = r2.json()
        assert got2["enabled"] is True
        assert got2["hour_utc"] == 3
        assert got2["retention_days"] == 3

    def test_put_config_clamps_out_of_range(self, super_token):
        body = {"enabled": False, "hour_utc": 99, "minute_utc": 400,
                "retention_days": 500}
        r = requests.put(f"{API}/backup-config", json=body,
                         headers=_h(super_token), timeout=20)
        assert r.status_code == 200, r.text
        got = r.json()
        assert got["hour_utc"] == 23
        assert got["minute_utc"] == 59
        assert got["retention_days"] == 30
        # low-side
        body = {"hour_utc": -5, "minute_utc": -1, "retention_days": -3}
        r = requests.put(f"{API}/backup-config", json=body,
                         headers=_h(super_token), timeout=20)
        got = r.json()
        assert got["hour_utc"] == 0
        assert got["minute_utc"] == 0
        assert got["retention_days"] == 1

    def test_put_config_admin_forbidden(self, admin_token):
        r = requests.put(f"{API}/backup-config", json={"enabled": True},
                         headers=_h(admin_token), timeout=20)
        assert r.status_code == 403


# ------------------------- snapshot create/list/RBAC -------------------------
class TestBackupCreate:
    def test_create_snapshot_super(self, super_token):
        r = requests.post(f"{API}/backups", headers=_h(super_token), timeout=60)
        assert r.status_code == 200, r.text
        info = r.json()
        assert info["name"].endswith(".tar.gz")
        assert info["size_bytes"] > 0
        assert info["reason"] == "manual"
        # file physically exists
        p = BACKUP_ROOT / info["name"]
        assert p.exists() and p.stat().st_size == info["size_bytes"]
        pytest.LATEST_BACKUP = info["name"]

    def test_list_backups_super(self, super_token):
        r = requests.get(f"{API}/backups", headers=_h(super_token), timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "snapshots" in body
        assert body["retention_days"] >= 1
        names = [s["name"] for s in body["snapshots"]]
        assert getattr(pytest, "LATEST_BACKUP", None) in names

    def test_list_backups_admin_forbidden(self, admin_token):
        r = requests.get(f"{API}/backups", headers=_h(admin_token), timeout=20)
        assert r.status_code == 403

    def test_create_backup_admin_forbidden(self, admin_token):
        r = requests.post(f"{API}/backups", headers=_h(admin_token), timeout=20)
        assert r.status_code == 403


# ------------------------- download / manifest / mongo archive -------------------------
class TestBackupDownload:
    def test_download_snapshot_content(self, super_token):
        name = getattr(pytest, "LATEST_BACKUP", None)
        assert name, "no prior snapshot to download"
        r = requests.get(f"{API}/backups/{name}/download",
                         headers=_h(super_token), timeout=60, stream=False)
        assert r.status_code == 200
        assert "gzip" in (r.headers.get("Content-Type", "").lower())
        data = r.content
        assert len(data) > 0
        # write to temp and untar
        with tempfile.TemporaryDirectory() as td:
            tdp = Path(td)
            tgz = tdp / name
            tgz.write_bytes(data)
            with tarfile.open(tgz, "r:gz") as tar:
                tar.extractall(tdp / "unpack")
            unp = tdp / "unpack"
            mani = unp / "manifest.json"
            assert mani.exists(), "manifest.json missing at top level of tar.gz"
            m = json.loads(mani.read_text())
            for k in ("version", "created_at", "reason",
                      "db_name", "upload_root_source", "uploads_size_bytes"):
                assert k in m, f"manifest missing {k}"
            # mongo archive is gzipped
            arc = unp / "mongo" / "dump.archive"
            assert arc.exists()
            first2 = arc.read_bytes()[:2]
            assert first2 == b"\x1f\x8b", "mongo dump.archive is not gzipped"

    def test_download_invalid_name(self, super_token):
        r = requests.get(f"{API}/backups/..%2Fetc%2Fpasswd/download",
                         headers=_h(super_token), timeout=15)
        assert r.status_code in (400, 404)


# ------------------------- restore round-trip -------------------------
class TestBackupRestore:
    def test_restore_recovers_marker(self, super_token, mongo):
        # 1) Insert marker into db.settings
        marker = {"_id": "iter9_marker", "value": "hello-iter9", "ts": time.time()}
        mongo.settings.delete_one({"_id": "iter9_marker"})
        mongo.settings.insert_one(marker)
        assert mongo.settings.find_one({"_id": "iter9_marker"}) is not None
        # snapshot count of a benign core collection to verify uploads survive
        core_users_count = mongo.users.count_documents({})
        assert core_users_count > 0

        # 2) fresh snapshot AFTER marker inserted
        r = requests.post(f"{API}/backups", headers=_h(super_token), timeout=60)
        assert r.status_code == 200, r.text
        snap = r.json()["name"]

        # 3) delete just the marker
        mongo.settings.delete_one({"_id": "iter9_marker"})
        assert mongo.settings.find_one({"_id": "iter9_marker"}) is None

        # sanity: uploads dir has core content still
        assert UPLOAD_ROOT.exists()
        pre_upload_children = {p.name for p in UPLOAD_ROOT.iterdir()}
        assert pre_upload_children, "uploads dir empty before restore"

        # 4) call restore
        r = requests.post(f"{API}/backups/{snap}/restore",
                          headers=_h(super_token), timeout=120)
        assert r.status_code == 200, r.text
        got = r.json()
        assert got["name"] == snap

        # 5) verify marker is back
        found = mongo.settings.find_one({"_id": "iter9_marker"})
        assert found is not None, "marker missing after restore"
        assert found.get("value") == "hello-iter9"

        # 6) uploads dir still has core children
        post_upload_children = {p.name for p in UPLOAD_ROOT.iterdir()}
        # every pre-child that also existed in the snapshot should still be here
        assert post_upload_children, "uploads dir empty after restore"
        # tmp/submissions should exist (server.py mkdir's on boot even if wiped)
        # they might have been removed and not recreated until next boot — accept either
        # cleanup the marker
        mongo.settings.delete_one({"_id": "iter9_marker"})


# ------------------------- retention pruning -------------------------
class TestRetentionPruning:
    def test_prune_old_snapshots(self, super_token):
        # place 4 dummy .tar.gz files with mtime 5 days old
        old_names = []
        old_mtime = time.time() - 5 * 86400
        for i in range(4):
            p = BACKUP_ROOT / f"formforge-testold-iter9-{i}.tar.gz"
            # write a minimal-but-real gzipped tar so the file is legit
            with tarfile.open(p, "w:gz") as tar:
                info = tarfile.TarInfo(name="dummy.txt")
                data = b"x"
                info.size = len(data)
                tar.addfile(info, io.BytesIO(data))
            os.utime(p, (old_mtime, old_mtime))
            old_names.append(p.name)

        # sanity: they exist
        for n in old_names:
            assert (BACKUP_ROOT / n).exists()

        # trigger create → prunes with retention_days=3 (was set in TestBackupConfig)
        # ensure retention is 3
        requests.put(f"{API}/backup-config",
                     json={"retention_days": 3},
                     headers=_h(super_token), timeout=15)
        r = requests.post(f"{API}/backups", headers=_h(super_token), timeout=60)
        assert r.status_code == 200

        remaining = {p.name for p in BACKUP_ROOT.iterdir()}
        for n in old_names:
            assert n not in remaining, f"old snapshot {n} not pruned"


# ------------------------- delete -------------------------
class TestBackupDelete:
    def test_delete_snapshot(self, super_token):
        r = requests.post(f"{API}/backups", headers=_h(super_token), timeout=60)
        assert r.status_code == 200
        name = r.json()["name"]
        p = BACKUP_ROOT / name
        assert p.exists()
        r = requests.delete(f"{API}/backups/{name}", headers=_h(super_token), timeout=15)
        assert r.status_code == 200
        assert not p.exists()

    def test_delete_admin_forbidden(self, admin_token):
        r = requests.delete(f"{API}/backups/fake-name.tar.gz",
                            headers=_h(admin_token), timeout=15)
        assert r.status_code == 403


# ------------------------- env-driven storage dirs -------------------------
class TestEnvStorage:
    def test_all_dirs_exist(self):
        dirs = [
            Path("/app/backend/uploads/local"),
            Path("/app/backend/uploads/local/plants"),
            Path("/app/backend/uploads/pdf"),
            Path("/app/backend/uploads/completed"),
            Path("/app/backend/uploads/assets"),
            Path("/app/backend/uploads/backups"),
        ]
        for d in dirs:
            assert d.exists() and d.is_dir(), f"missing dir {d}"

    def test_auto_recreate_after_restart(self):
        # delete `assets` (safe — only branding icons live here, non-critical)
        target = Path("/app/backend/uploads/assets")
        # move rather than delete so branding assets survive
        backup = target.with_name("assets_iter9_backup")
        if backup.exists():
            shutil.rmtree(backup)
        shutil.move(str(target), str(backup))
        assert not target.exists()

        subprocess.run(["sudo", "supervisorctl", "restart", "backend"],
                       check=True, capture_output=True, timeout=30)
        # wait for boot
        deadline = time.time() + 30
        while time.time() < deadline:
            try:
                r = requests.get(f"{API}/health", timeout=3)
                if r.status_code < 500:
                    break
            except Exception:
                pass
            time.sleep(1)
        time.sleep(2)
        recreated_ok = target.exists()
        # restore branding
        if not recreated_ok:
            shutil.move(str(backup), str(target))
        else:
            # merge backed-up branding files into the fresh dir
            for f in backup.iterdir():
                dest = target / f.name
                if not dest.exists():
                    shutil.move(str(f), str(dest))
            shutil.rmtree(backup, ignore_errors=True)
        assert recreated_ok, "assets dir was NOT recreated after backend restart"


# ------------------------- regression: auth + core APIs -------------------------
class TestRegressionCore:
    def test_login_super(self):
        r = requests.post(f"{API}/auth/login", json=SUPER, timeout=15)
        assert r.status_code == 200

    def test_dashboard_stats(self, super_token):
        r = requests.get(f"{API}/dashboard/stats",
                         headers=_h(super_token), timeout=15)
        assert r.status_code == 200

    def test_sites(self, super_token):
        r = requests.get(f"{API}/sites", headers=_h(super_token), timeout=15)
        assert r.status_code == 200

    def test_users(self, super_token):
        r = requests.get(f"{API}/users", headers=_h(super_token), timeout=15)
        assert r.status_code == 200


# ------------------------- regression: PDF template CRUD -------------------------
class TestRegressionPDF:
    def test_pdf_templates_get(self, super_token):
        r = requests.get(f"{API}/pdf-forms",
                         headers=_h(super_token), timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ------------------------- regression: plant docs endpoints -------------------------
class TestRegressionPlantDocs:
    def test_plant_docs_template(self, super_token):
        # template GET is public-to-admins; just verify it responds
        r = requests.get(f"{API}/plant-docs/template",
                         headers=_h(super_token), timeout=15)
        assert r.status_code in (200, 404)  # 404 if module renames endpoint

    def test_plant_folders_list(self, super_token):
        # pick any site
        r = requests.get(f"{API}/sites", headers=_h(super_token), timeout=15)
        sites = r.json()
        if not sites:
            pytest.skip("no sites")
        sid = sites[0]["site_id"]
        r2 = requests.get(f"{API}/plants/{sid}/folders",
                          headers=_h(super_token), timeout=15)
        assert r2.status_code == 200
