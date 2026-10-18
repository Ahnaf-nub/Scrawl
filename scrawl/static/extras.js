/* Camera capture, draw-on-screen, and Supabase login + saved levels. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const S = () => window.S2P;
  const open = (d) => (d.showModal ? d.showModal() : d.setAttribute("open", ""));
  document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));

  /* ---------- Live camera ---------- */
  let stream = null;
  $("cam").addEventListener("click", async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } } });
      $("camVideo").srcObject = stream;
      open($("camDlg"));
    } catch (e) {
      S().setStatus("Camera unavailable (" + (e.message || e) + "). It needs HTTPS or localhost, plus permission.", "error");
    }
  });
  $("camDlg").addEventListener("close", () => {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
  });
  $("snap").addEventListener("click", () => {
    const v = $("camVideo");
    if (!v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0);
    c.toBlob((b) => {
      $("camDlg").close();
      S().handleFile(new File([b], "camera.jpg", { type: "image/jpeg" }));
    }, "image/jpeg", 0.9);
  });

  /* ---------- Draw on screen ---------- */
  const pad = $("pad"), pc = pad.getContext("2d");
  let down = false, erase = false, last = null;
  const clearPad = () => { pc.fillStyle = "#fff"; pc.fillRect(0, 0, pad.width, pad.height); };
  const pos = (e) => {
    const r = pad.getBoundingClientRect();
    return [((e.clientX - r.left) * pad.width) / r.width, ((e.clientY - r.top) * pad.height) / r.height];
  };
  function stroke(a, b) {
    pc.strokeStyle = erase ? "#fff" : "#111";
    pc.lineWidth = erase ? 34 : 9;
    pc.lineCap = pc.lineJoin = "round";
    pc.beginPath(); pc.moveTo(a[0], a[1]); pc.lineTo(b[0], b[1]); pc.stroke();
  }
  clearPad();
  pad.addEventListener("pointerdown", (e) => { down = true; last = pos(e); pad.setPointerCapture(e.pointerId); stroke(last, last); });
  pad.addEventListener("pointermove", (e) => { if (!down) return; const p = pos(e); stroke(last, p); last = p; });
  ["pointerup", "pointercancel"].forEach((t) => pad.addEventListener(t, () => { down = false; }));
  $("draw").addEventListener("click", () => open($("drawDlg")));
  $("pen").addEventListener("click", () => { erase = false; });
  $("eraser").addEventListener("click", () => { erase = true; });
  $("clearPad").addEventListener("click", clearPad);
  $("usePad").addEventListener("click", () => {
    pad.toBlob((b) => {
      $("drawDlg").close();
      S().handleFile(new File([b], "drawing.png", { type: "image/png" }));
    }, "image/png");
  });

   /* ---------- Accounts: username + password, saved levels ---------- */
  let session = null; // { token, username }
  let accountsOn = false;
  const STORE = "scrawl-session";

  S().openAuth = () => { if (accountsOn) open($("authDlg")); };
  S().authHeader = async () => (session ? { Authorization: "Bearer " + session.token } : {});

  function setSession(s) {
    session = s;
    try { s ? localStorage.setItem(STORE, JSON.stringify(s)) : localStorage.removeItem(STORE); } catch (e) { /* private mode */ }
    $("who").textContent = s ? s.username : "";
    $("signin").hidden = !!s;
    $("signout").hidden = !s;
    $("myLevels").hidden = !s;
  }

  async function api(path, method, body) {
    const headers = Object.assign({ "Content-Type": "application/json" }, await S().authHeader());
    const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && session && !path.startsWith("/api/login")) setSession(null);
      throw new Error(data.detail || "Something went wrong (" + res.status + ").");
    }
    return data;
  }

  fetch("/api/config").then((r) => r.json()).then((cfg) => {
    if (!cfg.accounts) { $("save").hidden = true; return; }
    accountsOn = true;
    $("authbar").hidden = false;
    try { const saved = JSON.parse(localStorage.getItem(STORE)); if (saved && saved.token) setSession(saved); } catch (e) { /* ignore */ }
  }).catch(() => { $("save").hidden = true; });

  async function doAuth(kind) {
    const username = $("email").value.trim(), password = $("password").value;
    $("authMsg").textContent = "Working...";
    try {
      setSession(await api(kind === "up" ? "/api/signup" : "/api/login", "POST", { username, password }));
      $("authMsg").textContent = "";
      $("authDlg").close();
    } catch (e) { $("authMsg").textContent = e.message; }
  }
  $("authForm").addEventListener("submit", (e) => { e.preventDefault(); doAuth("in"); });
  $("signup").addEventListener("click", () => doAuth("up"));
  $("signin").addEventListener("click", () => open($("authDlg")));
  $("signout").addEventListener("click", () => setSession(null));

  $("save").addEventListener("click", async () => {
    if (!session) return open($("authDlg"));
    const lvl = S().getLevel();
    try {
      await api("/api/levels", "POST", { title: lvl.title, level: lvl });
      S().setStatus("Saved to your levels.", "");
    } catch (e) { S().setStatus("Save failed: " + e.message, "error"); }
  });

  $("myLevels").addEventListener("click", async () => {
    const ul = $("levelList");
    ul.replaceChildren();
    try {
      const { levels } = await api("/api/levels", "GET");
      if (!levels.length) { const li = document.createElement("li"); li.textContent = "Nothing saved yet."; ul.appendChild(li); }
      levels.forEach((row) => {
        const li = document.createElement("li");
        const name = document.createElement("span");
        name.textContent = (row.title || "Untitled") + " (" + new Date(row.created_at).toLocaleDateString() + ")";
        const play = document.createElement("button");
        play.className = "btn"; play.type = "button"; play.textContent = "Play";
        play.addEventListener("click", () => { $("levelsDlg").close(); S().showLevel(row.level, null); });
        const del = document.createElement("button");
        del.className = "btn"; del.type = "button"; del.textContent = "Delete";
        del.addEventListener("click", async () => { try { await api("/api/levels/" + row.id, "DELETE"); li.remove(); } catch (e) { S().setStatus(e.message, "error"); } });
        li.append(name, play, del);
        ul.appendChild(li);
      });
      open($("levelsDlg"));
    } catch (e) { S().setStatus("Couldn't load levels: " + e.message, "error"); }
  });
})();