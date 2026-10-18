/* Maze (top-down) and Race modes. Same interface as the platformer Sim:
 * input, load, restart, step(dt), draw(ctx, t), hud(), winText(), won, time. */
(function (root) {
  "use strict";
  const S = root.Scrawl;
  const { W, H } = S;
  const { wobblyRect, star, wobble, overlap } = S.helpers;
  const INK = "#16213a", PAPER = "#e3ebf5", RED = "#e5383b", YELLOW = "#ffd43b", TEAL = "#1b9aaa";
  const px = (x) => (x / 100) * W, py = (y) => (y / 100) * H;

  // Platformer gets the same HUD interface
  S.Sim.prototype.hud = function () { return ["Coins " + this.coinsTaken + "/" + this.coins.length, "Deaths " + this.deaths]; };
  S.Sim.prototype.winText = function () {
    return "Coins " + this.coinsTaken + " of " + this.coins.length + ", " + this.deaths + (this.deaths === 1 ? " death, " : " deaths, ") + this.time.toFixed(1) + " seconds.";
  };

  function blob(ctx, e, i) {
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
    ctx.beginPath();
    for (let a = 0; a <= 16; a++) {
      const r = 1 + wobble(i, a, 0.1), ang = (a / 16) * Math.PI * 2;
      const x = cx + Math.cos(ang) * (e.w / 2) * r, y = cy + Math.sin(ang) * (e.h / 2) * r;
      a ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath(); ctx.fillStyle = RED; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.fillRect(cx - 8, cy - 6, 5, 5); ctx.fillRect(cx + 3, cy - 6, 5, 5);
    ctx.fillStyle = INK; ctx.fillRect(cx - 6, cy - 5, 3, 3); ctx.fillRect(cx + 5, cy - 5, 3, 3);
  }

  /* ---------------- Maze ---------------- */
  class MazeSim {
    constructor() { this.input = { left: false, right: false, jump: false, up: false, down: false }; }
    load(level) {
      this.walls = level.walls.map((w) => ({ x: px(w.x), y: py(w.y), w: Math.max(px(w.w), 14), h: Math.max(py(w.h), 14) }));
      this.spawn = { x: px(level.player.x) - 11, y: py(level.player.y) - 11 };
      this.exit = { x: px(level.goal.x), y: py(level.goal.y) };
      this.keyDefs = level.keys.map((k) => ({ x: px(k.x), y: py(k.y) }));
      this.enemyDefs = level.enemies.map((e) => ({ x: px(e.x) - 12, y: py(e.y) - 12 }));
      this.deaths = 0;
      this.restart();
    }
    restart() {
      this.keys = this.keyDefs.map((k) => ({ ...k, taken: false }));
      this.enemies = this.enemyDefs.map((d, i) => ({ x: d.x, y: d.y, w: 24, h: 24, dx: i % 2 ? 0 : 1, dy: i % 2 ? 1 : 0 }));
      this.time = 0; this.won = false; this.respawn(false);
    }
    respawn(dead) { if (dead) this.deaths++; this.p = { x: this.spawn.x, y: this.spawn.y, w: 22, h: 22 }; }
    get unlocked() { return this.keys.every((k) => k.taken); }
    hud() { return ["Keys " + this.keys.filter((k) => k.taken).length + "/" + this.keys.length, "Deaths " + this.deaths]; }
    winText() { return this.deaths + (this.deaths === 1 ? " death, " : " deaths, ") + this.time.toFixed(1) + " seconds."; }
    move(b, dx, dy) {
      b.hit = false;
      b.x += dx;
      for (const w of this.walls) if (overlap(b, w)) { b.x = dx > 0 ? w.x - b.w : w.x + w.w; b.hit = true; }
      b.y += dy;
      for (const w of this.walls) if (overlap(b, w)) { b.y = dy > 0 ? w.y - b.h : w.y + w.h; b.hit = true; }
      const cx = Math.max(0, Math.min(W - b.w, b.x)), cy = Math.max(0, Math.min(H - b.h, b.y));
      if (cx !== b.x || cy !== b.y) b.hit = true;
      b.x = cx; b.y = cy;
    }
    step(dt) {
      if (this.won) return;
      this.time += dt;
      const i = this.input;
      let dx = (i.right ? 1 : 0) - (i.left ? 1 : 0), dy = (i.down ? 1 : 0) - (i.up || i.jump ? 1 : 0);
      const len = Math.hypot(dx, dy) || 1;
      this.move(this.p, (dx / len) * 210 * dt, (dy / len) * 210 * dt);
      for (const e of this.enemies) {
        this.move(e, e.dx * 70 * dt, e.dy * 70 * dt);
        if (e.hit) { e.dx = -e.dx; e.dy = -e.dy; }
        if (overlap(this.p, e)) return this.respawn(true);
      }
      for (const k of this.keys) if (!k.taken && Math.hypot(k.x - this.p.x - 11, k.y - this.p.y - 11) < 22) k.taken = true;
      if (this.unlocked && Math.hypot(this.exit.x - this.p.x - 11, this.exit.y - this.p.y - 11) < 28) this.won = true;
    }
    draw(ctx, t) {
      ctx.clearRect(0, 0, W, H); ctx.lineJoin = ctx.lineCap = "round";
      this.walls.forEach((w, i) => {
        wobblyRect(ctx, w, i + 1); ctx.fillStyle = PAPER; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
      });
      this.keys.forEach((k) => {
        if (k.taken) return;
        ctx.strokeStyle = INK; ctx.fillStyle = YELLOW; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(k.x - 4, k.y, 7, 0, 7); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(k.x + 3, k.y); ctx.lineTo(k.x + 14, k.y); ctx.moveTo(k.x + 11, k.y); ctx.lineTo(k.x + 11, k.y + 6); ctx.stroke();
      });
      star(ctx, this.exit.x, this.exit.y, 22 * (1 + Math.sin(t * 4) * (this.unlocked ? 0.06 : 0)));
      ctx.fillStyle = this.unlocked ? YELLOW : "#cfd3dd"; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
      this.enemies.forEach((e, i) => blob(ctx, e, i));
      const p = this.p;
      ctx.beginPath(); ctx.arc(p.x + 11, p.y + 11, 12, 0, 7); ctx.fillStyle = TEAL; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.fillRect(p.x + 5, p.y + 7, 5, 6); ctx.fillRect(p.x + 12, p.y + 7, 5, 6);
    }
  }

  /* ---------------- Race ---------------- */
  function smooth(pts) { // closed Catmull-Rom spline
    const out = [], n = pts.length;
    for (let i = 0; i < n; i++) {
      const [p0, p1, p2, p3] = [pts[(i + n - 1) % n], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]];
      for (let k = 0; k < 14; k++) {
        const t = k / 14, t2 = t * t, t3 = t2 * t, c = (a, b, c2, d) => 0.5 * (2 * b + (-a + c2) * t + (2 * a - 5 * b + 4 * c2 - d) * t2 + (-a + 3 * b - 3 * c2 + d) * t3);
        out.push({ x: c(p0.x, p1.x, p2.x, p3.x), y: c(p0.y, p1.y, p2.y, p3.y) });
      }
    }
    return out;
  }
  const LAPS = 3;

  class RaceSim {
    constructor() { this.input = { left: false, right: false, jump: false, up: false, down: false }; }
    load(level) {
      this.path = smooth(level.track.map((p) => ({ x: px(p.x), y: py(p.y) })));
      this.N = this.path.length; this.tw = 58; this.deaths = 0;
      this.restart();
    }
    restart() {
      const a = this.path[0], b = this.path[4];
      this.car = { x: a.x, y: a.y, ang: Math.atan2(b.y - a.y, b.x - a.x), v: 0 };
      this.lap = 0; this.cp = 1; this.time = 0; this.lapStart = 0; this.best = null; this.won = false; this.off = false;
    }
    hud() { return ["Lap " + Math.min(this.lap + 1, LAPS) + "/" + LAPS, "Time " + this.time.toFixed(1)]; }
    winText() { return LAPS + " laps in " + this.time.toFixed(1) + " seconds." + (this.best ? " Best lap " + this.best.toFixed(1) + "s." : ""); }
    near(x, y) {
      let bi = 0, bd = Infinity;
      for (let i = 0; i < this.N; i++) { const d = (this.path[i].x - x) ** 2 + (this.path[i].y - y) ** 2; if (d < bd) { bd = d; bi = i; } }
      return [bi, Math.sqrt(bd)];
    }
    step(dt) {
      if (this.won) return;
      this.time += dt;
      const c = this.car, i = this.input, maxV = this.off ? 110 : 330;
      c.v += ((i.up || i.jump ? 300 : 0) - (i.down ? 260 : 0)) * dt;
      c.v *= 1 - (this.off ? 1.8 : 0.5) * dt;
      c.v = Math.max(-90, Math.min(maxV, c.v));
      c.ang += ((i.right ? 1 : 0) - (i.left ? 1 : 0)) * 2.7 * Math.max(-1, Math.min(1, c.v / 120)) * dt;
      c.x = Math.max(8, Math.min(W - 8, c.x + Math.cos(c.ang) * c.v * dt));
      c.y = Math.max(8, Math.min(H - 8, c.y + Math.sin(c.ang) * c.v * dt));
      const [idx, dist] = this.near(c.x, c.y);
      this.off = dist > this.tw / 2;
      const cd = (a, b) => Math.min(Math.abs(a - b), this.N - Math.abs(a - b)), r = this.N / 24;
      if (this.cp < 8 && cd(idx, Math.round((this.cp * this.N) / 8) % this.N) < r) this.cp++;
      else if (this.cp === 8 && cd(idx, 0) < r) {
        const lt = this.time - this.lapStart; this.lapStart = this.time;
        this.best = this.best ? Math.min(this.best, lt) : lt;
        this.lap++; this.cp = 1;
        if (this.lap >= LAPS) this.won = true;
      }
    }
    draw(ctx) {
      ctx.clearRect(0, 0, W, H); ctx.lineJoin = ctx.lineCap = "round";
      const trace = () => { ctx.beginPath(); this.path.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); };
      trace(); ctx.strokeStyle = INK; ctx.lineWidth = this.tw + 8; ctx.stroke();
      trace(); ctx.strokeStyle = "#dfe5ee"; ctx.lineWidth = this.tw; ctx.stroke();
      trace(); ctx.strokeStyle = "rgba(22,33,58,.35)"; ctx.lineWidth = 2; ctx.setLineDash([14, 14]); ctx.stroke(); ctx.setLineDash([]);
      const a = this.path[0], b = this.path[1], ang = Math.atan2(b.y - a.y, b.x - a.x);
      ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(ang);
      for (let k = 0; k < 6; k++) for (let j = 0; j < 2; j++) { ctx.fillStyle = (k + j) % 2 ? INK : "#fff"; ctx.fillRect(-6 + j * 6, -this.tw / 2 + (k * this.tw) / 6, 6, this.tw / 6); }
      ctx.restore();
      const c = this.car;
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.ang);
      ctx.beginPath(); ctx.roundRect(-17, -9, 34, 18, 5); ctx.fillStyle = this.off ? "#8bb8bf" : TEAL; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.fillRect(2, -6, 7, 12);
      ctx.restore();
    }
  }

  S.modes.maze = MazeSim;
  S.modes.race = RaceSim;
  S.HINTS.maze = "Arrow keys or WASD to move. Grab every key to unlock the star, and dodge the red blobs.";
  S.HINTS.race = "Up or W to drive, left and right to steer, down or S to brake. Stay on the road and finish 3 laps.";
  S.SAMPLES.push(
    { game: "maze", title: "Sample maze", player: { x: 6, y: 10 }, goal: { x: 92, y: 90 },
      walls: [{ x: 0, y: 30, w: 70, h: 3 }, { x: 30, y: 60, w: 70, h: 3 }],
      keys: [{ x: 90, y: 15 }, { x: 10, y: 45 }, { x: 50, y: 80 }], enemies: [{ x: 50, y: 45 }, { x: 30, y: 80 }] },
    { game: "race", title: "Sample track", track: [{ x: 50, y: 15 }, { x: 78, y: 20 }, { x: 90, y: 45 }, { x: 80, y: 78 }, { x: 50, y: 88 }, { x: 22, y: 78 }, { x: 10, y: 48 }, { x: 22, y: 20 }] }
  );
})(typeof window !== "undefined" ? window : globalThis);
