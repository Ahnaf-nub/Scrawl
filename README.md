# Scrawl: Don't throw your doodles away. Play them.

We all scribble when we zone out in class, in meetings, on desks and in the margins of notebooks. Then the page gets thrown away or often gets left out.

**Scrawl turns that doodle into a game.** Photograph a sketch, upload one, or draw on screen. **Gemma 4** reads it, works out what kind of game you drew, and you can play it seconds later. No code, no engine, no level editor. Just a pen.

**Live demo: https://scrawl-plum.vercel.app/**

> Built for Hacktoberfest Hack Day Dhaka.

## The problem

Everyone has game ideas. They show up as doodles in the margins of notebooks, on desks, on the back of a worksheet. But turning an idea into something you can actually play usually means learning code or a game engine first, so the doodle stays a doodle and ends up in the bin.

Scrawl lets the drawing itself be the game. If you can draw it, you can play it.

## What it does

1. You give it a drawing: upload a photo, take one with your camera, or sketch on screen.
2. Gemma 4 (via the Gemini API) looks at the image, decides whether it's a **platformer**, **maze** or **race track**, and returns the level as JSON.
3. Scrawl double-checks what Gemma found and fixes any gaps, so the level always works.
4. A custom canvas game engine plays it, drawn in a hand-sketched marker style.
5. Every level gets a share link. Signed-in users can save their levels.

## Three game modes, one drawing guide

| You draw | Mode | Rules |
|---|---|---|
| Side view with ground and floating platforms | **Platformer** | Run, jump, collect coins, stomp enemies, avoid spikes, reach the star |
| Top-down walls with corridors | **Maze** | Collect every key to unlock the exit star, dodge patrolling enemies |
| One closed loop with a start line | **Race** | Drive 3 laps, stay on the road. Drawing an arrow sets the direction, otherwise clockwise |

**Symbols Gemma understands**

| Symbol | Meaning |
|---|---|
| Rectangle or thick line | Platform or wall |
| Triangle or zigzag | Spikes (send you back to the start) |
| Small circle | Coin |
| Star | Goal or exit |
| Smiley face or the letter S | Player start |
| X or scribbled blob | Enemy (patrols back and forth) |
| Small key shape or the letter K | Key (maze) |

Tips: use a thick dark marker on plain paper, draw in landscape, and photograph it in good light.

## Features

- Photo upload, drag and drop, paste from clipboard, live camera capture, or draw directly on screen
- "Show what Gemma saw" overlay that draws the detected objects over your photo
- Automatic game-type detection (platformer, maze or race)
- Hand-drawn look: wobbly outlines, marker colours, paper grid
- Shareable level links (`?l=<id>`)
- Optional accounts to save, replay and delete your levels
- Touch controls for phones and tablets
- Photos are shrunk in the browser before upload, so it's fast on mobile data

## How it works

```
Photo / camera / on-screen sketch
        |
        v
  Browser resizes to max 1280px  ->  POST /api/generate
        |
        v
  FastAPI backend (rate limited, 8 MB cap, JPG/PNG/WebP only)
        |
        v
  Gemma 4 on the Gemini API  ->  raw level JSON
        |
        v
  Safety check (fix gaps and mistakes)  ->  clean level JSON
        |
        v
  Saved to disk, id returned  ->  canvas game engine plays it
```

### Why Gemma 4

One multimodal prompt does everything: it classifies the drawing type and extracts every object with coordinates as percentages of the image. The prompt (`prompt.py`) teaches the model the symbol key above and the JSON format for each mode. The default model is `gemma-4-26b-a4b-it`, with thinking set to minimal for speed and a plain fallback config if the SDK rejects that setting.

### Always playable, even with a messy doodle

Doodles are messy, and AI doesn't read them perfectly every time. Before the game starts, Scrawl checks the level and fixes common problems:

- Thin pencil lines are made thick enough to stand on
- If your character or an enemy would float in mid-air, a floor is added underneath
- If you forgot to draw a star, the goal is placed on the furthest platform
- If a race track can't be read, a simple oval track is used instead
- Anything that lands outside the page is moved back inside

So a rough sketch still gives you a level you can play, never an error screen.

## Tech stack

- **AI:** Gemma 4 through the Gemini API (`google-genai` SDK)
- **Backend:** Python, FastAPI, Pydantic
- **Frontend:** vanilla JavaScript, HTML5 Canvas, no framework, no build step
- **Accounts and saved levels:** Supabase (optional), accessed over its REST API with the standard library
- **Auth:** scrypt password hashing, HMAC-signed session tokens (14-day expiry), per-user and per-IP rate limiting

## Run it locally

You need Python 3.10+ and a Gemini API key from https://aistudio.google.com/apikey.

```bash
git clone https://github.com/Ahnaf-nub/Scrawl.git
cd Scrawl
pip install fastapi uvicorn python-multipart python-dotenv google-genai pydantic
cp .env.example .env   # then add your GEMINI_API_KEY
uvicorn app.main:app --reload
```

Open http://localhost:8000. Camera capture needs HTTPS or localhost.

### Configuration (`.env`)

| Variable | Required | What it does |
|---|---|---|
| `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) | Yes | Key for the Gemini API |
| `GEMMA_MODEL` | No | Defaults to `gemma-4-26b-a4b-it` |
| `SUPABASE_URL` | No | Turns on accounts and saved levels |
| `SUPABASE_SERVICE_KEY` | No | Server-side key for Supabase (never sent to the browser) |
| `SESSION_SECRET` | No | Signs login tokens. Falls back to the Supabase key |
| `REQUIRE_AUTH` | No | Set to `1` to require sign-in to generate levels |
| `RATE_LIMIT_PER_MIN` | No | Requests per minute per user or IP. Default 8 |

Without Supabase the app still works fully. The sign-in and save buttons simply stay hidden. To enable accounts, create a Supabase project and run `supabase/schema.sql` in its SQL editor.

## API

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/generate` | Upload a sketch photo, get a level back |
| GET | `/api/levels/{id}` | Load a shared level |
| POST | `/api/signup`, `/api/login` | Create an account or sign in |
| GET, POST | `/api/levels` | List or save your levels (auth required) |
| DELETE | `/api/levels/{id}` | Delete one of your levels (auth required) |
| GET | `/api/config`, `/api/health` | Feature flags and model name |

## Controls

Arrow keys to move. Up to jump in the platformer and to move up in the maze. In the race, Up drives, Left and Right steer, Down brakes. Touch buttons appear automatically on touch devices.

## License

MIT. See `LICENSE`.
