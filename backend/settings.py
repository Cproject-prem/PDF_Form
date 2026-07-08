"""
FormForge — Central Configuration
==================================

This single file controls everything you'd normally spread across .env files
and admin UIs: storage path, master login, SMTP, FTP, security policy,
welcome email template, and more.

USAGE
-----
1. Edit the constants below to match your environment.
2. Run:      python settings.py           (dry-run - shows the diff)
              python settings.py --apply   (writes to .env + database)
3. Restart the backend:
              supervisorctl restart backend        (Linux/Docker)
              # or in your PowerShell: Ctrl+C then uvicorn server:app ...

The rest of the codebase does NOT need to change - it reads from .env and
from the same MongoDB collections we write here.
"""
from __future__ import annotations

# ============================================================================
#  1.  EDITABLE VALUES                                                      🖊
# ============================================================================
# Everything below is a plain Python dict. Edit values, save the file, run
# `python settings.py --apply`. Leave blank strings ("") to keep the current
# value or to disable optional features.

APP = {
    "name":           "formforge",
    "mongo_url":      "mongodb://localhost:27017",
    "db_name":        "formforge",
    "public_base_url":"http://localhost:3000",   # used in welcome-email links
}

STORAGE = {
    # Absolute or relative path where uploaded files live on disk.
    # Files land in <upload_root>/tmp/  and later move to
    # <upload_root>/submissions/{submission_id}/{filename}
    "upload_root":  "./uploads/local",

    # Max size of a single upload (MB)
    "max_upload_mb": 25,
}

# The super-admin login. Password is bcrypt-hashed before writing to Mongo.
# Leave the password blank to keep whatever hash is already in the DB.
MASTER_ADMIN = {
    "email":    "admin@example.com",
    "name":     "Super Admin",
    "password": "Admin@12345",           # change me!
}

# Outbound email (workflows, welcome mails, approvals). If host is blank the
# backend will silently skip sending — useful during dev.
SMTP = {
    "host":         "",                  # e.g. "smtp.gmail.com"
    "port":         587,
    "user":         "",                  # SMTP username
    "password":     "",                  # SMTP password / app password
    "from_address": "no-reply@formforge.local",
    "use_tls":      True,
}

# Optional FTP endpoint — used by the nightly backup script if enabled.
# Leave host blank to disable.
FTP = {
    "host":       "",                    # e.g. "ftp.company.com"
    "port":       21,
    "user":       "",
    "password":   "",
    "remote_dir": "/formforge-backups/",
    "use_ftps":   False,                 # True → FTPS (explicit TLS)
}

SECURITY = {
    # 64-char random hex is ideal. Leave blank ("") to keep whatever is in .env.
    # Generate a new one with:
    #    python -c "import secrets; print(secrets.token_hex(48))"
    "jwt_secret": "",

    # Comma-list of allowed frontend origins. Use ["*"] only for dev.
    "cors_origins":         ["*"],

    # Login brute-force protection
    "login_max_attempts":   8,
    "login_window_seconds": 900,         # 15 min

    # Public-submit & upload throttles (per minute)
    "submit_max_per_min":   20,
    "upload_max_per_min":   30,

    # Hard-fail startup if config is unsafe. Set False on dev machines.
    "strict":  False,
    # Enable HSTS header — turn on ONLY when serving over HTTPS.
    "https":   False,
}

WELCOME_EMAIL = {
    "subject":   "Welcome to FormForge — your account is ready",
    "body_html": """
        <p>Hi {{name}},</p>
        <p>Your FormForge account has been created.</p>
        <ul>
          <li><b>Email:</b> {{email}}</li>
          <li><b>Temporary password:</b> {{temp_password}}</li>
          <li><b>Sign in:</b> <a href="{{login_url}}">{{login_url}}</a></li>
        </ul>
        <p>Please change your password after first login.</p>
    """.strip(),
}

# Anything else you want persisted as a workspace setting.
# Written to db.workspace_settings under the "_id" key of the outer dict.
EXTRA = {
    # "branding": { "primary_color": "#2563EB", "logo_url": "..." },
    # "features": { "enable_pdf_view_mode": True },
}


# ============================================================================
#  2.  APPLY LOGIC — do not edit below this line unless you know why       🔒
# ============================================================================
import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

BACKEND_ROOT = Path(__file__).resolve().parent
ENV_FILE     = BACKEND_ROOT / ".env"


