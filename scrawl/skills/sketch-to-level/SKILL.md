---
name: sketch-to-level
description: Convert a photo of a hand-drawn 2D platformer level into a validated JSON level file (platforms, spikes, coins, enemies, player start, goal). Use when the user shares a sketch, drawing, or whiteboard photo of a game level, or asks to turn a drawing into a playable level, or wants to check or repair a level JSON file.
license: MIT
compatibility: Needs an agent that can view images. The validator script needs Python 3.8+ and no other packages.
metadata:
  author: scrawl
  version: "1.0"
---

# Sketch to level

Turn a picture of a hand-drawn platformer level into a clean JSON file that the Scrawl engine (or any 2D engine) can load.

## When to use this skill

- The user attaches a photo or scan of a level they drew on paper or a whiteboard.
- The user asks you to make, fix, or validate a level JSON in the Scrawl format.

## Steps

1. Look at the image. Find the drawn symbols listed in `references/symbols.md`.
2. Write every position as a **percentage (0 to 100)** of the image width (x) and height (y). The origin is the top-left corner. Rectangles use their top-left corner plus a size. Points (coins, enemies, player, goal) use their center.
3. Produce one JSON object matching `references/level-schema.json`. Include exactly one `player` and one `goal`.
4. Save it to a file, then run the validator:

   ```bash
   python scripts/validate_level.py level.json --fix > level.fixed.json
   ```

   The script reports problems on stderr and writes a repaired, playable level to stdout.
5. Give the user the fixed file and a one-line summary of what you found (for example "6 platforms, 5 coins, 2 enemies, 1 spike").

**Scope:** this skill and its validator cover the **platformer** format. Maze and race levels are read by the Scrawl app itself (see `app/prompt.py`).

## Rules

- Report what is drawn. Do not invent objects or redesign the level.
- Ignore the paper edge, shadows, fingers, and handwriting that is not a symbol.
- If a shape is ambiguous, treat it as a platform.
- If you cannot find a player or goal, say so in your reply. Do not guess silently. The validator will place defaults, but the user should know.
- Keep within the limits: 40 platforms, 20 spikes, 30 coins, 12 enemies.

## Example output

```json
{
  "title": "My level",
  "player": {"x": 8, "y": 70},
  "goal": {"x": 92, "y": 20},
  "platforms": [{"x": 0, "y": 90, "w": 35, "h": 3}],
  "spikes": [{"x": 36, "y": 86, "w": 4, "h": 4}],
  "coins": [{"x": 50, "y": 62}],
  "enemies": [{"x": 20, "y": 84}]
}
```
