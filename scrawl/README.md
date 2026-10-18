# Scrawl

Draw a platformer level on paper, take a photo, and play it a few seconds later.

**Gemma 4** (an open-weight multimodal model, called through the Gemini API) looks at the photo and returns the level as structured JSON. A small canvas engine turns that JSON into a playable game drawn in the same marker-on-paper style as your sketch.

Built for Hacktoberfest Hack Day Dhaka. Targets both **Best Use of Gemma 4** and **Best Open-Source AI Project**.

```
photo of sketch  ->  FastAPI  ->  Gemma 4 (vision)  ->  level JSON  ->  sanitizer  ->  canvas game
```

## Why it's more than a toy

- The pipeline is general: **image in, validated structured data out**. The game is the first renderer; the same approach works for wireframes, floor plans, or board layouts.
- The sketch format is published as an open **Agent Skill** (`skills/sketch-to-level`), so any compatible agent can read level drawings and validate the output, with or without this app.
- The model's answer is never trusted blindly. `app/level.py` clamps, repairs, and caps everything, so a bad read still gives you a playable level.

## Quick start

You need Python 3.10+ and a free Gemini API key from <https://aistudio.google.com/apikey>.

```bash
git clone <your-repo-url> scrawl
cd scrawl

python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env               # then paste your key into .env
uvicorn app.main:app --reload
```

Open <http://127.0.0.1:8000>. The page starts with a playable sample level. Upload `samples/sample-sketch.jpg` to test the full pipeline, then try your own drawing.

### Models

Set `GEMMA_MODEL` in `.env`:

| Model | Notes |
|---|---|
| `gemma-4-31b-it` | Default. Better at messy handwriting. |
| `gemma-4-26b-a4b-it` | Lighter, usually faster. |

Gemma models on the free tier have low rate limits. If you see "Couldn't reach Gemma", wait a few seconds and retry.

## How to draw a level

Use a thick dark marker on plain paper, draw in **landscape**, and photograph it in good light.

| Draw | You get |
|---|---|
| Rectangle or thick line | Platform |
| Triangle | Spikes (touch them and you restart) |
| Small circle | Coin |
| Star | Goal (exactly one) |
| Smiley face or the letter S | Your start position (exactly one) |
| X or scribbled blob | Enemy that patrols (jump on its head to squash it) |

Controls: arrow keys or A/D to move, Space to jump. Touch buttons appear on phones.

## Game types

Scrawl reads three kinds of drawings. Gemma first decides which one it is looking at, then returns the matching data.

| Type | You draw | You play |
|---|---|---|
| Platformer (side view) | Platforms, spikes, coins, enemies, a star, a start | Run, jump, collect, reach the star |
| Maze (top-down) | Walls, keys, enemies, a star exit, a start | Collect every key, dodge enemies, reach the exit |
| Race (top-down) | One closed loop for the road and a start line | Drive three laps |

Each type is a small class in `static/modes.js` (a `load`, `step`, and `draw`), plus a sanitizer in `app/level.py` and a section of `app/prompt.py`. Adding a new type means adding those three pieces, which makes it a good first contribution.

## Features

- Photo upload, drag and drop, or paste from the clipboard
- Photos are shrunk in the browser before upload for speed
- **Show what Gemma saw**: overlays the detected objects on your photo
- Shareable links: every generated level gets a short id (`/?l=<id>`)
- Built-in sample level that works with no API key, handy as a demo fallback
- Coyote time and jump buffering, so the platforming feels fair

## Project layout

```
app/
  main.py      FastAPI routes: /api/generate, /api/levels/{id}, /api/health
  gemma.py     Calls Gemma 4 through the Gemini API (google-genai SDK)
  prompt.py    The prompt that teaches Gemma the sketch grammar
  level.py     JSON extraction, validation, repair, and level storage
static/
  index.html, style.css
  app.js       Upload flow, "what Gemma saw" overlay, sharing
  game.js      Physics (Sim) and marker-style rendering (Game)
skills/
  sketch-to-level/   Agent Skill: SKILL.md, schema, validator script
samples/sample-sketch.jpg
tests/test_level.py
```

## Agent Skill

`skills/sketch-to-level/` follows the Agent Skills format (a folder with a `SKILL.md` that has `name` and `description` frontmatter, plus `references/` and `scripts/`). It teaches an agent how to turn a level drawing into the same JSON this app uses, and includes a dependency-free validator:

```bash
python skills/sketch-to-level/scripts/validate_level.py level.json --fix
```

Check the current spec at <https://agentskills.io> and make sure the folder still passes any validator you want to cite in your submission.

## Tests

```bash
python -m unittest discover -s tests          # level sanitizer
```

## Deploy on DigitalOcean

**Droplet (simplest):**

```bash
docker build -t scrawl .
docker run -d -p 80:8080 -e GEMINI_API_KEY=your-key -e GEMMA_MODEL=gemma-4-31b-it scrawl
```

**App Platform:** create an app from your GitHub repo. It detects the `Dockerfile`. Add `GEMINI_API_KEY` as an encrypted environment variable. Saved levels live on the container's disk, so they reset on redeploy, which is fine for a demo.

Never commit `.env` or your API key.

## Troubleshooting

| Problem | Fix |
|---|---|
| "GEMINI_API_KEY is not set" | Create `.env` from `.env.example` and restart the server. |
| "Couldn't reach Gemma" | Rate limit or network. Wait a few seconds, retry, or switch `GEMMA_MODEL`. |
| "Gemma couldn't read a level" | Thicker marker, plain paper, better light, landscape photo. |
| Objects land in the wrong place | Crop the photo tightly to the paper. Coordinates are relative to the whole image. |
| Model name rejected | Check the current list at <https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api>. |

## License

MIT. See `LICENSE`.

## Input options

Upload a photo, **Take photo** with the live camera (needs HTTPS or localhost), or **Draw on screen** with a mouse or finger. All three go through the same Gemma pipeline.

## Supabase (login and saved levels)

1. Create a project at <https://supabase.com>.
2. SQL Editor: paste and run `supabase/schema.sql`.
3. Authentication > Providers > Email: turn off "Confirm email" for the hackathon so sign-up works instantly.
4. Project Settings > API: copy the Project URL and the `anon` public key into `.env` as `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
5. Optional: `REQUIRE_AUTH=1` makes sign-in mandatory before generating, so strangers can't burn your Gemini quota.

Levels are saved with row-level security: each user can only read, write, and delete their own. Never put the `service_role` key anywhere in this project.

## Deploy on DigitalOcean App Platform

1. Push the repo to GitHub (public, MIT).
2. DigitalOcean > Create > App Platform > pick the repo. It detects the `Dockerfile`; set the HTTP port to `8080`.
3. Add environment variables: `GEMINI_API_KEY`, `GEMMA_MODEL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `REQUIRE_AUTH`. Mark the key as encrypted.
4. Deploy. App Platform serves HTTPS, which the camera needs.
