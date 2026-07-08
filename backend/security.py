"""
Security hardening helpers.

Provides:
  - Rate limiting (in-memory sliding window)
  - Login brute-force lockout
  - Password strength enforcement
  - Magic-byte / MIME validation for uploads
  - Startup safety checks (weak JWT secret, permissive CORS, etc.)
  - Security-headers middleware

Designed to work single-process. For multi-worker deployments the rate
limits should be swapped for a Redis-backed store (see 14_Future_Features).
"""
from __future__ import annotations

import ipaddress
import logging
import os
import re
import time
from collections import defaultdict, deque
from typing import Deque, Dict, Optional, Tuple

from fastapi import HTTPException, Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

logger = logging.getLogger("formforge.security")


# ---------- 1. Startup safety checks ----------

def enforce_startup_security(env: Dict[str, str]) -> None:
    """Raise SystemExit if the runtime environment looks unsafe for
    production. Called from `server.py` at module import time.
    Set `SECURITY_STRICT=false` to override (dev machines)."""
    strict = env.get("SECURITY_STRICT", "true").lower() != "false"
    problems: list[str] = []

    secret = env.get("JWT_SECRET", "")
    if not secret or secret == "dev-secret" or secret.startswith("change-me") or len(secret) < 32:
        problems.append(
            "JWT_SECRET is missing, default, or shorter than 32 chars. "
            "Generate one with:  python -c \"import secrets; print(secrets.token_hex(48))\""
        )

    cors = env.get("CORS_ORIGINS", "*")
    if cors.strip() == "*" and strict:
        problems.append(
            "CORS_ORIGINS is '*' — set to a comma-separated list of allowed origins."
        )

    pw = env.get("SEED_ADMIN_PASSWORD", "")
    if pw and pw in {"Admin@12345", "changeme", "password"} and strict:
        problems.append(
            "SEED_ADMIN_PASSWORD is a well-known demo value. Change it before deploying."
        )

    if not problems:
        return

    banner = "\n".join(f"  - {p}" for p in problems)
    msg = (
        "\n" + "=" * 72
        + "\n  SECURITY WARNING - startup blocked (set SECURITY_STRICT=false to bypass)\n"
        + banner
        + "\n" + "=" * 72
    )
    if strict:
        raise SystemExit(msg)
    logger.warning(msg)


# ---------- 2. Rate limiting (sliding window) ----------

class SlidingWindowLimiter:
    """Naive in-memory sliding-window counter. Thread-safe within a single
    uvicorn worker (which is what matters — asyncio is single-threaded)."""

    def __init__(self, max_events: int, window_seconds: float):
        self.max = max_events
        self.window = window_seconds
        self._events: Dict[str, Deque[float]] = defaultdict(deque)

    def hit(self, key: str) -> Tuple[bool, float]:
        """Returns (allowed, retry_after_seconds)."""
        now = time.monotonic()
        events = self._events[key]
        # Drop expired
        while events and now - events[0] > self.window:
            events.popleft()
        if len(events) >= self.max:
            retry = self.window - (now - events[0])
            return False, max(1.0, retry)
        events.append(now)
        return True, 0.0

    def reset(self, key: str) -> None:
        self._events.pop(key, None)


# Reasonable defaults; can be tuned via env
LOGIN_LIMITER = SlidingWindowLimiter(
    max_events=int(os.environ.get("LOGIN_MAX_ATTEMPTS", 8)),
    window_seconds=float(os.environ.get("LOGIN_WINDOW_SECONDS", 900)),  # 15 min
)
PUBLIC_SUBMIT_LIMITER = SlidingWindowLimiter(
    max_events=int(os.environ.get("SUBMIT_MAX_PER_MIN", 20)),
    window_seconds=60,
)
UPLOAD_LIMITER = SlidingWindowLimiter(
    max_events=int(os.environ.get("UPLOAD_MAX_PER_MIN", 30)),
    window_seconds=60,
)


def _client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        # First entry is original client
        raw = xff.split(",")[0].strip()
        try:
            ipaddress.ip_address(raw)
            return raw
        except ValueError:
            pass
    return request.client.host if request.client else "unknown"


def check_rate_limit(limiter: SlidingWindowLimiter, key: str, label: str) -> None:
    ok, retry = limiter.hit(key)
    if not ok:
        raise HTTPException(
            status_code=429,
            detail=f"Too many {label} attempts. Try again in {int(retry)}s.",
            headers={"Retry-After": str(int(retry))},
        )


# ---------- 3. Password strength ----------

