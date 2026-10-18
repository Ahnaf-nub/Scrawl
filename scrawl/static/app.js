/* Scrawl front end: upload a photo, ask the backend (Gemma 4) for a level, play it. */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const els = {
    file: $("file"), drop: $("drop"), dropEmpty: $("dropEmpty"),
    thumbBox: $("thumbBox"), thumb: $("thumb"), seen: $("seen"),
    seenLabel: $("seenLabel"), toggleSeen: $("toggleSeen"),
    pick: $("pick"), sample: $("sample"), status: $("status"),
    title: $("title"), hudCoins: $("hudCoins"), hudDeaths: $("hudDeaths"),
    win: $("win"), winText: $("winText"), again: $("again"), another: $("another"),
    restart: $("restart"), share: $("share"), canvas: $("game"),
  };

  let busy = false;
  let sampleIdx = 0;
  let currentId = null;
  let currentLevel = null;
  let thumbUrl = null;

  /* ---------- Game ---------- */

  const game = new Scrawl.Game(els.canvas, {
    onStart() { els.win.hidden = true; },
    onFrame(sim) {
      const [coins, deaths] = sim.hud();
      if (els.hudCoins.textContent !== coins) els.hudCoins.textContent = coins;
      if (els.hudDeaths.textContent !== deaths) els.hudDeaths.textContent = deaths;
    },
    onWin(sim) {
      els.winText.textContent = sim.winText();
      els.win.hidden = false;
      els.again.focus({ preventScroll: true });
    },
  });

  function showLevel(level, id) {
    currentId = id || null;
    currentLevel = level;
    const saveBtn = $("save");
    if (saveBtn) saveBtn.disabled = !currentId;
    els.title.textContent = level.title || "My level";
    els.share.disabled = !currentId;
    game.load(level);
    $("hint").textContent = Scrawl.HINTS[level.game] || Scrawl.HINTS.platformer;
    els.canvas.focus({ preventScroll: true });
  }

  /* ---------- Status ---------- */

  function setStatus(text, kind) {
    els.status.textContent = text || "";
    els.status.className = "status" + (kind ? " " + kind : "");
  }

  function setBusy(on) {
    busy = on;
    els.pick.disabled = els.sample.disabled = on;
    els.drop.setAttribute("aria-busy", String(on));
  }

  /* ---------- Photo handling ---------- */

  // Shrink big phone photos before upload: faster, cheaper, and Gemma doesn't need 12 megapixels.
  async function prepare(file, maxSide) {
    let bitmap;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch (e) {
      bitmap = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("That file isn't an image the browser can open."));
        img.src = URL.createObjectURL(file);
      });
    }
    const w = bitmap.width || bitmap.naturalWidth;
    const h = bitmap.height || bitmap.naturalHeight;
    const scale = Math.min(1, maxSide / Math.max(w, h));
    const c = document.createElement("canvas");
    c.width = Math.round(w * scale);
    c.height = Math.round(h * scale);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bitmap, 0, 0, c.width, c.height);
    return new Promise((resolve, reject) =>
      c.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't process that photo."))), "image/jpeg", 0.88)
    );
  }

  function showThumb(blob) {
    if (thumbUrl) URL.revokeObjectURL(thumbUrl);
    thumbUrl = URL.createObjectURL(blob);
    els.thumb.src = thumbUrl;
    els.thumbBox.hidden = false;
    els.dropEmpty.hidden = true;
  }

  function drawSeen(level) {
    const NS = "http://www.w3.org/2000/svg";
    const svg = els.seen;
    svg.replaceChildren();
    const add = (tag, attrs) => {
      const n = document.createElementNS(NS, tag);
      for (const k in attrs) n.setAttribute(k, attrs[k]);
      n.setAttribute("vector-effect", "non-scaling-stroke");
      n.setAttribute("fill", attrs.fill || "none");
      n.setAttribute("stroke-width", "2.5");
      svg.appendChild(n);
    };
    const box = (r, color) => add("rect", { x: r.x, y: r.y, width: r.w, height: r.h, stroke: color });
    const dot = (p, color, s) => add("rect", { x: p.x - s / 2, y: p.y - s / 2, width: s, height: s, stroke: color, fill: color + "66" });
    (level.platforms || level.walls || []).forEach((p) => box(p, "#1b9aaa"));
    (level.spikes || []).forEach((p) => box(p, "#e5383b"));
    (level.coins || level.keys || []).forEach((p) => dot(p, "#e0a800", 2.6));
    (level.enemies || []).forEach((p) => dot(p, "#e5383b", 3.4));
    if (level.track) {
      const pl = document.createElementNS(NS, "polygon");
      pl.setAttribute("points", level.track.map((p) => p.x + "," + p.y).join(" "));
      pl.setAttribute("fill", "none"); pl.setAttribute("stroke", "#1b9aaa"); pl.setAttribute("stroke-width", "3");
      pl.setAttribute("vector-effect", "non-scaling-stroke");
      svg.appendChild(pl);
      dot(level.track[0], "#e0a800", 4.5);
    }
    if (level.player) dot(level.player, "#1b9aaa", 4);
    if (level.goal) dot(level.goal, "#e0a800", 4.5);
    els.seenLabel.hidden = false;
    svg.toggleAttribute("hidden", !els.toggleSeen.checked);
  }

  async function handleFile(file) {
    if (busy || !file) return;
    if (!file.type.startsWith("image/")) {
      setStatus("Choose an image file (JPG, PNG, or WebP).", "error");
      return;
    }
    setBusy(true);
    els.seen.setAttribute("hidden", "");
    const started = performance.now();
    const tick = setInterval(() => {
      const s = Math.round((performance.now() - started) / 1000);
      setStatus("Gemma 4 is reading your sketch... " + s + "s", "busy");
    }, 500);
    setStatus("Gemma 4 is reading your sketch...", "busy");

    try {
      const blob = await prepare(file, 1280);
      showThumb(blob);
      const body = new FormData();
      body.append("file", blob, "sketch.jpg");
      const headers = window.S2P && window.S2P.authHeader ? await window.S2P.authHeader() : {};
      const res = await fetch("/api/generate", { method: "POST", body, headers });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401 && window.S2P && window.S2P.openAuth) window.S2P.openAuth();
      if (!res.ok) throw new Error(data.detail || "Something went wrong (" + res.status + ").");

      showLevel(data.level, data.id);
      drawSeen(data.level);
      history.replaceState(null, "", "?l=" + data.id);
      const secs = ((performance.now() - started) / 1000).toFixed(1);
      setStatus("Ready in " + secs + "s. Gemma read a " + (data.level.game || "platformer") + " level.", "");
    } catch (err) {
      setStatus(err.message || "Couldn't read that sketch.", "error");
    } finally {
      clearInterval(tick);
      setBusy(false);
    }
  }

  /* ---------- Events ---------- */

  els.pick.addEventListener("click", () => els.file.click());
  els.another.addEventListener("click", () => els.file.click());
  els.file.addEventListener("change", () => {
    handleFile(els.file.files[0]);
    els.file.value = "";
  });

  els.sample.addEventListener("click", () => {
    sampleIdx = (sampleIdx + 1) % Scrawl.SAMPLES.length;
    showLevel(Scrawl.SAMPLES[sampleIdx], null);
    els.thumbBox.hidden = true;
    els.dropEmpty.hidden = false;
    els.seenLabel.hidden = true;
    els.seen.hidden = true;
    history.replaceState(null, "", location.pathname);
    setStatus("Sample level loaded.", "");
  });

  ["dragenter", "dragover"].forEach((t) =>
    els.drop.addEventListener(t, (e) => { e.preventDefault(); els.drop.classList.add("over"); })
  );
  ["dragleave", "drop"].forEach((t) =>
    els.drop.addEventListener(t, (e) => { e.preventDefault(); els.drop.classList.remove("over"); })
  );
  els.drop.addEventListener("drop", (e) => handleFile(e.dataTransfer.files[0]));

  window.addEventListener("paste", (e) => {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
    if (item) handleFile(item.getAsFile());
  });

  els.toggleSeen.addEventListener("change", () => { els.seen.toggleAttribute("hidden", !els.toggleSeen.checked); });
  els.restart.addEventListener("click", () => { game.restart(); els.canvas.focus({ preventScroll: true }); });
  els.again.addEventListener("click", () => { game.restart(); els.canvas.focus({ preventScroll: true }); });

  els.share.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      setStatus("Link copied. Anyone with it can play this level.", "");
    } catch (e) {
      window.prompt("Copy this link:", location.href);
    }
  });

  document.querySelectorAll(".touch button").forEach((btn) => {
    const key = btn.dataset.key;
    const on = (e) => { e.preventDefault(); game.setKey(key, true); };
    const off = (e) => { e.preventDefault(); game.setKey(key, false); };
    btn.addEventListener("pointerdown", on);
    ["pointerup", "pointercancel", "pointerleave"].forEach((t) => btn.addEventListener(t, off));
  });

  window.S2P = Object.assign(window.S2P || {}, {
    handleFile, showLevel, setStatus, getLevel: () => currentLevel,
  });

  /* ---------- Open a shared level (?l=abc123...) ---------- */

  const shared = new URLSearchParams(location.search).get("l");
  if (shared) {
    fetch("/api/levels/" + encodeURIComponent(shared))
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { showLevel(d.level, d.id); setStatus("Loaded a shared level.", ""); })
      .catch(() => setStatus("That shared level wasn't found, so here's the sample.", "error"));
  }
})();
