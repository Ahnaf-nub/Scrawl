"""Turn whatever Gemma says into a clean, safe, playable level.

Models drift: numbers go out of range, a goal goes missing, a "line" comes back
1px thick. Everything here exists so the game never crashes on a bad read.
All coordinates are percentages (0-100) of the sketch image.
"""

from __future__ import annotations

import json
import re
import secrets
from pathlib import Path

LEVEL_DIR = Path(__file__).resolve().parent.parent / "data" / "levels"

MAX_PLATFORMS = 60
MAX_SPIKES = 20
MAX_COINS = 30
MAX_ENEMIES = 12
MAX_KEYS = 8
MAX_TRACK = 40

MIN_PLATFORM_H = 2.5   # thin pencil lines still need to be standable
MIN_PLATFORM_W = 3.0
MIN_SPIKE = 2.5

_ID_RE = re.compile(r"^[a-f0-9]{10}$")


def extract_json(text: str) -> dict:
    """Pull the first JSON object out of a model reply (handles ``` fences)."""
    if not text:
        raise ValueError("Gemma returned an empty reply.")
    cleaned = re.sub(r"```(?:json)?", "", text).strip()
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("Gemma's reply did not contain a JSON object.")
    try:
        data = json.loads(cleaned[start : end + 1])
    except json.JSONDecodeError as exc:
        raise ValueError(f"Gemma's JSON could not be parsed: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError("Gemma's reply was not a JSON object.")
    return data


def _num(value, default=0.0) -> float:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return default
    if n != n or n in (float("inf"), float("-inf")):
        return default
    return n


def _clamp(n: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, n))


def _point(raw) -> dict | None:
    if not isinstance(raw, dict):
        return None
    return {"x": round(_clamp(_num(raw.get("x"))), 2), "y": round(_clamp(_num(raw.get("y"))), 2)}


def _rect(raw, min_w: float, min_h: float) -> dict | None:
    if not isinstance(raw, dict):
        return None
    w = max(_clamp(_num(raw.get("w"))), min_w)
    h = max(_clamp(_num(raw.get("h"))), min_h)
    x = _clamp(_num(raw.get("x")), 0, 100 - min(w, 100))
    y = _clamp(_num(raw.get("y")), 0, 100 - min(h, 100))
    w = min(w, 100 - x)
    h = min(h, 100 - y)
    return {"x": round(x, 2), "y": round(y, 2), "w": round(w, 2), "h": round(h, 2)}


def _list(raw, limit, fn) -> list:
    out = []
    if not isinstance(raw, list):
        return out
    for item in raw[:limit]:
        cleaned = fn(item)
        if cleaned:
            out.append(cleaned)
    return out


def _sanitize_platformer(raw: dict) -> dict:
    """Validate and repair a platformer level."""
    platforms = _list(raw.get("platforms"), MAX_PLATFORMS, lambda r: _rect(r, MIN_PLATFORM_W, MIN_PLATFORM_H))
    spikes = _list(raw.get("spikes"), MAX_SPIKES, lambda r: _rect(r, MIN_SPIKE, MIN_SPIKE))
    coins = _list(raw.get("coins"), MAX_COINS, _point)
    enemies = _list(raw.get("enemies"), MAX_ENEMIES, _point)

    if not platforms:
        # Nothing standable was read: give the player a floor so the level still loads.
        platforms = [{"x": 0.0, "y": 92.0, "w": 100.0, "h": 4.0}]

    player = _point(raw.get("player"))
    if player is None:
        first = min(platforms, key=lambda p: p["x"])
        player = {"x": round(first["x"] + min(first["w"] / 2, 6), 2), "y": round(max(first["y"] - 6, 2), 2)}

    goal = _point(raw.get("goal"))
    if goal is None:
        # No star found: put the goal on the platform that sits furthest right.
        last = max(platforms, key=lambda p: p["x"] + p["w"])
        goal = {"x": round(last["x"] + last["w"] / 2, 2), "y": round(max(last["y"] - 5, 2), 2)}
    def supported(pt):
        return any(p["x"] - 1 <= pt["x"] <= p["x"] + p["w"] + 1 and p["y"] >= pt["y"] - 1 for p in platforms)

    if not supported(player) or any(not supported(e) for e in enemies):
        # Sketches often skip the ground. Treat the bottom edge of the page as the floor
        # so nobody spawns in mid-air and falls forever.
        platforms.append({"x": 0.0, "y": 94.0, "w": 100.0, "h": 4.0})
    title = raw.get("title")
    title = title.strip()[:60] if isinstance(title, str) and title.strip() else "My level"

    return {
        "game": "platformer",
        "title": title,
        "player": player,
        "goal": goal,
        "platforms": platforms,
        "spikes": spikes,
        "coins": coins,
        "enemies": enemies,
    }


def _title(raw) -> str:
    t = raw.get("title")
    return t.strip()[:60] if isinstance(t, str) and t.strip() else "My level"


def _sanitize_maze(raw: dict) -> dict:
    walls = _list(raw.get("walls"), MAX_PLATFORMS, lambda r: _rect(r, 1.8, 1.8))
    player = _point(raw.get("player")) or {"x": 6.0, "y": 8.0}
    goal = _point(raw.get("goal")) or {"x": 92.0, "y": 90.0}
    return {
        "game": "maze", "title": _title(raw), "player": player, "goal": goal, "walls": walls,
        "keys": _list(raw.get("keys"), MAX_KEYS, _point),
        "enemies": _list(raw.get("enemies"), MAX_ENEMIES, _point),
    }


def _sanitize_race(raw: dict) -> dict:
    track = _list(raw.get("track"), MAX_TRACK, _point)
    track = [{"x": _clamp(p["x"], 4, 96), "y": _clamp(p["y"], 6, 94)} for p in track]
    if len(track) < 3:  # nothing usable: give a simple oval so the level still loads
        import math
        track = [{"x": round(50 + 38 * math.cos(a * math.pi / 6), 2), "y": round(50 + 34 * math.sin(a * math.pi / 6), 2)} for a in range(12)]
    return {"game": "race", "title": _title(raw), "track": track}


def sanitize(raw: dict) -> dict:
    """Validate and repair whatever Gemma returned. Always returns a playable level."""
    game = raw.get("game")
    if game not in ("platformer", "maze", "race"):
        game = "race" if "track" in raw else "maze" if "walls" in raw else "platformer"
    return {"platformer": _sanitize_platformer, "maze": _sanitize_maze, "race": _sanitize_race}[game](raw)


def save_level(level: dict) -> str:
    LEVEL_DIR.mkdir(parents=True, exist_ok=True)
    level_id = secrets.token_hex(5)
    (LEVEL_DIR / f"{level_id}.json").write_text(json.dumps(level), encoding="utf-8")
    return level_id


def load_level(level_id: str) -> dict | None:
    if not _ID_RE.match(level_id):
        return None
    path = LEVEL_DIR / f"{level_id}.json"
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))