def validate_password_strength(pw: str) -> None:
    """Raise HTTPException(400) if the password is too weak."""
    if not isinstance(pw, str) or len(pw) < 10:
        raise HTTPException(400, "Password must be at least 10 characters.")
    if len(pw) > 128:
        raise HTTPException(400, "Password is too long (max 128).")
    classes = 0
    if re.search(r"[a-z]", pw):
        classes += 1
    if re.search(r"[A-Z]", pw):
        classes += 1
    if re.search(r"\d", pw):
        classes += 1
    if re.search(r"[^\w\s]", pw):
        classes += 1
    if classes < 3:
        raise HTTPException(
            400,
            "Password must contain at least 3 of: lower, upper, digit, symbol.",
        )
    # Reject well-known / common leaked passwords quickly
    banned = {
        "password", "password123", "admin@12345", "welcome1", "letmein",
        "qwerty12345", "iloveyou", "administrator", "changeme",
    }
    if pw.lower() in banned:
        raise HTTPException(400, "This password is too common. Please choose another.")


# ---------- 4. Upload magic-byte / MIME validation ----------

# First bytes of common file types. Ordered longest-first.
_MAGIC_BYTES: list[Tuple[bytes, str]] = [
    (b"\x89PNG\r\n\x1a\n",             "image/png"),
    (b"\xff\xd8\xff",                  "image/jpeg"),
    (b"GIF87a",                        "image/gif"),
    (b"GIF89a",                        "image/gif"),
    (b"RIFF",                          "image/webp"),   # further check needed
    (b"%PDF-",                         "application/pdf"),
    (b"PK\x03\x04",                    "application/zip"),  # xlsx/docx/zip
    (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1", "application/x-ole"),  # legacy .doc/.xls
]

_ALLOWED_EXT_MIME = {
    "png":  {"image/png"},
    "jpg":  {"image/jpeg"},
    "jpeg": {"image/jpeg"},
    "gif":  {"image/gif"},
    "webp": {"image/webp"},
    "pdf":  {"application/pdf"},
    "txt":  {"text/plain", None},   # text has no magic
    "csv":  {"text/csv", "text/plain", None},
    "xlsx": {"application/zip", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},
    "docx": {"application/zip", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"},
    "zip":  {"application/zip"},
    "doc":  {"application/x-ole"},
    "xls":  {"application/x-ole"},
}


def sniff_content_type(data: bytes) -> Optional[str]:
    """Return the sniffed content-type from magic bytes, or None if unknown."""
    for sig, ct in _MAGIC_BYTES:
        if data.startswith(sig):
            if ct == "image/webp" and not (len(data) >= 12 and data[8:12] == b"WEBP"):
                continue
            return ct
    # crude text-vs-binary heuristic
    if data:
        try:
            data[:1024].decode("utf-8")
            return "text/plain"
        except UnicodeDecodeError:
            return None
    return None


def validate_upload(filename: str, data: bytes) -> None:
    """Raise HTTPException(400) if the file's actual content doesn't match
    the extension the user claims. Prevents `.png` name with a PHP payload."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if not ext:
        raise HTTPException(400, "Filename must have an extension.")
    allowed = _ALLOWED_EXT_MIME.get(ext)
    if allowed is None:
        # Not in our whitelist — the caller decides whether to reject.
        # We return silently; the upload endpoint has its own ALLOWED_EXTS gate.
        return
    sniffed = sniff_content_type(data)
    if sniffed not in allowed:
        raise HTTPException(
            400,
            f"File contents do not match the '.{ext}' extension "
            f"(detected {sniffed or 'unknown'}).",
        )


# ---------- 5. Security-headers middleware ----------

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Adds HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
    and a permissive-but-safe CSP. Skip in dev via env if it conflicts with
    the CRA hot-reload iframe."""

    def __init__(self, app, enable_hsts: bool = True, csp: Optional[str] = None):
        super().__init__(app)
        self.enable_hsts = enable_hsts
        self.csp = csp or (
            "default-src 'self'; "
            "img-src 'self' data: blob:; "
            "media-src 'self' blob:; "
            "connect-src 'self' ws: wss:; "
            "style-src 'self' 'unsafe-inline'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            "font-src 'self' data:; "
            "frame-ancestors 'none'; "
            "base-uri 'self'; "
            "form-action 'self'"
        )

    async def dispatch(self, request: Request, call_next) -> Response:
        response: Response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
        response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        if self.enable_hsts:
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        response.headers.setdefault("Content-Security-Policy", self.csp)
        return response


# ---------- 6. Sensitive-data redaction helper ----------

def redact_for_log(d: dict) -> dict:
    """Shallow copy with common sensitive keys redacted."""
    out = {}
    for k, v in d.items():
        low = k.lower()
        if any(s in low for s in ("password", "token", "secret", "authorization", "cookie")):
            out[k] = "***"
        else:
            out[k] = v
    return out
