"""Username + password accounts stored in Supabase. Runs on the server only (standard library)."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import re
import time
import urllib.error
import urllib.request

log = logging.getLogger("scrawl")

USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,24}$")
UUID_RE = re.compile(r"^[0-9a-fA-F-]{36}$")
TOKEN_TTL = 60 * 60 * 24 * 14  # sessions last 14 days


class AccountError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message, self.status = message, status


def enabled() -> bool:
    return bool(os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_SERVICE_KEY"))


def _db(method: str, table: str, query: str = "", body=None):
    key = os.environ["SUPABASE_SERVICE_KEY"]
    url = os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1/" + table + ("?" + query if query else "")
    headers = {"apikey": key, "Content-Type": "application/json", "Prefer": "return=representation"}
    if key.startswith("eyJ"):  # legacy JWT-style keys also go in Authorization
        headers["Authorization"] = "Bearer " + key
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else []
    except urllib.error.HTTPError as exc:
        log.warning("Supabase %s %s failed: %s %s", method, table, exc.code, exc.read().decode("utf-8", "ignore")[:300])
        raise AccountError("Database error. Did you run supabase/schema.sql and set SUPABASE_SERVICE_KEY?", 502) from exc
    except Exception as exc:
        log.warning("Supabase unreachable: %s", exc)
        raise AccountError("Couldn't reach the database.", 502) from exc


def _hash(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return f"scrypt${salt.hex()}${digest.hex()}"


def _check(password: str, stored: str) -> bool:
    try:
        _, salt, digest = stored.split("$")
        calc = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=2**14, r=8, p=1, dklen=32)
        return hmac.compare_digest(calc.hex(), digest)
    except Exception:
        return False


def _secret() -> bytes:
    base = os.environ.get("SESSION_SECRET") or os.environ["SUPABASE_SERVICE_KEY"]
    return hashlib.sha256(("scrawl:" + base).encode()).digest()


def make_token(uid: str, username: str) -> str:
    body = json.dumps({"u": uid, "n": username, "e": int(time.time()) + TOKEN_TTL}).encode()
    payload = base64.urlsafe_b64encode(body).decode().rstrip("=")
    return payload + "." + hmac.new(_secret(), payload.encode(), hashlib.sha256).hexdigest()


def verify_token(token: str) -> str | None:
    """Return the user id for a valid, unexpired token, else None."""
    try:
        payload, sig = token.split(".")
        if not hmac.compare_digest(sig, hmac.new(_secret(), payload.encode(), hashlib.sha256).hexdigest()):
            return None
        data = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        return data["u"] if data["e"] > time.time() else None
    except Exception:
        return None


def _clean(username: str, password: str) -> str:
    name = (username or "").strip()
    if not USERNAME_RE.match(name):
        raise AccountError("Username: 3-24 letters, numbers, _ . - only.")
    if not 6 <= len(password or "") <= 72:
        raise AccountError("Password must be 6 to 72 characters.")
    return name.lower()


def signup(username: str, password: str) -> dict:
    name = _clean(username, password)
    if _db("GET", "app_users", f"username=eq.{name}&select=id"):
        raise AccountError("That username is taken.", 409)
    row = _db("POST", "app_users", "", {"username": name, "pw_hash": _hash(password)})[0]
    return {"token": make_token(row["id"], name), "username": name}


def login(username: str, password: str) -> dict:
    name = _clean(username, password)
    rows = _db("GET", "app_users", f"username=eq.{name}&select=id,pw_hash")
    if not rows or not _check(password, rows[0]["pw_hash"]):
        raise AccountError("Wrong username or password.", 401)
    return {"token": make_token(rows[0]["id"], name), "username": name}


def list_levels(uid: str) -> list:
    return _db("GET", "app_levels", f"user_id=eq.{uid}&select=id,title,level,created_at&order=created_at.desc&limit=30")


def save_level(uid: str, title: str, level: dict) -> dict:
    if len(json.dumps(level)) > 100_000:
        raise AccountError("That level is too large to save.", 413)
    row = _db("POST", "app_levels", "", {"user_id": uid, "title": title[:60], "level": level})[0]
    return {"id": row["id"]}


def delete_level(uid: str, level_id: str) -> None:
    if not UUID_RE.match(level_id):
        raise AccountError("Bad level id.")
    _db("DELETE", "app_levels", f"id=eq.{level_id}&user_id=eq.{uid}")