# ---------- .env writer ----------
_ENV_KEYS_IN_ORDER = [
    ("MONGO_URL",            lambda: APP["mongo_url"]),
    ("DB_NAME",              lambda: APP["db_name"]),
    ("APP_NAME",             lambda: APP["name"]),
    ("PUBLIC_BASE_URL",      lambda: APP["public_base_url"]),
    ("LOCAL_UPLOAD_ROOT",    lambda: str(_abs_path(STORAGE["upload_root"]))),
    ("MAX_UPLOAD_MB",        lambda: str(STORAGE["max_upload_mb"])),
    ("SEED_ADMIN_EMAIL",     lambda: MASTER_ADMIN["email"]),
    ("SEED_ADMIN_NAME",      lambda: MASTER_ADMIN["name"]),
    # Note: SEED_ADMIN_PASSWORD is intentionally omitted from .env; we push
    # the hashed password directly into Mongo. Keeping plaintext out of the
    # env file is a small but real security win.
    ("CORS_ORIGINS",         lambda: ",".join(SECURITY["cors_origins"])),
    ("LOGIN_MAX_ATTEMPTS",   lambda: str(SECURITY["login_max_attempts"])),
    ("LOGIN_WINDOW_SECONDS", lambda: str(SECURITY["login_window_seconds"])),
    ("SUBMIT_MAX_PER_MIN",   lambda: str(SECURITY["submit_max_per_min"])),
    ("UPLOAD_MAX_PER_MIN",   lambda: str(SECURITY["upload_max_per_min"])),
    ("SECURITY_STRICT",      lambda: "true" if SECURITY["strict"] else "false"),
    ("SECURITY_HTTPS",       lambda: "true" if SECURITY["https"] else "false"),
]


def _abs_path(p: str) -> Path:
    q = Path(p)
    return q if q.is_absolute() else (BACKEND_ROOT / q).resolve()


def _read_env_file() -> Dict[str, str]:
    if not ENV_FILE.exists():
        return {}
    out: Dict[str, str] = {}
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        m = re.match(r'\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$', line)
        if m:
            out[m.group(1)] = m.group(2)
    return out


def _write_env_file(new_values: Dict[str, str]) -> None:
    """Merge new_values into .env, preserving any keys not managed here."""
    existing = _read_env_file()
    existing.update(new_values)
    # Preserve JWT_SECRET if the user cleared it in this file
    if not SECURITY["jwt_secret"] and "JWT_SECRET" in existing:
        pass  # keep existing
    elif SECURITY["jwt_secret"]:
        existing["JWT_SECRET"] = SECURITY["jwt_secret"]
    lines = [f'{k}="{v}"' for k, v in existing.items()]
    ENV_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _build_env_updates() -> Dict[str, str]:
    return {key: fn() for key, fn in _ENV_KEYS_IN_ORDER}


# ---------- Database writer ----------
def _open_db():
    try:
        from pymongo import MongoClient
    except ImportError:
        print("ERROR: pymongo is not installed. Run: pip install pymongo bcrypt")
        sys.exit(2)
    client = MongoClient(APP["mongo_url"], serverSelectionTimeoutMS=5000)
    client.admin.command("ping")
    return client[APP["db_name"]]


def _upsert_master_admin(db) -> str:
    """Return a status string describing what happened."""
    try:
        import bcrypt
    except ImportError:
        print("ERROR: bcrypt not installed. Run: pip install bcrypt")
        sys.exit(2)

    email = MASTER_ADMIN["email"].lower().strip()
    if not email:
        return "skipped (no email)"

    existing = db.users.find_one({"email": email})
    now_iso = datetime.now(timezone.utc).isoformat()
    if existing:
        set_doc = {"name": MASTER_ADMIN["name"], "role": "super_admin", "is_active": True}
        if MASTER_ADMIN["password"]:
            set_doc["password_hash"] = bcrypt.hashpw(
                MASTER_ADMIN["password"].encode(), bcrypt.gensalt()
            ).decode()
        db.users.update_one({"_id": existing["_id"]}, {"$set": set_doc})
        return "updated existing"
    # New master user
    import uuid
    uid = f"user_{uuid.uuid4().hex[:12]}"
    doc = {
        "user_id": uid,
        "email": email,
        "name": MASTER_ADMIN["name"],
        "role": "super_admin",
        "password_hash": bcrypt.hashpw(
            (MASTER_ADMIN["password"] or "changeme").encode(), bcrypt.gensalt()
        ).decode(),
        "is_active": True,
        "created_at": now_iso,
    }
    db.users.insert_one(doc)
    return "created new"


