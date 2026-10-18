#!/usr/bin/env python3
"""Validate (and optionally repair) a Scrawl level JSON file.

Usage:
    python validate_level.py level.json            # report problems, exit 1 if any
    python validate_level.py level.json --fix      # report on stderr, print repaired JSON on stdout
    cat level.json | python validate_level.py -    # read from stdin

Standard library only.
"""
import json
import sys

LIMITS = {"platforms": 40, "spikes": 20, "coins": 30, "enemies": 12}
MIN_PLATFORM = (3.0, 2.5)   # width, height in percent
MIN_SPIKE = 2.5


def num(v, default=0.0):
    try:
        n = float(v)
    except (TypeError, ValueError):
        return default
    return default if n != n or n in (float("inf"), float("-inf")) else n


def clamp(n, lo=0.0, hi=100.0):
    return max(lo, min(hi, n))


def check(level, problems):
    if not isinstance(level, dict):
        problems.append("Top level must be a JSON object.")
        return
    for key in ("player", "goal"):
        p = level.get(key)
        if not isinstance(p, dict) or "x" not in p or "y" not in p:
            problems.append(f"Missing or malformed '{key}' (needs x and y).")
    plats = level.get("platforms")
    if not isinstance(plats, list) or not plats:
        problems.append("'platforms' must be a non-empty list.")
    for key, limit in LIMITS.items():
        items = level.get(key, [])
        if isinstance(items, list) and len(items) > limit:
            problems.append(f"'{key}' has {len(items)} items; the limit is {limit}.")
    for key in ("platforms", "spikes", "coins", "enemies", "player", "goal"):
        items = level.get(key)
        items = items if isinstance(items, list) else ([items] if isinstance(items, dict) else [])
        for i, it in enumerate(items):
            if not isinstance(it, dict):
                problems.append(f"{key}[{i}] is not an object.")
                continue
            for field in ("x", "y", "w", "h"):
                if field in it and not 0 <= num(it[field], -1) <= 100:
                    problems.append(f"{key}[{i}].{field} = {it[field]!r} is outside 0-100.")


def fix(level):
    level = level if isinstance(level, dict) else {}

    def point(r):
        return {"x": round(clamp(num(r.get("x"))), 2), "y": round(clamp(num(r.get("y"))), 2)} if isinstance(r, dict) else None

    def rect(r, mw, mh):
        if not isinstance(r, dict):
            return None
        w, h = max(clamp(num(r.get("w"))), mw), max(clamp(num(r.get("h"))), mh)
        x, y = clamp(num(r.get("x")), 0, 100 - min(w, 100)), clamp(num(r.get("y")), 0, 100 - min(h, 100))
        return {"x": round(x, 2), "y": round(y, 2), "w": round(min(w, 100 - x), 2), "h": round(min(h, 100 - y), 2)}

    def many(key, fn):
        raw = level.get(key)
        out = [fn(r) for r in (raw if isinstance(raw, list) else [])[: LIMITS[key]]]
        return [o for o in out if o]

    platforms = many("platforms", lambda r: rect(r, *MIN_PLATFORM)) or [{"x": 0.0, "y": 92.0, "w": 100.0, "h": 4.0}]
    player = point(level.get("player"))
    if not player:
        first = min(platforms, key=lambda p: p["x"])
        player = {"x": round(first["x"] + min(first["w"] / 2, 6), 2), "y": round(max(first["y"] - 6, 2), 2)}
    goal = point(level.get("goal"))
    if not goal:
        last = max(platforms, key=lambda p: p["x"] + p["w"])
        goal = {"x": round(last["x"] + last["w"] / 2, 2), "y": round(max(last["y"] - 5, 2), 2)}
    title = level.get("title")
    return {
        "title": title.strip()[:60] if isinstance(title, str) and title.strip() else "My level",
        "player": player,
        "goal": goal,
        "platforms": platforms,
        "spikes": many("spikes", lambda r: rect(r, MIN_SPIKE, MIN_SPIKE)),
        "coins": many("coins", point),
        "enemies": many("enemies", point),
    }


def main(argv):
    args = [a for a in argv[1:] if not a.startswith("--") or a == "-"]
    if not args:
        print(__doc__, file=sys.stderr)
        return 2
    try:
        text = sys.stdin.read() if args[0] == "-" else open(args[0], encoding="utf-8").read()
        level = json.loads(text)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"Could not read level: {exc}", file=sys.stderr)
        return 2

    problems = []
    check(level, problems)
    for p in problems:
        print(f"- {p}", file=sys.stderr)

    if "--fix" in argv:
        json.dump(fix(level), sys.stdout, indent=2)
        print()
        return 0
    if problems:
        return 1
    print("Level looks good.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
