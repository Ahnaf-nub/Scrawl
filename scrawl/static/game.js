/* Scrawl game engine.
 * Level coordinates are percentages (0-100) of the sketch photo, so the game
 * scales them onto a fixed 960x540 world. The Sim class has no DOM code, which
 * keeps the physics testable on its own.
 */
(function (root) {
  "use strict";

  const W = 960;
  const H = 540;

  const PLAYER = { w: 32, h: 44 };
  const ENEMY = { w: 36, h: 30 };
  const GRAVITY = 1900;
  const RUN = 230;
  const JUMP = 780;
  const COYOTE = 0.09;
  const JUMP_BUFFER = 0.11;
  const ENEMY_SPEED = 55;
  const STEP = 1 / 120;

  const px = (x) => (x / 100) * W;
  const py = (y) => (y / 100) * H;

  const SAMPLE_LEVEL = {
    title: "Sample level",
    player: { x: 6, y: 76 },
    goal: { x: 91, y: 14 },
    platforms: [
      { x: 0, y: 92, w: 100, h: 4 },
      { x: 38, y: 78, w: 16, h: 3 },
      { x: 60, y: 66, w: 14, h: 3 },
      { x: 40, y: 50, w: 14, h: 3 },
      { x: 62, y: 36, w: 12, h: 3 },
      { x: 80, y: 24, w: 18, h: 3 },
      { x: 8, y: 56, w: 20, h: 3 },
    ],
    spikes: [{ x: 26, y: 87.5, w: 5, h: 4.5 }],
    coins: [
      { x: 46, y: 72 },
      { x: 67, y: 60 },
      { x: 47, y: 44 },
      { x: 68, y: 30 },
      { x: 17, y: 50 },
    ],
    enemies: [{ x: 70, y: 88 }, { x: 88, y: 20 }],
  };

  function overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  class Sim {
    constructor() {
      this.input = { left: false, right: false, jump: false };
      this.load(SAMPLE_LEVEL);
    }

    load(level) {
      this.level = level;
      this.platforms = level.platforms.map((p) => ({
        x: px(p.x), y: py(p.y), w: Math.max(px(p.w), 24), h: Math.max(py(p.h), 14),
      }));
      this.spikes = level.spikes.map((s) => {
        const bottom = py(s.y) + py(s.h); // keep spikes sitting on their surface
        const h = Math.min(Math.max(py(s.h), 18), 48);
        return { x: px(s.x), y: bottom - h, w: Math.max(px(s.w), 22), h };
      });
      this.coins = level.coins.map((c) => ({ x: px(c.x), y: py(c.y), taken: false }));
      this.goal = { x: px(level.goal.x), y: py(level.goal.y) };
      this.spawn = { x: px(level.player.x) - PLAYER.w / 2, y: py(level.player.y) - PLAYER.h / 2 };
      this.enemyDefs = level.enemies.map((e) => ({ x: px(e.x) - ENEMY.w / 2, y: py(e.y) - ENEMY.h / 2 }));
      this.deaths = 0;
      this.restart();
    }

    restart() {
      this.coins.forEach((c) => (c.taken = false));
      this.enemies = this.enemyDefs.map((d) => ({
        x: d.x, y: d.y, w: ENEMY.w, h: ENEMY.h, vx: -ENEMY_SPEED, vy: 0, alive: true, onGround: false,
      }));
      this.time = 0;
      this.won = false;
      this.respawn(false);
    }

    respawn(countDeath) {
      if (countDeath) this.deaths += 1;
      this.player = {
        x: this.spawn.x, y: this.spawn.y, w: PLAYER.w, h: PLAYER.h,
        vx: 0, vy: 0, onGround: false, face: 1, coyote: 0, buffer: 0,
      };
      this.justDied = countDeath ? 0.5 : 0;
    }

    get coinsTaken() { return this.coins.filter((c) => c.taken).length; }

    /* Move a body and resolve collisions against solid platforms (x first, then y). */
    moveBody(b, dt) {
      b.onGround = false;
      b.x += b.vx * dt;
      for (const p of this.platforms) {
        if (overlap(b, p)) {
          if (b.vx > 0) b.x = p.x - b.w;
          else if (b.vx < 0) b.x = p.x + p.w;
          b.hitWall = true;
        }
      }
      b.y += b.vy * dt;
      for (const p of this.platforms) {
        if (overlap(b, p)) {
          if (b.vy > 0) { b.y = p.y - b.h; b.onGround = true; }
          else if (b.vy < 0) { b.y = p.y + p.h; }
          b.vy = 0;
        }
      }
      if (b.x < 0) { b.x = 0; b.hitWall = true; }
      if (b.x + b.w > W) { b.x = W - b.w; b.hitWall = true; }
    }

    groundAt(x, y) {
      return this.platforms.some((p) => x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h);
    }

    step(dt) {
      if (this.won) return;
      const p = this.player;
      this.time += dt;
      if (this.justDied > 0) this.justDied -= dt;

      // Horizontal input
      const dir = (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0);
      p.vx = dir * RUN;
      if (dir) p.face = dir;

      // Jump with coyote time and input buffering
      p.coyote = p.onGround ? COYOTE : p.coyote - dt;
      p.buffer = this.input.jump ? JUMP_BUFFER : p.buffer - dt;
      if (p.buffer > 0 && p.coyote > 0) {
        p.vy = -JUMP;
        p.coyote = 0;
        p.buffer = 0;
      }
      if (!this.input.jump && p.vy < -220) p.vy = -220; // release early = short hop

      p.vy = Math.min(p.vy + GRAVITY * dt, 1400);
      p.hitWall = false;
      this.moveBody(p, dt);

      // Enemies patrol, turn at walls and ledges
      for (const e of this.enemies) {
        if (!e.alive) continue;
        e.vy = Math.min(e.vy + GRAVITY * dt, 1400);
        e.hitWall = false;
        this.moveBody(e, dt);
        const ahead = e.x + (e.vx > 0 ? e.w + 3 : -3);
        if (e.hitWall || (e.onGround && !this.groundAt(ahead, e.y + e.h + 4))) {
          e.vx = -e.vx;
          e.x += e.vx > 0 ? 1 : -1;
        }
        if (e.y > H + 100) e.alive = false;
      }

      // Hazards
      if (p.y > H + 80) return this.respawn(true);
      for (const s of this.spikes) {
        const hit = { x: s.x + 10, y: s.y + 16, w: Math.max(s.w - 20, 4), h: s.h - 16 };
        if (overlap(p, hit)) return this.respawn(true);
      }
      for (const e of this.enemies) {
        if (!e.alive || !overlap(p, e)) continue;
        const stomp = p.vy > 0 && p.y + p.h - e.y < 18;
        if (stomp) { e.alive = false; p.vy = -440; }
        else return this.respawn(true);
      }

      // Pickups and goal
      for (const c of this.coins) {
        if (!c.taken && Math.hypot(c.x - (p.x + p.w / 2), c.y - (p.y + p.h / 2)) < 24) c.taken = true;
      }
      if (Math.hypot(this.goal.x - (p.x + p.w / 2), this.goal.y - (p.y + p.h / 2)) < 30) this.won = true;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Rendering: everything is drawn like marker on paper.                */
  /* ------------------------------------------------------------------ */

  const INK = "#16213a";
  const PAPER_FILL = "#e3ebf5";
  const RED = "#e5383b";
  const YELLOW = "#ffd43b";
  const TEAL = "#1b9aaa";

  // Deterministic wobble so outlines look hand-drawn without flickering.
  function wobble(seed, i, amount) {
    const v = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
    return (v - Math.floor(v) - 0.5) * 2 * amount;
  }

  function wobblyRect(ctx, r, seed) {
    const pts = [
      [r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h],
    ].map(([x, y], i) => [x + wobble(seed, i * 2, 1.8), y + wobble(seed, i * 2 + 1, 1.8)]);
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i <= 4; i++) {
      const a = pts[i - 1], b = pts[i % 4];
      ctx.quadraticCurveTo((a[0] + b[0]) / 2 + wobble(seed, 20 + i, 1.5), (a[1] + b[1]) / 2 + wobble(seed, 30 + i, 1.5), b[0], b[1]);
    }
    ctx.closePath();
  }

  function star(ctx, cx, cy, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 ? r * 0.45 : r;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
  }

  function draw(ctx, sim, t) {
    ctx.clearRect(0, 0, W, H);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;

    // Platforms
    sim.platforms.forEach((p, i) => {
      wobblyRect(ctx, p, i + 1);
      ctx.fillStyle = PAPER_FILL;
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = "rgba(22,33,58,.28)";
      ctx.lineWidth = 1.5;
      for (let x = p.x - p.h; x < p.x + p.w + p.h; x += 9) {
        ctx.beginPath(); ctx.moveTo(x, p.y + p.h); ctx.lineTo(x + p.h, p.y); ctx.stroke();
      }
      ctx.restore();
      wobblyRect(ctx, p, i + 1);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      ctx.stroke();
    });

    // Spikes
    sim.spikes.forEach((s, i) => {
      const n = Math.max(1, Math.round(s.w / 22));
      const tw = s.w / n;
      ctx.fillStyle = RED;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.5;
      for (let k = 0; k < n; k++) {
        ctx.beginPath();
        ctx.moveTo(s.x + k * tw + wobble(i, k, 1.2), s.y + s.h);
        ctx.lineTo(s.x + k * tw + tw / 2, s.y + wobble(i, k + 9, 1.5));
        ctx.lineTo(s.x + (k + 1) * tw + wobble(i, k + 4, 1.2), s.y + s.h);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    });

    // Coins
    sim.coins.forEach((c, i) => {
      if (c.taken) return;
      const bob = Math.sin(t * 3 + i) * 2.5;
      ctx.beginPath();
      ctx.arc(c.x, c.y + bob, 9, 0, Math.PI * 2);
      ctx.fillStyle = YELLOW;
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    });

    // Goal
    const pulse = 1 + Math.sin(t * 4) * 0.06;
    star(ctx, sim.goal.x, sim.goal.y, 22 * pulse);
    ctx.fillStyle = YELLOW;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Enemies
    sim.enemies.forEach((e, i) => {
      if (!e.alive) return;
      const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
      ctx.beginPath();
      for (let a = 0; a <= 16; a++) {
        const ang = (a / 16) * Math.PI * 2;
        const r = 1 + wobble(i, a, 0.1);
        const x = cx + Math.cos(ang) * (e.w / 2) * r, y = cy + Math.sin(ang) * (e.h / 2) * r;
        a ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = RED;
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.fillRect(cx - 8, cy - 6, 5, 5);
      ctx.fillRect(cx + 3, cy - 6, 5, 5);
      ctx.fillStyle = INK;
      ctx.fillRect(cx - 7 + (e.vx > 0 ? 2 : 0), cy - 5, 3, 3);
      ctx.fillRect(cx + 4 + (e.vx > 0 ? 2 : 0), cy - 5, 3, 3);
    });

    // Player (blinks after a respawn)
    const p = sim.player;
    if (!(sim.justDied > 0 && Math.floor(t * 14) % 2)) {
      ctx.beginPath();
      ctx.roundRect(p.x, p.y, p.w, p.h, 7);
      ctx.fillStyle = TEAL;
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      ctx.stroke();
      const ex = p.x + p.w / 2 + p.face * 4;
      ctx.fillStyle = "#fff";
      ctx.fillRect(ex - 6, p.y + 9, 6, 7);
      ctx.fillRect(ex + 2, p.y + 9, 6, 7);
      ctx.fillStyle = INK;
      ctx.fillRect(ex - 4 + p.face, p.y + 11, 3, 4);
      ctx.fillRect(ex + 4 + p.face, p.y + 11, 3, 4);
    }
  }

  class Game {
    constructor(canvas, hooks) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.hooks = hooks || {};
      this.sim = new Sim();
      this.acc = 0;
      this.last = 0;
      this.clock = 0;
      this.wasWon = false;
      this.resize();
      window.addEventListener("resize", () => this.resize());
      this.bindKeys();
      requestAnimationFrame((t) => this.frame(t));
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = W * dpr;
      this.canvas.height = H * dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    load(level) {
      const M = api.modes[level.game];
      const input = this.sim.input;
      this.sim = M ? new M() : this.sim instanceof Sim ? this.sim : new Sim();
      this.sim.input = input;
      this.sim.load(level);
      this.wasWon = false;
      this.hooks.onStart && this.hooks.onStart();
    }

    restart() {
      this.sim.restart();
      this.wasWon = false;
      this.hooks.onStart && this.hooks.onStart();
    }

    setKey(name, down) {
      this.sim.input[name] = down;
    }

    bindKeys() {
      const map = {
        ArrowLeft: "left",
        ArrowRight: "right",
        ArrowUp: "jump", ArrowDown: "down",
      };
      const handler = (down) => (e) => {
        const name = map[e.code];
        if (!name) return;
        if (document.activeElement && /INPUT|TEXTAREA|BUTTON/.test(document.activeElement.tagName) && e.code === "Space") return;
        e.preventDefault();
        this.setKey(name, down);
      };
      window.addEventListener("keydown", handler(true));
      window.addEventListener("keyup", handler(false));
      window.addEventListener("blur", () => { this.sim.input.left = this.sim.input.right = this.sim.input.jump = this.sim.input.down = false; });
    }

    frame(now) {
      const dt = Math.min((now - (this.last || now)) / 1000, 0.1);
      this.last = now;
      this.clock += dt;
      this.acc += dt;
      while (this.acc >= STEP) { this.sim.step(STEP); this.acc -= STEP; }
      if (this.sim.draw) this.sim.draw(this.ctx, this.clock); else draw(this.ctx, this.sim, this.clock);
      if (this.hooks.onFrame) this.hooks.onFrame(this.sim);
      if (this.sim.won && !this.wasWon) {
        this.wasWon = true;
        this.hooks.onWin && this.hooks.onWin(this.sim);
      }
      requestAnimationFrame((t) => this.frame(t));
    }
  }

  const api = { Sim, Game, SAMPLE_LEVEL, W, H, STEP, helpers: { wobblyRect, star, wobble, overlap }, modes: {}, SAMPLES: [SAMPLE_LEVEL],
    HINTS: { platformer: "Arrow keys or A and D to move, Space to jump. Land on a red blob to squash it." } };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Scrawl = api;
})(typeof window !== "undefined" ? window : globalThis);