def _upsert_smtp(db) -> str:
    if not SMTP["host"]:
        return "skipped (host blank — SMTP disabled)"
    doc = {
        "_id": "smtp",
        "host": SMTP["host"],
        "port": int(SMTP["port"]),
        "user": SMTP["user"],
        "password": SMTP["password"],
        "from_address": SMTP["from_address"],
        "use_tls": bool(SMTP["use_tls"]),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    db.smtp_config.replace_one({"_id": "smtp"}, doc, upsert=True)
    return "written"


def _upsert_ftp(db) -> str:
    if not FTP["host"]:
        return "skipped (host blank — FTP disabled)"
    doc = {
        "_id": "ftp",
        "host": FTP["host"],
        "port": int(FTP["port"]),
        "user": FTP["user"],
        "password": FTP["password"],
        "remote_dir": FTP["remote_dir"],
        "use_ftps": bool(FTP["use_ftps"]),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    db.workspace_settings.replace_one({"_id": "ftp"}, doc, upsert=True)
    return "written"


def _upsert_welcome_email(db) -> str:
    doc = {
        "_id": "welcome_email",
        "subject": WELCOME_EMAIL["subject"],
        "body_html": WELCOME_EMAIL["body_html"],
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    db.workspace_settings.replace_one({"_id": "welcome_email"}, doc, upsert=True)
    return "written"


def _upsert_extra(db) -> str:
    n = 0
    for key, payload in (EXTRA or {}).items():
        doc = {"_id": key, **payload,
               "updated_at": datetime.now(timezone.utc).isoformat()}
        db.workspace_settings.replace_one({"_id": key}, doc, upsert=True)
        n += 1
    return f"{n} entries" if n else "none"


# ---------- Main ----------
def main() -> int:
    ap = argparse.ArgumentParser(description="Apply FormForge central settings.")
    ap.add_argument("--apply", action="store_true", help="Actually write .env + DB (default is dry-run)")
    ap.add_argument("--only",
                    choices=["env", "admin", "smtp", "ftp", "welcome", "extra"],
                    help="Only apply one section")
    args = ap.parse_args()
    dry = not args.apply

    banner = "=" * 72
    print(banner)
    print("FormForge — Settings apply" + ("  (DRY-RUN)" if dry else "  (APPLY)"))
    print(banner)

    # 1) Show planned .env diff
    if args.only in (None, "env"):
        current = _read_env_file()
        planned = _build_env_updates()
        print("\n--- .env changes ---")
        for k, v in planned.items():
            old = current.get(k, "<unset>")
            v_display = v if k not in ("JWT_SECRET",) else "***"
            old_display = old if k not in ("JWT_SECRET",) else ("***" if old else "<unset>")
            mark = " " if old == v else "*"
            print(f"  {mark} {k:<24s} {old_display}  ->  {v_display}")
        if SECURITY["jwt_secret"]:
            print("  * JWT_SECRET             (rotating to a new secret — all sessions will invalidate)")
        if not dry:
            _write_env_file(planned)
            print("  .env written.")

    # 2) DB updates
    if args.only != "env":
        try:
            db = _open_db()
        except Exception as e:
            print(f"\nERROR: cannot reach MongoDB at {APP['mongo_url']}: {e}")
            print("       (DB changes skipped; .env has been written if --apply was used.)")
            return 1
        print(f"\n--- MongoDB ({APP['mongo_url']} / {APP['db_name']}) ---")

        if args.only in (None, "admin"):
            print(f"  master_admin ({MASTER_ADMIN['email']}):  ",
                  "(dry-run)" if dry else _upsert_master_admin(db))
        if args.only in (None, "smtp"):
            print("  smtp_config:                             ",
                  "(dry-run)" if dry else _upsert_smtp(db))
        if args.only in (None, "ftp"):
            print("  ftp workspace_settings:                  ",
                  "(dry-run)" if dry else _upsert_ftp(db))
        if args.only in (None, "welcome"):
            print("  welcome_email workspace_settings:        ",
                  "(dry-run)" if dry else _upsert_welcome_email(db))
        if args.only in (None, "extra"):
            print("  extra workspace_settings:                ",
                  "(dry-run)" if dry else _upsert_extra(db))

    print("\n" + banner)
    if dry:
        print("Dry-run complete.  Re-run with --apply to persist changes.")
    else:
        print("Done.  Restart the backend for .env changes to take effect:")
        print("       Ctrl+C  then  uvicorn server:app --reload --port 8001")
    print(banner)
    return 0


if __name__ == "__main__":
    sys.exit(main())
