/**
 * Mickey Miles — frontend app (Retro Arcade redesign).
 * Full-bleed pixel scenes with HUD chrome: Status (live scene), Log (dimmed
 * scene + day cards), Trail (scrollable pixel map of the whole PCT), and
 * Friends (avatar setup + powerups + bleachers). Polls GET /api/state.
 */

const API_BASE = (typeof window !== "undefined" && window.MICKEY_API_BASE) || "";
const POLL_INTERVAL_MS = 4000;
const PROFILE_KEY = "mickeymiles.profile.v1";

const FOOD_LABELS = {
  cheerio: "Cheerio",
  pumpkin_seed: "pumpkin seed",
  blueberry: "blueberry",
  chili: "chili pepper"
};

// ---------------------------------------------------------------- state

let S = null;               // latest server state
let connection = "loading"; // loading | live | offline
let profile = loadProfile();
let lastEventId = null;
let pendingPick = null;     // powerup type selected but not yet packed

function loadProfile() {
  try {
    const p = JSON.parse(localStorage.getItem(PROFILE_KEY));
    return p && p.id && p.name ? p : null;
  } catch { return null; }
}

function saveProfile(p) {
  profile = p;
  if (p) localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  else localStorage.removeItem(PROFILE_KEY);
}

// ---------------------------------------------------------------- api

async function api(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    ...opts
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status, data });
  return data;
}

async function poll() {
  try {
    const qs = new URLSearchParams();
    if (profile) qs.set("userId", profile.id);
    if (lastEventId !== null) qs.set("since", String(lastEventId));
    S = await api(`/api/state?${qs}`);
    connection = "live";

    if (lastEventId === null) {
      lastEventId = S.latestEventId; // baseline: don't replay old toasts
    } else {
      for (const ev of S.events || []) showEventToast(ev);
      lastEventId = Math.max(lastEventId, S.latestEventId);
    }
    if (profile && S.you === null) ensureRegistered();
  } catch {
    connection = "offline";
  }
  renderAll();
}

let reregisterInFlight = false;
// Keep the visitor logged in across server storage resets (Render's free tier
// has an ephemeral disk): if the backend no longer knows our stored user, we
// silently re-register the same name + avatar and adopt the fresh id. We never
// drop the local profile just because the server forgot it.
async function ensureRegistered() {
  if (!profile || reregisterInFlight) return;
  reregisterInFlight = true;
  try {
    const r = await api("/api/users", {
      method: "POST",
      body: JSON.stringify({ name: profile.name, avatar: profile.avatar })
    });
    saveProfile(r.user);
  } catch { /* backend unreachable — keep the local profile and retry next poll */ }
  reregisterInFlight = false;
}

// ---------------------------------------------------------------- toasts

function toast(msg, cls = "") {
  const wrap = document.getElementById("toasts");
  const el = document.createElement("div");
  el.className = `toast ${cls}`;
  el.textContent = msg;
  wrap.appendChild(el);
  requestAnimationFrame(() => el.classList.add("is-in"));
  setTimeout(() => {
    el.classList.remove("is-in");
    setTimeout(() => el.remove(), 400);
  }, 4200);
}

function showEventToast(ev) {
  if (ev.type === "love") toast(`Thanks for the love, ${ev.name}!`, "toast-love");
  else if (ev.type === "eat") toast(`Thanks for the ${FOOD_LABELS[ev.item] || ev.item}, ${ev.name}!`, "toast-eat");
  else if (ev.type === "gift") toast(`${ev.name} packed a ${FOOD_LABELS[ev.item] || ev.item} for Mickey!`, "toast-gift");
}

// ---------------------------------------------------------------- helpers

function landmarkProgress(totalMiles) {
  let idx = 0;
  for (let i = 0; i < LANDMARKS.length; i++) {
    if (totalMiles >= LANDMARKS[i].mile) idx = i;
  }
  return idx;
}

function currentLandmark() {
  return LANDMARKS[landmarkProgress(S ? S.journey.totalMiles : 0)];
}

function isNight() {
  return S ? !S.trail.isDaytime : false;
}

function hamsterState() {
  return S ? S.hamster.state : "refuel";
}

