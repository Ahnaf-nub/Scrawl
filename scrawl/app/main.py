"""Scrawl: photograph a hand-drawn level and play it seconds later."""

from __future__ import annotations

import logging
from pathlib import Path

from dotenv import load_dotenv
import os

from fastapi import FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

load_dotenv()

from . import accounts, auth, gemma  # noqa: E402
from .level import load_level, sanitize, save_level  # noqa: E402

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("scrawl")

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "static"
MAX_UPLOAD_BYTES = 8 * 1024 * 1024
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}

app = FastAPI(title="Scrawl", version="1.0.0")


@app.get("/api/health")
def health():
    return {"ok": True, "model": gemma.model_name()}


@app.get("/api/config")
def config():
    """Tells the browser whether accounts are available. No secrets are exposed."""
    return {"accounts": accounts.enabled()}


class Creds(BaseModel):
    username: str
    password: str


class SaveBody(BaseModel):
    title: str | None = None
    level: dict


def _ip(request: Request) -> str:
    return request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (request.client.host if request.client else "anon")


def _user(authorization: str | None) -> str:
    bearer = authorization[7:] if authorization and authorization.lower().startswith("bearer ") else ""
    uid = accounts.verify_token(bearer) if bearer else None
    if not uid:
        raise HTTPException(401, "Sign in first.")
    return uid


def _run(fn, *args):
    try:
        return fn(*args)
    except accounts.AccountError as exc:
        raise HTTPException(exc.status, exc.message) from exc


def _guard(request: Request):
    if not accounts.enabled():
        raise HTTPException(503, "Accounts aren't set up on this server.")
    if not auth.allow("auth:" + _ip(request)):
        raise HTTPException(429, "Too many attempts. Wait a minute and try again.")


@app.post("/api/signup")
def signup(body: Creds, request: Request):
    _guard(request)
    return _run(accounts.signup, body.username, body.password)


@app.post("/api/login")
def login(body: Creds, request: Request):
    _guard(request)
    return _run(accounts.login, body.username, body.password)


@app.get("/api/levels")
def my_levels(authorization: str | None = Header(default=None)):
    return {"levels": _run(accounts.list_levels, _user(authorization))}


@app.post("/api/levels")
def save_my_level(body: SaveBody, authorization: str | None = Header(default=None)):
    return _run(accounts.save_level, _user(authorization), body.title or "My level", body.level)


@app.delete("/api/levels/{level_id}")
def delete_my_level(level_id: str, authorization: str | None = Header(default=None)):
    _run(accounts.delete_level, _user(authorization), level_id)
    return {"ok": True}

@app.post("/api/generate")
def generate(request: Request, file: UploadFile = File(...), authorization: str | None = Header(default=None)):
    """Sketch photo in, playable level JSON out."""
    bearer = authorization[7:] if authorization and authorization.lower().startswith("bearer ") else ""
    uid = auth.verify(bearer) if bearer else None
    if auth.require_auth() and not uid:
        raise HTTPException(401, "Sign in to generate levels.")
    ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (request.client.host if request.client else "anon")
    if not auth.allow(uid or ip):
        raise HTTPException(429, "Slow down a little and try again in a minute.")
    mime = (file.content_type or "").lower()
    if mime not in ALLOWED_TYPES:
        raise HTTPException(415, "Upload a JPG, PNG, or WebP photo of your sketch.")

    data = file.file.read(MAX_UPLOAD_BYTES + 1)
    if not data:
        raise HTTPException(400, "That file is empty.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "That photo is over 8 MB. Try a smaller one.")

    try:
        raw = gemma.read_sketch(data, mime)
    except RuntimeError as exc:  # missing API key
        raise HTTPException(500, str(exc)) from exc
    except ValueError as exc:  # Gemma answered, but not with a usable level
        raise HTTPException(422, "Gemma couldn't read a level from that photo. Draw with a thicker marker on plain paper and retake it in good light.") from exc
    except Exception as exc:
        log.exception("Gemma request failed")
        raise HTTPException(502, "Couldn't reach Gemma right now (rate limit or network). Wait a few seconds and try again.") from exc

    level = sanitize(raw)
    level_id = save_level(level)
    return {"id": level_id, "level": level}


@app.get("/api/levels/{level_id}")
def get_level(level_id: str):
    level = load_level(level_id)
    if level is None:
        raise HTTPException(404, "That level doesn't exist.")
    return {"id": level_id, "level": level}


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")


app.mount("/static", StaticFiles(directory=STATIC), name="static")