function fmtDate(iso) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtMinutes(min) {
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  return h ? `${h}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;
}

function fmtCountdown(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ---------------------------------------------------------------- screens

function activateScreen(name) {
  document.querySelectorAll(".dock-button").forEach((b) => b.classList.toggle("is-active", b.dataset.screen === name));
  document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("is-active", s.id === `screen-${name}`));
  if (name === "trail") {
    ensureTrailMap();
    scrollTrailToCurrent();
  }
}

// ================================================================= STATUS

const stage = {
  canvas: null, ctx: null,
  bg: null, bgKey: "",
  logCanvas: null, logKey: ""
};
const anim = {
  groundScroll: 0, runFrame: 0, runFrameAt: 0,
  nibbleAt: 0, nibble: 0, lastT: 0
};

// Inner scene area of the fixed 390x844 phone (minus the 14px bezel).
const SCENE_W = 460;
const SCENE_H = Math.round(SCENE_W * (844 - 28) / (390 - 28)); // ~1037, keeps aspect

function sizeCanvases() {
  for (const id of ["status-scene-canvas", "log-scene-canvas"]) {
    const c = document.getElementById(id);
    c.width = SCENE_W;
    c.height = SCENE_H;
  }
  stage.bgKey = "";
  stage.logKey = "";
}

/**
 * Uniformly scale the fixed-size phone to fit the viewport, so it always
 * looks like it will on a real phone — just letterboxed with a plain color
 * on larger screens. Never enlarges past 1:1.
 */
function fitPhone() {
  const fit = document.getElementById("phone-fit");
  const phone = document.getElementById("phone");
  const margin = 8;
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const k = Math.min((vw - margin) / 390, (vh - margin) / 844, 1);
  phone.style.transform = `scale(${k})`;
  fit.style.width = `${Math.round(390 * k)}px`;
  fit.style.height = `${Math.round(844 * k)}px`;
}

function ensureBackground() {
  const lm = currentLandmark();
  const key = `${lm.name}|${isNight()}|${stage.canvas.height}`;
  if (stage.bgKey !== key) {
    stage.bg = document.createElement("canvas");
    stage.bg.width = stage.canvas.width;
    stage.bg.height = stage.canvas.height;
    renderScene(stage.bg, lm, isNight());
    stage.bgKey = key;
  }
}

function ensureLogBackground() {
  const c = document.getElementById("log-scene-canvas");
  const lm = currentLandmark();
  const key = `${lm.name}|${isNight()}|${c.height}`;
  if (stage.logKey !== key) {
    renderScene(c, lm, isNight());
    const ctx = c.getContext("2d");
    ctx.fillStyle = "rgba(8,10,6,0.62)";
    ctx.fillRect(0, 0, c.width, c.height);
    stage.logKey = key;
  }
}

function tick(t) {
  const dt = Math.min(80, t - (anim.lastT || t));
  anim.lastT = t;
  if (document.getElementById("screen-status").classList.contains("is-active")) {
    drawStage(t, dt);
  }
  requestAnimationFrame(tick);
}

/** Drifting grass tufts + pebbles along the trail band while running. */
function drawScrollingGround(ctx, w, trailY, scroll, k) {
  const tile = 26 * k;
  const off = scroll % tile;
  for (let x = -off; x < w + tile; x += tile) {
    px(ctx, x, trailY + 2 * k, 3 * k, 1.5 * k, "rgba(232,217,176,0.55)");
    px(ctx, x + 9 * k, trailY - 1 * k, 4 * k, 1.5 * k, "rgba(120,150,90,0.6)");
    px(ctx, x + 17 * k, trailY + 4 * k, 2 * k, 1.5 * k, "rgba(232,217,176,0.4)");
  }
}

function drawStage(t, dt) {
  if (!stage.ctx || typeof LANDMARKS === "undefined") return;
  ensureBackground();
  const ctx = stage.ctx;
  const w = stage.canvas.width;
  const h = stage.canvas.height;
  ctx.drawImage(stage.bg, 0, 0);

  const state = hamsterState();
  const loved = S && S.hamster.lovedUntil > Date.now();
  const trailY = Math.round(h * 0.86);
  const k = w / 256;
  const scale = Math.max(4, Math.round(k * 4));

  if (state === "running") {
    // Mickey holds a fixed, centered spot; the ground scrolls under him.
    const mph = S ? S.tracker.speedMph : 0;
    const scrollPxPerSec = (26 + Math.min(8, mph) * 16) * k;
    anim.groundScroll += (scrollPxPerSec * dt) / 1000;
    drawScrollingGround(ctx, w, trailY, anim.groundScroll, k);

    const frameMs = Math.max(80, 235 - mph * 22);
    if (t - anim.runFrameAt > frameMs) { anim.runFrame++; anim.runFrameAt = t; }
    const runScale = scale + 1;                       // a little bigger
    const runX = Math.round(w / 2 - 14 * runScale);   // centered (body is 28 wide)
    const y = trailY - 17 * runScale + Math.round(3 * k);
    drawMickeyRun(ctx, runX, y, runScale, anim.runFrame);
    for (let i = 0; i < 3; i++) {
      const dOff = (anim.groundScroll + i * 9 * k) % (30 * k);
      px(ctx, runX - 2 * k - dOff, trailY + 3 * k - i * k, (3 - i) * k, 2 * k, "rgba(220,205,170,0.45)");
    }
    if (loved) drawHearts(ctx, runX + 24 * runScale, y - 8 * k, t);
  } else if (state === "refuel") {
    const mx = Math.round(w * 0.4 - 10 * scale);
    const my = trailY - 19 * scale + Math.round(8 * k);
    if (t - anim.nibbleAt > 420) { anim.nibble = 1 - anim.nibble; anim.nibbleAt = t; }
    const eating = S && S.hamster.eating;
    const item = eating ? eating.type : null; // null during the brief gap between snacks
    drawBackpackProp(ctx, Math.round(w * 0.68), trailY + Math.round(6 * k), scale * 0.75);
    drawMickeySit(ctx, mx, my, scale, { item, nibble: anim.nibble, smile: loved });
    if (loved) drawHearts(ctx, mx + 21 * scale, my - 6 * k, t);
  } else {
    // sleeping inside the A-frame triangle tent
    const tw = Math.round(w * 0.6);
    const th = Math.round(tw * 0.82);
    const tx = Math.round((w - tw) / 2);
    const ty = trailY - th + Math.round(6 * k);
    const door = drawTent(ctx, tx, ty, tw, th);
    const sc = Math.max(3, Math.floor(door.doorW / 22)); // fit the 24-wide sleeper
    ctx.save();
    ctx.beginPath(); // clip to the triangular doorway so he's tucked inside
    ctx.moveTo(door.cx, door.doorY);
    ctx.lineTo(door.doorX, door.baseY - 1);
    ctx.lineTo(door.doorX + door.doorW, door.baseY - 1);
    ctx.closePath();
    ctx.clip();
    drawMickeySleep(ctx, door.cx - 12 * sc, door.baseY - 10 * sc - 1, sc);
    ctx.restore();
    drawZzz(ctx, door.cx + 6 * k, ty + 4 * k, t, k); // rising just off the tent peak
    if (loved) drawHearts(ctx, tx + tw + 6 * k, ty + 16 * k, t);
  }
}

function drawZzz(ctx, x, y, t, k) {
  for (let i = 0; i < 3; i++) {
    const phase = ((t / 1000 + i * 0.66) % 2) / 2;
    const zy = y - phase * 26 * k;
    const alpha = phase < 0.15 ? phase / 0.15 : 1 - Math.max(0, phase - 0.5) * 2;
    if (alpha <= 0) continue;
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    const zx = x + i * 9 * k + Math.sin(phase * 6.28) * 3 * k;
    const sizes = [1, 1.4, 1.8];
    const s = sizes[i] * k;
    px(ctx, zx, zy, 5 * s, s, "#e8e4cf");
    px(ctx, zx + 3 * s, zy + s, 1.6 * s, s, "#e8e4cf");
    px(ctx, zx + 1.5 * s, zy + 2 * s, 1.6 * s, s, "#e8e4cf");
    px(ctx, zx, zy + 3 * s, 5 * s, s, "#e8e4cf");
    ctx.globalAlpha = 1;
  }
}

function drawHearts(ctx, x, y, t) {
  for (let i = 0; i < 2; i++) {
    const phase = (t / 900 + i * 0.5) % 1;
    const hy = y - phase * 24;
    ctx.globalAlpha = 1 - phase;
    const hx = x + i * 14 + Math.sin(phase * 6) * 3;
    px(ctx, hx, hy + 2, 3, 3, "#e26a7a"); px(ctx, hx + 4, hy + 2, 3, 3, "#e26a7a");
    px(ctx, hx, hy + 4, 7, 3, "#e26a7a"); px(ctx, hx + 1, hy + 7, 5, 2, "#e26a7a");
    px(ctx, hx + 2, hy + 9, 3, 2, "#e26a7a");
    ctx.globalAlpha = 1;
  }
}

function renderStatus() {
  // The chip only ever reads LIVE (device reporting now) or UPDATING (waiting
  // on the tracker / backend). No "napping" or "offline" wording.
  const chip = document.getElementById("mode-chip");
  const isLive = connection === "live" && S && S.tracker.online;
  chip.classList.toggle("is-updating", !isLive);
  chip.textContent = isLive ? "● LIVE" : "● UPDATING";

  if (!S || !S.today || !S.journey) return;

  document.getElementById("scene-location").textContent = currentLandmark().name.toUpperCase();
  document.getElementById("speed-value").textContent = S.tracker.speedMph.toFixed(1);
  document.getElementById("today-miles").textContent = S.today.miles.toFixed(2);

  renderBoostChip();

  const state = hamsterState();
  document.getElementById("sleep-note").hidden = state !== "sleeping";
  const loveBtn = document.getElementById("love-button");
  loveBtn.disabled = !(profile && state !== "running" && connection === "live");
  loveBtn.title = !profile
    ? "Make a profile in FRIENDS first"
    : state === "running" ? "Wait until Mickey is resting" : "Send Mickey some love";

  renderBackpack();
}

function renderBoostChip() {
  const chip = document.getElementById("boost-banner");
  if (S && S.boost) {
    chip.hidden = false;
    document.getElementById("boost-text").textContent =
      `${S.boost.multiplier}X · ${fmtCountdown(S.boost.endsAt - Date.now())} · ${S.boost.byName.toUpperCase()}`;
  } else {
    chip.hidden = true;
  }
}

function renderBackpack() {
  const grid = document.getElementById("backpack-grid");
  grid.innerHTML = "";
  const items = S ? S.backpack : [];
  const slots = S ? S.backpackSlots : 6;
  for (let i = 0; i < slots; i++) {
    const cell = document.createElement("div");
    cell.className = "backpack-slot";
    const item = items[i];
    if (item) {
      const cv = document.createElement("canvas");
      cv.width = 32; cv.height = 32;
      drawFood(cv.getContext("2d"), item.type, 2, 2, 3.5);
      cell.appendChild(cv);
      const tag = document.createElement("span");
      tag.textContent = item.byName;
      cell.appendChild(tag);
      cell.title = `${FOOD_LABELS[item.type]} from ${item.byName}`;
    } else {
      cell.classList.add("is-empty");
    }
    grid.appendChild(cell);
  }
}

async function sendLove() {
  if (!profile) return;
  try {
    const r = await api("/api/love", { method: "POST", body: JSON.stringify({ userId: profile.id }) });
    if (S) S.hamster.lovedUntil = r.lovedUntil;
  } catch (e) {
    toast(e.message, "toast-warn");
  }
}

// ================================================================= LOG

function renderLog() {
  if (!S) return;
  ensureLogBackground();

  const trueMiles = S.dailyLog.reduce((sum, r) => sum + r.baseMiles, 0);
  document.getElementById("stat-total").textContent = S.journey.totalMiles.toFixed(1);
  document.getElementById("stat-true").textContent = trueMiles.toFixed(1);
  document.getElementById("stat-left").textContent = S.journey.milesLeft.toFixed(0);

  const list = document.getElementById("log-list");
  list.innerHTML = "";
  const rows = S.dailyLog;
  if (!rows.length) {
    const li = document.createElement("li");
    li.className = "log-empty";
    li.textContent = "No days logged yet — Mickey's first mile will show up here.";
    list.appendChild(li);
    return;
  }

  // milestone crossings per day (ascending cumulative effective miles)
  const crossings = new Map();
  let cum = 0;
  for (const row of rows) {
    const before = cum;
    cum += row.miles;
    const hit = LANDMARKS.filter((lm) => lm.mile > before && lm.mile <= cum && lm.mile > 0);
    if (hit.length) crossings.set(row.date, hit);
  }

  [...rows].sort((a, b) => b.date.localeCompare(a.date)).forEach((row) => {
    const li = document.createElement("li");
    li.className = "log-card";
    const hasBonus = row.bonusMiles > 0.05;
    li.innerHTML = `
      <div class="main-row">
        <span class="date">${fmtDate(row.date)}</span>
        <span class="mi">${row.miles.toFixed(1)} MI</span>
        <span class="meta">${fmtMinutes(row.wheelMinutes)}</span>
        <span class="meta">${row.avgSpeedMph.toFixed(1)} mph</span>
      </div>
      ${hasBonus ? `
      <div class="bonus-row">
        <span class="actual">actual ${row.baseMiles.toFixed(1)} mi</span>
        <span class="bonus">+${row.bonusMiles.toFixed(1)} mi powerup</span>
      </div>` : ""}
    `;
    list.appendChild(li);

    for (const lm of crossings.get(row.date) || []) {
      const bar = document.createElement("li");
      bar.className = "milestone-bar";
      bar.textContent = `🏔 Reached ${lm.name} — mile ${lm.mile.toLocaleString()}`;
      list.appendChild(bar);
    }
  });
}

// ================================================================= TRAIL

const trail = { drawnKey: "", nodes: [] };

function trailCoastEdge(w, y) {
  return w * 0.22 + Math.sin(y / 40) * 10 + Math.sin(y / 17) * 5 + hashNoise(Math.floor(y / 6)) * 6;
}

function ensureTrailMap() {
  if (typeof LANDMARKS === "undefined") return;
  const el = document.getElementById("trail-map-canvas");
  const curIdx = landmarkProgress(S ? S.journey.totalMiles : 0);
  const key = `${curIdx}|${el.width}x${el.height}`;
  if (trail.drawnKey === key) return;

  const ctx = el.getContext("2d");
  const w = el.width;
  const h = el.height;
  const n = LANDMARKS.length;
  const topMargin = 70;
  const rowH = (h - topMargin - 70) / (n - 1);
  const fakeS = { ctx, c: (c) => c };

  // ocean + wobbling coastline + speckled land
  ctx.fillStyle = "#3f6f8f";
  ctx.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y++) {
    const leftEdge = trailCoastEdge(w, y);
    ctx.fillStyle = "#5e7a4a";
    ctx.fillRect(leftEdge, y, w - leftEdge, 1);
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fillRect(leftEdge, y, 2, 1);
  }
  for (let ty = 0; ty < h; ty += 9) {
    for (let tx = w * 0.22; tx < w; tx += 12) {
      const nz = hashNoise(Math.floor(tx) * 13 + Math.floor(ty) * 31 + 5);
      if (nz > 0.62) px(ctx, tx + (nz * 8 - 4), ty + hashNoise(tx + ty) * 6, 4, 3, "#527048");
      else if (nz < 0.12) px(ctx, tx + nz * 8, ty + hashNoise(tx * 2 + ty) * 6, 3, 2, "#6d8a58");
    }
  }

  // node positions: organic noise wander, bottom = Mexico
  const nodes = [];
  let bx = w * 0.42;
  for (let i = 0; i < n; i++) {
    const y = topMargin + (n - 1 - i) * rowH;
    bx += (hashNoise(i * 31 + 7) - 0.5) * 46;
    bx = Math.max(w * 0.3, Math.min(w * 0.6, bx));
    nodes.push({ x: bx, y });
  }
  trail.nodes = nodes;

  // state border lines (CA/OR ~1700, OR/WA ~2150) from the land edge east.
  // Placed at the MIDPOINT between the border landmark's row and the next one
  // north, so the dashed line never runs through any landmark's label text.
  const borderY = (mile) => {
    let idx = 0;
    for (let i = 0; i < n; i++) if (LANDMARKS[i].mile <= mile) idx = i;
    return topMargin + (n - 1 - idx) * rowH - rowH / 2;
  };
  [borderY(1700), borderY(2150)].forEach((y) => {
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 7]);
    ctx.beginPath();
    ctx.moveTo(trailCoastEdge(w, y), y);
    ctx.lineTo(w, y);
    ctx.stroke();
    ctx.restore();
  });

  // the trail: smooth dashed curve through every landmark
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#e8d9b0";
  ctx.lineWidth = 4;
  ctx.setLineDash([9, 6]);
  ctx.beginPath();
  ctx.moveTo(nodes[0].x, nodes[0].y);
  for (let i = 1; i < nodes.length - 1; i++) {
    const midX = (nodes[i].x + nodes[i + 1].x) / 2;
    const midY = (nodes[i].y + nodes[i + 1].y) / 2;
    ctx.quadraticCurveTo(nodes[i].x, nodes[i].y, midX, midY);
  }
  ctx.lineTo(nodes[n - 1].x, nodes[n - 1].y);
  ctx.stroke();
  ctx.restore();

  // Decide each label's side FIRST (alternating, flipping to fit, kept fully
  // on-screen). Scenery then goes on the OPPOSITE side so it never overlaps.
  const margin = 10;
  const gap = 16;
  const labels = [];
  for (let i = 0; i < n; i++) {
    const lm = LANDMARKS[i];
    const { x } = nodes[i];
    const nameFont = (lm.name.length > 22 ? "16px" : "20px") + " 'VT323', monospace";
    const mileFont = "16px 'VT323', monospace";
    ctx.font = nameFont;
    const nameW = ctx.measureText(lm.name).width;
    ctx.font = mileFont;
    const mileW = ctx.measureText("mile " + lm.mile).width;
    const maxW = Math.max(nameW, mileW);

    let right = i % 2 === 0;
    const fitsRight = x + gap + maxW <= w - margin;
    const fitsLeft = x - gap - maxW >= margin;
    if (right && !fitsRight && fitsLeft) right = false;
    else if (!right && !fitsLeft && fitsRight) right = true;
    else if (!fitsRight && !fitsLeft) right = x < w / 2;

    const anchorX = right
      ? Math.max(margin, Math.min(x + gap, w - margin - maxW))
      : Math.min(w - margin, Math.max(x - gap, margin + maxW));
    labels.push({ right, anchorX, nameFont, mileFont });
  }

  // scenery from each landmark's own scene config, on the side away from its label
  const mountainKinds = ["mountains", "peak", "jagged", "volcano", "cones3", "ridge", "domes", "spires", "craterRim"];
  const treeMotifs = ["pines", "firs", "oaks", "joshua"];
  for (let i = 0; i < n; i++) {
    const lm = LANDMARKS[i];
    const { x, y } = nodes[i];
    const dir = labels[i].right ? -1 : 1; // opposite side of the label
    const mColor = (lm.far.colors && lm.far.colors[0]) || "#6d7d62";
    if (mountainKinds.includes(lm.far.kind)) {
      farCone(fakeS, x + dir * (30 + hashNoise(i * 5) * 14), y + 8, 13 + hashNoise(i * 9) * 6, 22 + hashNoise(i * 3) * 12, mColor, hashNoise(i * 11) > 0.6 ? "#e8ecec" : null, hashNoise(i * 13) > 0.5);
    }
    if (lm.motifs.some(([type]) => treeMotifs.includes(type))) {
      pine(fakeS, x + dir * (16 + hashNoise(i * 7) * 8), y + 6, 16 + hashNoise(i * 4) * 6, "#3e5c38");
      pine(fakeS, x + dir * (24 + hashNoise(i * 17) * 6), y + 9, 12 + hashNoise(i * 6) * 5, "#345031");
    }
  }

  // pins + labels above scenery
  ctx.textBaseline = "alphabetic";
  for (let i = 0; i < n; i++) {
    const lm = LANDMARKS[i];
    const { x, y } = nodes[i];
    const isCur = i === curIdx;
    drawPixelPin(ctx, x - 10, y - 22, isCur ? 2.4 : 1.9, isCur ? "#e26a7a" : "#d9be79");
    ctx.textAlign = labels[i].right ? "left" : "right";
    ctx.font = labels[i].nameFont;
    ctx.fillStyle = isCur ? "#fff59a" : "#f2f1e7";
    ctx.fillText(lm.name, labels[i].anchorX, y + 5);
    ctx.font = labels[i].mileFont;
    ctx.fillStyle = "rgba(231,226,207,0.75)";
    ctx.fillText("mile " + lm.mile, labels[i].anchorX, y + 22);
  }
  ctx.textAlign = "left";

  ctx.font = "13px 'Press Start 2P', monospace";
  ctx.fillStyle = "#ffd166";
  ctx.fillText("CANADA", 16, 38);
  ctx.fillText("MEXICO", 16, h - 22);

  trail.drawnKey = key;
}

function scrollTrailToCurrent() {
  const wrap = document.getElementById("trail-map-wrap");
  const el = document.getElementById("trail-map-canvas");
  const curIdx = landmarkProgress(S ? S.journey.totalMiles : 0);
  const node = trail.nodes[curIdx];
  if (!node) return;
  // Defer to the next frame so the (just-shown) screen has laid out and the
  // scroll container reports a real scrollHeight/clientHeight.
  requestAnimationFrame(() => {
    const rendered = wrap.scrollHeight; // rendered map height (canvas fills width)
    const target = (node.y / el.height) * rendered - wrap.clientHeight / 2;
    wrap.scrollTop = Math.max(0, target);
  });
}

// ================================================================= FRIENDS

const builder = { hair: 0, skin: 0, outfit: 0 };

function renderFriends() {
  const setup = document.getElementById("friends-setup");
  const home = document.getElementById("friends-home");
  if (!profile) {
    setup.hidden = false;
    home.hidden = true;
    drawBuilderPreview();
    return;
  }
  setup.hidden = true;
  home.hidden = false;

  document.getElementById("friends-hello").textContent = `Hey, ${profile.name}!`;
  // Always BK (short brown hair, 2nd-lightest skin, teal tee) + a half-size
  // refueling Mickey beside him — this is the host greeting, not the visitor.
  const meCv = document.getElementById("friends-me-canvas");
  const mctx = meCv.getContext("2d");
  mctx.clearRect(0, 0, meCv.width, meCv.height);
  drawAvatar(mctx, 2, 2, 4, BK_AVATAR);
  // integer scale keeps the sprite crisp (no gap-lines); no food in his hands
  drawMickeySit(mctx, 50, 24, 2, { smile: true });

  renderPowerupCards();
  renderBleachers();
}

const BK_AVATAR = { hair: 0, skin: 1, outfit: 5 };

function renderPowerupCards() {
  const you = S ? S.you : null;
  const wrap = document.getElementById("powerup-cards");
  wrap.innerHTML = "";
  const list = S ? S.powerups : [];
  const redeemed = you && you.redeemedToday;
  const gifted = you && you.giftedToday;

  for (const p of list) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "powerup-card";
    const picked = redeemed ? p.type === redeemed : pendingPick === p.type;
    if (picked) card.classList.add("is-picked");
    if (redeemed && p.type !== redeemed) card.disabled = true;
    const cv = document.createElement("canvas");
    cv.width = 32; cv.height = 32;
    drawFood(cv.getContext("2d"), p.type, 0, 0, 4);
    card.appendChild(cv);
    const name = document.createElement("span");
    name.className = "pu-name";
    name.textContent = p.label.toUpperCase();
    card.appendChild(name);
    const mult = document.createElement("span");
    mult.className = "pu-mult";
    mult.textContent = `${p.multiplier}x Miles`;
    card.appendChild(mult);
    const dur = document.createElement("span");
    dur.className = "pu-dur";
    dur.textContent = `${p.durationMin} min`;
    card.appendChild(dur);
    if (!redeemed) {
      card.addEventListener("click", () => {
        pendingPick = p.type;
        renderFriends();
      });
    }
    wrap.appendChild(card);
  }

  const packBtn = document.getElementById("pack-button");
  const giftDone = document.getElementById("gift-done");
  giftDone.hidden = !gifted;
  const full = S && S.backpack.length >= S.backpackSlots;
  if (gifted) {
    packBtn.disabled = true;
    packBtn.textContent = "PACKED FOR TODAY ✓";
  } else if (full) {
    packBtn.disabled = true;
    packBtn.textContent = "Backpack full — try later";
  } else {
    packBtn.disabled = !(redeemed || pendingPick);
    packBtn.textContent = "Pack it in Mickey's Backpack";
  }
}

async function packPowerup() {
  if (!profile || !S) return;
  const you = S.you;
  try {
    if (!(you && you.redeemedToday)) {
      if (!pendingPick) return;
      await api("/api/powerups/redeem", { method: "POST", body: JSON.stringify({ userId: profile.id, type: pendingPick }) });
      pendingPick = null;
    }
    await api("/api/backpack/gift", { method: "POST", body: JSON.stringify({ userId: profile.id }) });
    await poll();
  } catch (e) {
    toast(e.message, "toast-warn");
    await poll();
  }
}

function renderBleachers() {
  const row = document.getElementById("bleachers-row");
  row.innerHTML = "";
  const folks = S ? S.bleachers : [];
  if (!folks.length) {
    row.innerHTML = '<p class="bleachers-empty">Nobody else is watching right now.</p>';
    return;
  }
  for (const f of folks) {
    const seat = document.createElement("div");
    seat.className = "bleacher-seat";
    const cv = document.createElement("canvas");
    cv.width = 52; cv.height = 66;
    drawAvatar(cv.getContext("2d"), 2, 2, 4, f.avatar);
    seat.appendChild(cv);
    const tag = document.createElement("span");
    tag.textContent = f.name;
    seat.appendChild(tag);
    row.appendChild(seat);
  }
}

// ---- avatar builder (shuffler rows) ----

function initBuilder() {
  document.querySelectorAll(".shuffler .arrow").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.key;
      builder[key] = (builder[key] + Number(btn.dataset.dir) + 6) % 6;
      drawBuilderPreview();
    });
  });
  document.getElementById("builder-save").addEventListener("click", createProfile);
}

function drawBuilderPreview() {
  const cv = document.getElementById("builder-preview");
  const ctx = cv.getContext("2d");
  ctx.clearRect(0, 0, cv.width, cv.height);
  drawAvatar(ctx, 10, 8, 13, builder);
}

async function createProfile() {
  const name = document.getElementById("builder-name").value.trim();
  if (!name) { toast("Give yourself a trail name first!", "toast-warn"); return; }
  try {
    const r = await api("/api/users", {
      method: "POST",
      body: JSON.stringify({ name, avatar: { hair: builder.hair, skin: builder.skin, outfit: builder.outfit } })
    });
    saveProfile(r.user);
    toast(`Welcome to the trail crew, ${r.user.name}!`);
    await poll();
  } catch (e) {
    toast(e.message, "toast-warn");
  }
}

// ================================================================= shell

function safeRender(fn) {
  try { fn(); } catch (e) { console.error(e); }
}

// Each section renders independently: a failure in one (e.g. an unexpected
// API shape) must never blank the others.
function renderAll() {
  safeRender(renderStatus);
  safeRender(renderLog);
  safeRender(ensureTrailMap);
  safeRender(renderFriends);
  safeRender(updateDevBar);
}

function updateDevBar() {
  const bar = document.getElementById("dev-bar");
  if (!bar) return;
  const show = S && S.devTools && !new URLSearchParams(location.search).has("nodev");
  bar.hidden = !show;
}

function initIcons() {
  drawPixelHeart(document.getElementById("icon-heart").getContext("2d"), 30, 1);
  drawBackpackProp(document.getElementById("icon-pack").getContext("2d"), 3, 29, 2);
  drawPixelPin(document.getElementById("pin-icon").getContext("2d"), 1, 0, 1.9, "#d9be79");
  drawPixelBolt(document.getElementById("boost-bolt").getContext("2d"), 14, 1.1);
  drawPixelBolt(document.getElementById("picker-bolt").getContext("2d"), 18, 1.1);
}

// ---- DEV TOOLS — testing only ----
// The bar only appears when the SERVER reports dev is enabled (see
// updateDevBar). Set MICKEY_DEV=0 in production to hide it and disable the
// /api/dev/* endpoints. `?nodev` also hides it locally.
function initDevTools() {
  const bar = document.getElementById("dev-bar");

  const stateButtons = bar.querySelectorAll("[data-dev]");
  stateButtons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await api("/api/dev/state", { method: "POST", body: JSON.stringify({ override: btn.dataset.dev }) });
        stateButtons.forEach((b) => b.classList.toggle("is-active", b === btn && btn.dataset.dev !== "auto"));
        await poll();
      } catch (e) { toast(e.message, "toast-warn"); }
    });
  });

  bar.querySelector("[data-dev-seed]").addEventListener("click", async () => {
    try {
      const r = await api("/api/dev/seed", { method: "POST", body: "{}" });
      toast(`Seeded ${r.days} days (${r.totalMiles} mi)`);
      stage.bgKey = ""; trail.drawnKey = "";
      await poll();
    } catch (e) { toast(e.message, "toast-warn"); }
  });

  // Clear the local character so you can build a new one and gift again.
  bar.querySelector("[data-dev-newme]").addEventListener("click", async () => {
    saveProfile(null);
    pendingPick = null;
    await api("/api/dev/redemptions/clear", { method: "POST", body: "{}" }).catch(() => {});
    toast("Character cleared — build a new one");
    activateScreen("friends");
    await poll();
  });

  bar.querySelector("[data-dev-reset]").addEventListener("click", async () => {
    try {
      await api("/api/dev/reset", { method: "POST", body: "{}" });
      toast("Cleared fake data");
      stateButtons.forEach((b) => b.classList.remove("is-active"));
      stage.bgKey = ""; trail.drawnKey = "";
      await poll();
    } catch (e) { toast(e.message, "toast-warn"); }
  });
}

function init() {
  stage.canvas = document.getElementById("status-scene-canvas");
  stage.ctx = stage.canvas.getContext("2d");
  sizeCanvases();
  fitPhone();
  initIcons();
  initBuilder();
  initDevTools();
  requestAnimationFrame(tick);

  document.querySelectorAll(".dock-button").forEach((btn) => {
    btn.addEventListener("click", () => activateScreen(btn.dataset.screen));
  });
  document.getElementById("love-button").addEventListener("click", sendLove);
  document.getElementById("backpack-button").addEventListener("click", () => {
    document.getElementById("backpack-drawer").classList.toggle("is-open");
  });
  document.getElementById("pack-button").addEventListener("click", packPowerup);

  fitPhone();
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    fitPhone();
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { sizeCanvases(); renderAll(); }, 250);
  });

  // boost countdown ticks between polls
  setInterval(renderBoostChip, 1000);

  // trail map labels need the pixel fonts
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { trail.drawnKey = ""; ensureTrailMap(); });
  }

  poll();
  setInterval(poll, POLL_INTERVAL_MS);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

init();
