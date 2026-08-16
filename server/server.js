/**
 * Mickey Miles — backend v2
 *
 * POST /api/telemetry        — ESP32 uploads metrics (same contract as v1, shared secret)
 * GET  /api/state            — everything the site needs, one poll (public read)
 * POST /api/users            — create a visitor profile (name + pixel avatar)
 * GET  /api/users/:id        — look up a profile (used to re-hydrate a device)
 * POST /api/powerups/redeem  — claim today's powerup (one per user per trail-day)
 * POST /api/backpack/gift    — put your redeemed powerup in Mickey's backpack (activates boost)
 * POST /api/love             — send Mickey some love (small cooldown)
 * GET  /api/health           — liveness
 *
 * Also serves the static frontend from the repo root (server/, firmware/,
 * reference/ and dotfiles are blocked).
 */

const path = require("path");
const crypto = require("crypto");
const express = require("express");

require("dotenv").config({ path: path.join(__dirname, ".env") });

const { db, kvGet, kvSet, kvDel, addEvent } = require("./db");

const PORT = Number(process.env.PORT) || 3000;
const TELEMETRY_SECRET = process.env.TELEMETRY_SECRET || "change-me-in-production";
const TRAIL_TZ = process.env.TRAIL_TZ || "America/Los_Angeles";

const ROUTE_TOTAL_MILES = 2650;

// Real-world daylight window (trail-local). Mickey is nocturnal, so he SLEEPS
// during daylight (08:00–19:59) and is awake/refueling at night (20:00–07:59).
// `isDaytime` also drives the scene lighting so the sky matches the real clock.
const DAY_START_HOUR = 8;
const DAY_END_HOUR = 20;

// Speed smoothing: average the raw firmware samples reported in this window.
// Short, so the readout tracks the real wheel speed instead of lagging behind.
const SPEED_WINDOW_MS = 6000;
// If no telemetry for this long, the tracker is offline: speed 0, not moving.
const TELEMETRY_STALE_MS = 120000;

// ---- telemetry plausibility guards ----
// A dwarf hamster on a 20 cm wheel cruises just under 1 mph and has never
// topped 1 mph average here. Anything sustained above MAX_PLAUSIBLE_MPH is not
// a hamster: it's the sensor counting something that isn't the wheel. (Jul 31 –
// Aug 6 2026: a 120 Hz light source flickering into the slot sensor produced a
// dead-steady 20 pulses/sec around the clock — ~337 mi/day, 1,900 bogus miles
// before anyone noticed.) Reports that imply more than this are recorded as
// anomalies and contribute nothing to the log.
const MAX_PLAUSIBLE_MPH = 6;
// Hard ceiling on real (non-powerup) miles banked in a single trail day.
const MAX_DAILY_DEVICE_MILES = 12;
// A device date this far from trail-local "today" is a clock the device never
// managed to sync (an unsynced ESP32 reports 1970-01-01) — don't let it open a
// row at the wrong end of the log.
const MAX_DATE_SKEW_DAYS = 1;

const PRESENCE_WINDOW_MS = 45000; // seen within this = on the bleachers (fallback if the leave beacon is missed)
const LOVE_COOLDOWN_MS = 6000;
const LOVE_GLOW_MS = 5000; // how long Mickey smiles after a love press
const GIFT_COOLDOWN_MS = 60 * 60 * 1000; // one gifted snack per browser per hour
const CHEERIO_MS = 60000; // Mickey munches a default cheerio for a full minute
const ITEM_MS = 20000; // a gifted powerup takes 20s to eat, then it takes effect
const EAT_GAP_MS = 1000; // brief empty-pawed pause between snacks
const BACKPACK_SLOTS = 6;

// Durations are in *run* time — minutes of the wheel actually turning, not
// wall-clock (see getBoosts). Mickey banks roughly 20 wheel-minutes a night, so
// these are sized to be worth a real slice of a night without one snack owning
// the whole thing. They're deliberately close in value (~0.19 bonus miles each
// at his usual 0.95 mph); what differs is the shape — the seed is a slow burn,
// the chili a 90-second sprint.
const POWERUPS = {
  pumpkin_seed: { label: "Pumpkin Seed", emoji: "🎃", multiplier: 2, durationMs: 12 * 60 * 1000 },
  blueberry: { label: "Blueberry", emoji: "🫐", multiplier: 5, durationMs: 3 * 60 * 1000 },
  chili: { label: "Chili Pepper", emoji: "🌶️", multiplier: 10, durationMs: 90 * 1000 }
};

// Stacked powerups compound, so two 10x chillies really are 100x — but the
// product is clamped here so a backpack full of them can't run away with the
// trail (six would otherwise be a million-x).
const MAX_COMBINED_MULTIPLIER = 100;

const AVATAR_OPTIONS = { hair: 8, skin: 6, outfit: 9 };

// Keep names Mickey-friendly (parents + kids use this). Not exhaustive; tune
// as needed. Matched against the name with non-letters stripped, lowercased.
const BLOCKED_NAME_WORDS = [
  "fuck", "shit", "bitch", "cunt", "pussy", "cock", "penis", "vagina", "boobs",
  "asshole", "dumbass", "jackass", "bastard", "slut", "whore", "hoe", "damn",
  "dickhead", "bollocks", "wanker", "twat", "nigger", "nigga", "faggot", "fag",
  "retard", "spastic", "chink", "spic", "kike", "coon", "wetback", "tranny",
  "rape", "nazi", "hitler", "porn", "sex", "cum", "jizz", "boner", "turd"
];
const nameOffenses = new Map(); // deviceId -> count (in-memory, resets on restart)

function hasBlockedWord(name) {
  const clean = String(name).toLowerCase().replace(/[^a-z]/g, "");
  return BLOCKED_NAME_WORDS.some((w) => clean.includes(w));
}

// In-memory rolling window of raw speed samples from the firmware.
// Losing this on restart only costs one smoothing window (~18s) — fine.
let speedSamples = []; // [{ ts, mph }]

// ---------------------------------------------------------------- trail time

function trailNow(now = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TRAIL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  const parts = {};
  for (const p of fmt.formatToParts(now)) parts[p.type] = p.value;
  const hour = Number(parts.hour) % 24;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour,
    minute: Number(parts.minute),
    isDaytime: hour >= DAY_START_HOUR && hour < DAY_END_HOUR
  };
}

// ------------------------------------------------------------------- helpers

function effectiveMiles(row) {
  return Math.max(0, (row.device_miles || 0) + (row.bonus_miles || 0));
}

function rowAvgSpeed(row) {
  if (!row || row.wheel_minutes < 0.5) return 0;
  const avg = row.device_miles / (row.wheel_minutes / 60);
  return avg > 25 ? 0 : avg;
}

/**
 * Active powerups.
 *
 * Two rules, both different from v2:
 *  - They **stack, and they compound**. A new gift no longer replaces the one in
 *    effect; every live powerup multiplies with the rest, so a 2x and a 5x give
 *    10x. The product is capped at MAX_COMBINED_MULTIPLIER so a full backpack
 *    can't run away with the trail.
 *  - They burn **run time, not wall-clock time**. `remainingMs` is decremented
 *    only by wheel motion the device actually reports (see burnBoosts), so a
 *    powerup gifted while Mickey is asleep is still there, whole, when he wakes
 *    up and starts running.
 */
function getBoosts() {
  let list = kvGet("boosts", null);
  if (!Array.isArray(list)) {
    // Migrate the single wall-clock boost this replaced.
    const legacy = kvGet("boost");
    list = [];
    if (legacy && legacy.endsAt > Date.now()) {
      list.push({
        type: legacy.type,
        multiplier: legacy.multiplier,
        remainingMs: Math.max(0, legacy.endsAt - Date.now()),
        byName: legacy.byName,
        startedAt: Date.now()
      });
    }
    kvDel("boost");
    kvSet("boosts", list);
  }
  return list.filter((b) => b.remainingMs > 0 && POWERUPS[b.type]);
}

/**
 * Combined multiplier: powerups compound, so 2x and 5x make 10x. Clamped to
 * MAX_COMBINED_MULTIPLIER. Returns 1 when nothing is live.
 */
function combinedMultiplier(boosts) {
  const product = boosts.reduce((total, b) => total * b.multiplier, 1);
  return Math.min(MAX_COMBINED_MULTIPLIER, product);
}

/**
 * Spend run time against every active powerup. Called from telemetry with the
 * wheel minutes the device actually reported, so the clock only moves when the
 * wheel does — not while Mickey refuels, sleeps, or the tracker is offline.
 */
function burnBoosts(wheelMinutes) {
  if (!(wheelMinutes > 0)) return;
  const spent = wheelMinutes * 60000;
  const list = getBoosts().map((b) => ({ ...b, remainingMs: b.remainingMs - spent }));
  const live = list.filter((b) => b.remainingMs > 0);
  if (live.length !== list.length) {
    for (const done of list.filter((b) => b.remainingMs <= 0)) {
      addEvent("boost_end", done.byName || "a friend", done.type);
    }
  }
  kvSet("boosts", live);
}

function getUser(id) {
  if (!id || typeof id !== "string") return null;
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) || null;
}

// Stable per-browser id used for the one-powerup-per-day limit. Profiles are
// rebuilt every visit, but the device id persists, so the daily cap survives.
function deviceOf(src) {
  const v = src && src.deviceId;
  return typeof v === "string" && v.length ? v.slice(0, 64) : "";
}

// The device's current snack "slot": its most recent redemption if that slot
// is still in play — i.e. picked-but-not-yet-gifted, or gifted within the last
// hour (the cooldown). Older/gifted-long-ago redemptions free up a new slot.
function activeRedemption(deviceId, now = Date.now()) {
  if (!deviceId) return null;
  const r = db.prepare("SELECT * FROM redemptions WHERE device_id = ? ORDER BY id DESC LIMIT 1").get(deviceId);
  if (!r) return null;
  if (!r.gifted) return r;
  if (now - (r.gifted_at || r.redeemed_at) < GIFT_COOLDOWN_MS) return r;
  return null;
}

// Has the device's gifted snack been eaten? (gifted, and nothing of theirs
// left uneaten in the backpack).
function deviceGiftEaten(deviceId, redemption) {
  if (!deviceId || !redemption || !redemption.gifted) return false;
  const pending = db
    .prepare("SELECT COUNT(*) AS c FROM backpack WHERE device_id = ? AND eaten_at IS NULL")
    .get(deviceId).c;
  return pending === 0;
}

function touchPresence(userId, now = Date.now()) {
  db.prepare("UPDATE users SET last_seen_at = ? WHERE id = ?").run(now, userId);
}

function uneatenBackpack() {
  return db
    .prepare(
      `SELECT b.id, b.type, b.added_at, u.name AS by_name
       FROM backpack b LEFT JOIN users u ON u.id = b.user_id
       WHERE b.eaten_at IS NULL ORDER BY b.added_at ASC, b.id ASC`
    )
    .all();
}

/** Whole days between two YYYY-MM-DD strings (sign-carrying, |a - b|). */
function dayGap(a, b) {
  const ms = Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.abs(ms) / 86400000 : Infinity;
}

/**
 * Record a rejected/clamped telemetry report so a broken sensor is visible
 * instead of silently poisoning the journey. Surfaced by GET /api/health.
 */
function noteAnomaly(reason, detail) {
  const prev = kvGet("sensorAnomaly", null);
  const sameRun = prev && prev.reason === reason;
  kvSet("sensorAnomaly", {
    reason,
    detail,
    at: Date.now(),
    firstAt: sameRun ? prev.firstAt : Date.now(),
    count: sameRun ? prev.count + 1 : 1
  });
  console.warn(`[telemetry] rejected (${reason}): ${detail}`);
}

function computeTracker(now = Date.now()) {
  const last = kvGet("lastTelemetry"); // { at, isMoving, speedMph }
  const stale = !last || now - last.at > TELEMETRY_STALE_MS;
  const isMoving = !stale && Boolean(last.isMoving);

  speedSamples = speedSamples.filter((s) => now - s.ts <= SPEED_WINDOW_MS);
  let speed = 0;
  if (!stale && isMoving && speedSamples.length) {
    speed = speedSamples.reduce((sum, s) => sum + s.mph, 0) / speedSamples.length;
  }

  let lastUpdateLabel = "No data yet";
  if (last) {
    const agoSec = Math.floor((now - last.at) / 1000);
    if (agoSec < 120) lastUpdateLabel = `Live · ${agoSec}s ago`;
    else if (agoSec < 3600) lastUpdateLabel = `Last seen ${Math.floor(agoSec / 60)}m ago`;
    else lastUpdateLabel = `Last seen ${new Date(last.at).toLocaleString("en-US", { timeZone: TRAIL_TZ })}`;
  }

  return {
    isMoving,
    speedMph: Math.round(speed * 100) / 100,
    lastUpdateLabel,
    lastTelemetryAt: last ? new Date(last.at).toISOString() : null,
    online: !stale
  };
}

// ============================ DEV TOOLS =============================
// Manual state override + fake-data seeding for local testing.
// REMOVE THIS BLOCK (and the /api/dev/* routes below) BEFORE GOING LIVE.
const DEV_ENABLED = process.env.MICKEY_DEV !== "0";

/**
 * Resolve Mickey's on-screen state. Normally derived from telemetry + time,
 * but a dev override (set via POST /api/dev/state) wins when present.
 */
function resolveHamsterState(tracker, trail) {
  const override = DEV_ENABLED ? kvGet("devOverride") : null;
  if (override && override.state) return override.state;
  // Nocturnal: asleep in daylight, up and refueling at night.
  return tracker.isMoving ? "running" : trail.isDaytime ? "sleeping" : "refuel";
}
// =========================== END DEV TOOLS ==========================

/** Add a powerup to the stack. Everything already running keeps running. */
function applyBoost(type, byName, now = Date.now()) {
  const p = POWERUPS[type];
  if (!p) return;
  const list = getBoosts();
  list.push({ type, multiplier: p.multiplier, remainingMs: p.durationMs, byName, startedAt: now });
  kvSet("boosts", list);
}

/**
 * Advance Mickey's snacking. Called lazily from GET /api/state while he's
 * refueling. He always munches a default cheerio (CHEERIO_MS each, then a
 * short empty-pawed gap). When a friend's powerup is waiting in the backpack,
 * he finishes the current cheerio first, then eats the powerup over ITEM_MS —
 * and the boost only takes effect once he's swallowed it.
 */
function advanceEating(hamsterState, now = Date.now()) {
  let eating = kvGet("eating"); // { kind:'cheerio'|'item', backpackId?, type, startedAt }

  if (hamsterState !== "refuel") {
    if (eating) kvDel("eating"); // pause: a half-eaten item goes back in the pack
    return null;
  }

  if (eating) {
    const dur = eating.kind === "item" ? ITEM_MS : CHEERIO_MS;
    if (eating.kind === "item") {
      const item = db
        .prepare(
          `SELECT b.*, u.name AS by_name FROM backpack b
           LEFT JOIN users u ON u.id = b.user_id WHERE b.id = ?`
        )
        .get(eating.backpackId);
      if (!item || item.eaten_at !== null) {
        kvDel("eating"); // vanished somehow — move on
        eating = null;
      } else if (now - eating.startedAt >= dur) {
        // finished the powerup: it disappears, the thank-you fires, boost starts
        db.prepare("UPDATE backpack SET eaten_at = ? WHERE id = ?").run(now, item.id);
        addEvent("eat", item.by_name || "a friend", item.type);
        applyBoost(item.type, item.by_name || "a friend", now);
        kvDel("eating");
        kvSet("eatGapUntil", now + EAT_GAP_MS);
        eating = null;
      } else {
        return { type: item.type, byName: item.by_name || "a friend", kind: "item", startedAt: eating.startedAt };
      }
    } else {
      if (now - eating.startedAt >= dur) {
        kvDel("eating");
        kvSet("eatGapUntil", now + EAT_GAP_MS);
        eating = null;
      } else {
        return { type: "cheerio", byName: null, kind: "cheerio", startedAt: eating.startedAt };
      }
    }
  }

  // between snacks: brief empty-pawed pause
  if (now < kvGet("eatGapUntil", 0)) return null;

  // start the next snack — a waiting powerup first, otherwise a cheerio
  const next = uneatenBackpack()[0];
  if (next) {
    eating = { kind: "item", backpackId: next.id, type: next.type, startedAt: now };
    kvSet("eating", eating);
    return { type: next.type, byName: next.by_name || "a friend", kind: "item", startedAt: now };
  }
  eating = { kind: "cheerio", type: "cheerio", startedAt: now };
  kvSet("eating", eating);
  return { type: "cheerio", byName: null, kind: "cheerio", startedAt: now };
}

// ----------------------------------------------------------------------- app

const app = express();
app.use(express.json({ limit: "16kb" }));

app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Liveness, plus enough to diagnose a silent or misbehaving tracker without
// opening a shell: when the device was last heard from and the most recent
// telemetry the plausibility guards threw out.
app.get("/api/health", (req, res) => {
  const last = kvGet("lastTelemetry");
  const anomaly = kvGet("sensorAnomaly", null);
  res.json({
    ok: true,
    trailDate: trailNow().date,
    lastTelemetryAt: last && last.at ? new Date(last.at).toISOString() : null,
    telemetryAgeSec: last && last.at ? Math.floor((Date.now() - last.at) / 1000) : null,
    lastAnomaly: anomaly
      ? {
          reason: anomaly.reason,
          detail: anomaly.detail,
          count: anomaly.count,
          firstAt: new Date(anomaly.firstAt).toISOString(),
          lastAt: new Date(anomaly.at).toISOString()
        }
      : null
  });
});

// ---- telemetry (device contract unchanged from v1) ----
app.post("/api/telemetry", (req, res) => {
  const body = req.body || {};
  if (body.secret !== TELEMETRY_SECRET) {
    return res.status(401).json({ ok: false, error: "invalid secret" });
  }

  const now = Date.now();
  const trailDate = trailNow().date;
  // Trust the device's day only when its clock is in the same neighbourhood as
  // the trail's — otherwise the day is ours. Keeps an unsynced device (1970) or
  // a wildly wrong clock from opening a row at the wrong end of the log.
  let date = trailDate;
  if (typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    if (dayGap(body.date, trailDate) <= MAX_DATE_SKEW_DAYS) {
      date = body.date;
    } else {
      noteAnomaly("bad-date", `device reported ${body.date}, trail day is ${trailDate}`);
    }
  }

  const rawMiles = Number(body.milesToday);
  const rawWheelMin = Number(body.wheelMinutesToday);
  const rawPulses = Number(body.revsToday);
  const speedMph = Number(body.speedMph);
  const isMoving = Boolean(body.isMoving);

  const miles = Number.isFinite(rawMiles) ? Math.max(0, rawMiles) : 0;
  const wheelMin = Number.isFinite(rawWheelMin) ? Math.max(0, rawWheelMin) : 0;
  // Older firmware doesn't send this; 0 just means "not recorded".
  const pulses = Number.isFinite(rawPulses) ? Math.max(0, rawPulses) : 0;

  let row = db.prepare("SELECT * FROM daily_log WHERE date = ?").get(date);
  if (!row) {
    db.prepare("INSERT INTO daily_log (date) VALUES (?)").run(date);
    row = db.prepare("SELECT * FROM daily_log WHERE date = ?").get(date);
  }

  // The device reports cumulative-for-the-day values; we fold in the delta so
  // a device reboot (counter back to ~0) never erases miles already banked.
  const rawMilesDelta = miles >= row.last_raw_miles ? miles - row.last_raw_miles : miles;
  const rawWheelDelta = wheelMin >= row.last_raw_wheel_min ? wheelMin - row.last_raw_wheel_min : wheelMin;
  const rawPulseDelta = pulses >= row.last_raw_pulses ? pulses - row.last_raw_pulses : pulses;

  // Sanity-check the delta against the wall clock. A hamster can only cover so
  // much ground in the time since we last heard from the device; a delta that
  // implies more than MAX_PLAUSIBLE_MPH is phantom pulses, not miles. The
  // last_raw_* watermarks still advance so a single bad burst is skipped rather
  // than re-counted on every subsequent report.
  const prev = kvGet("lastTelemetry");
  const elapsedH = prev && prev.at && now > prev.at ? (now - prev.at) / 3600000 : 0;
  let milesDelta = rawMilesDelta;
  let wheelDelta = rawWheelDelta;
  let pulseDelta = rawPulseDelta;

  if (elapsedH > 0 && rawMilesDelta / elapsedH > MAX_PLAUSIBLE_MPH) {
    noteAnomaly(
      "implausible-speed",
      `${rawMilesDelta.toFixed(4)} mi in ${(elapsedH * 3600).toFixed(0)}s = ` +
        `${(rawMilesDelta / elapsedH).toFixed(1)} mph (max ${MAX_PLAUSIBLE_MPH}) — check the wheel sensor`
    );
    milesDelta = 0;
    wheelDelta = 0;
    pulseDelta = 0;
  }

  // The wheel cannot have turned for more minutes than have actually passed.
  const elapsedMin = elapsedH * 60;
  if (elapsedH > 0 && wheelDelta > elapsedMin) wheelDelta = elapsedMin;

  // Last line of defence: a hard ceiling on real miles banked per trail day.
  const roomToday = Math.max(0, MAX_DAILY_DEVICE_MILES - row.device_miles);
  if (milesDelta > roomToday) {
    noteAnomaly(
      "daily-cap",
      `${date} would reach ${(row.device_miles + milesDelta).toFixed(2)} mi ` +
        `(cap ${MAX_DAILY_DEVICE_MILES}) — check the wheel sensor`
    );
    // Keep pulses proportional to the miles actually banked, so the recorded
    // pulse count stays a faithful basis for recalibration.
    pulseDelta = milesDelta > 0 ? pulseDelta * (roomToday / milesDelta) : 0;
    milesDelta = roomToday;
  }

  // Bonus miles use the combined multiplier of everything currently stacked.
  const bonusDelta = milesDelta * (combinedMultiplier(getBoosts()) - 1);
  // Powerups are paid for in wheel time, so spend the motion we just accepted.
  burnBoosts(wheelDelta);

  db.prepare(
    `UPDATE daily_log SET
       device_miles = device_miles + ?,
       bonus_miles = bonus_miles + ?,
       wheel_minutes = wheel_minutes + ?,
       device_pulses = device_pulses + ?,
       last_raw_miles = ?,
       last_raw_wheel_min = ?,
       last_raw_pulses = ?
     WHERE date = ?`
  ).run(milesDelta, bonusDelta, wheelDelta, pulseDelta, miles, wheelMin, pulses, date);

  if (Number.isFinite(speedMph) && speedMph >= 0 && speedMph <= MAX_PLAUSIBLE_MPH) {
    speedSamples.push({ ts: now, mph: speedMph });
    speedSamples = speedSamples.filter((s) => now - s.ts <= SPEED_WINDOW_MS);
  }

  kvSet("lastTelemetry", {
    at: now,
    isMoving,
    speedMph: Number.isFinite(speedMph) ? Math.max(0, speedMph) : 0
  });

  res.json({ ok: true });
});

// ---- state poll ----
app.get("/api/state", (req, res) => {
  const now = Date.now();
  const trail = trailNow();
  const userId = typeof req.query.userId === "string" ? req.query.userId : null;
  const user = getUser(userId);
  if (user) touchPresence(user.id, now);

  const tracker = computeTracker(now);
  const hamsterState = resolveHamsterState(tracker, trail);
  // DEV: a running override with no live telemetry still shows a lively scene.
  const devOverride = DEV_ENABLED ? kvGet("devOverride") : null;
  if (devOverride && devOverride.state) {
    tracker.online = true;
    if (devOverride.state === "running") {
      tracker.isMoving = true;
      if (tracker.speedMph < 0.1) tracker.speedMph = 3.2;
    } else {
      tracker.isMoving = false;
    }
  }
  const eating = advanceEating(hamsterState, now);
  const boosts = getBoosts();
  const lovedUntil = kvGet("lovedUntil", 0);

  const rows = db.prepare("SELECT * FROM daily_log ORDER BY date ASC").all();
  const dailyLog = rows.map((r) => ({
    date: r.date,
    miles: Math.round(effectiveMiles(r) * 1000) / 1000,
    baseMiles: Math.round(r.device_miles * 1000) / 1000,
    bonusMiles: Math.round(r.bonus_miles * 1000) / 1000,
    wheelMinutes: Math.round(r.wheel_minutes * 10) / 10,
    pulses: Math.round(r.device_pulses || 0),
    avgSpeedMph: Math.round(rowAvgSpeed(r) * 100) / 100
  }));

  const totalMiles = dailyLog.reduce((sum, r) => sum + r.miles, 0);
  const todayRow = dailyLog.find((r) => r.date === trail.date) || null;

  const bleachers = db
    .prepare(
      "SELECT id, name, hair, skin, outfit FROM users WHERE last_seen_at >= ? ORDER BY last_seen_at DESC LIMIT 40"
    )
    .all(now - PRESENCE_WINDOW_MS)
    .map((u) => ({ id: u.id, name: u.name, avatar: { hair: u.hair, skin: u.skin, outfit: u.outfit } }));

  const latestEventRow = db.prepare("SELECT MAX(id) AS m FROM events").get();
  const latestEventId = latestEventRow.m || 0;
  let events = [];
  const since = Number(req.query.since);
  if (Number.isFinite(since) && since >= 0) {
    events = db
      .prepare("SELECT id, type, user_name, item_type, created_at FROM events WHERE id > ? ORDER BY id ASC LIMIT 20")
      .all(since)
      .map((e) => ({ id: e.id, type: e.type, name: e.user_name, item: e.item_type }));
  }

  let you = null;
  if (user) {
    // Snack status is tracked per-device (survives profile rebuilds); one gift
    // per hour. `redeemedToday`/`giftedToday` keep their names for the client.
    const device = deviceOf(req.query);
    const redemption = activeRedemption(device, now);
    const gifted = redemption ? Boolean(redemption.gifted) : false;
    you = {
      id: user.id,
      name: user.name,
      avatar: { hair: user.hair, skin: user.skin, outfit: user.outfit },
      redeemedToday: redemption ? redemption.type : null,
      giftedToday: gifted,
      giftEaten: gifted ? deviceGiftEaten(device, redemption) : false,
      nextSnackAt: gifted ? (redemption.gifted_at || redemption.redeemed_at) + GIFT_COOLDOWN_MS : null
    };
  }

  res.json({
    tracker: {
      isMoving: tracker.isMoving,
      speedMph: tracker.speedMph,
      lastUpdateLabel: tracker.lastUpdateLabel,
      lastTelemetryAt: tracker.lastTelemetryAt,
      online: tracker.online
    },
    trail: {
      tz: TRAIL_TZ,
      date: trail.date,
      hour: trail.hour,
      minute: trail.minute,
      isDaytime: trail.isDaytime
    },
    hamster: {
      state: hamsterState,
      eating,
      lovedUntil: lovedUntil > now ? lovedUntil : 0
    },
    today: {
      date: trail.date,
      miles: todayRow ? todayRow.miles : 0,
      wheelMinutes: todayRow ? todayRow.wheelMinutes : 0,
      avgSpeedMph: todayRow ? todayRow.avgSpeedMph : 0
    },
    dailyLog,
    journey: {
      routeTotalMiles: ROUTE_TOTAL_MILES,
      totalMiles: Math.round(totalMiles * 100) / 100,
      milesLeft: Math.round(Math.max(0, ROUTE_TOTAL_MILES - totalMiles) * 100) / 100,
      daysRun: dailyLog.filter((r) => r.miles > 0).length
    },
    // `boost` is the headline for the HUD chip: the combined multiplier and the
    // run time left on whichever powerup lasts longest. `boosts` is the whole
    // stack, newest last. Both count down only while the wheel is turning, so
    // `remainingMs` is run time remaining, not a wall-clock deadline.
    boost: boosts.length
      ? {
          multiplier: combinedMultiplier(boosts),
          capped: boosts.reduce((t, b) => t * b.multiplier, 1) > MAX_COMBINED_MULTIPLIER,
          remainingMs: Math.max(...boosts.map((b) => b.remainingMs)),
          count: boosts.length,
          byName: boosts[boosts.length - 1].byName,
          type: boosts[boosts.length - 1].type,
          label: POWERUPS[boosts[boosts.length - 1].type].label,
          emoji: POWERUPS[boosts[boosts.length - 1].type].emoji
        }
      : null,
    boosts: boosts.map((b) => ({
      type: b.type,
      label: POWERUPS[b.type].label,
      emoji: POWERUPS[b.type].emoji,
      multiplier: b.multiplier,
      remainingMs: b.remainingMs,
      byName: b.byName
    })),
    backpack: uneatenBackpack().map((b) => ({ id: b.id, type: b.type, byName: b.by_name || "a friend" })),
    backpackSlots: BACKPACK_SLOTS,
    bleachers,
    powerups: Object.entries(POWERUPS).map(([key, p]) => ({
      type: key,
      label: p.label,
      emoji: p.emoji,
      multiplier: p.multiplier,
      durationMin: p.durationMs / 60000
    })),
    events,
    latestEventId,
    you,
    devTools: DEV_ENABLED
  });
});

// ---- users ----
app.post("/api/users", (req, res) => {
  const body = req.body || {};
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 20) : "";
  if (name.length < 1) {
    return res.status(400).json({ ok: false, error: "name required (1-20 chars)" });
  }
  if (hasBlockedWord(name)) {
    const key = deviceOf(body) || "anon";
    const n = (nameOffenses.get(key) || 0) + 1;
    nameOffenses.set(key, n);
    const msg = n <= 1
      ? "Please use a Mickey-friendly name."
      : "BK and Mickey are disappointed, don't get banned!";
    return res.status(400).json({ ok: false, error: msg, profanity: true });
  }
  const avatar = body.avatar || {};
  const pick = (key) => {
    const v = Number(avatar[key]);
    return Number.isInteger(v) && v >= 0 && v < AVATAR_OPTIONS[key] ? v : 0;
  };
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(
    "INSERT INTO users (id, name, hair, skin, outfit, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(id, name, pick("hair"), pick("skin"), pick("outfit"), now, now);
  res.json({
    ok: true,
    user: { id, name, avatar: { hair: pick("hair"), skin: pick("skin"), outfit: pick("outfit") } }
  });
});

app.get("/api/users/:id", (req, res) => {
  const user = getUser(req.params.id);
  if (!user) return res.status(404).json({ ok: false, error: "not found" });
  res.json({
    ok: true,
    user: { id: user.id, name: user.name, avatar: { hair: user.hair, skin: user.skin, outfit: user.outfit } }
  });
});

// ---- powerups ----
app.post("/api/powerups/redeem", (req, res) => {
  const body = req.body || {};
  const user = getUser(body.userId);
  if (!user) return res.status(401).json({ ok: false, error: "unknown user — make a profile first" });
  const type = body.type;
  if (!POWERUPS[type]) return res.status(400).json({ ok: false, error: "unknown powerup" });

  const deviceId = deviceOf(body);
  if (!deviceId) return res.status(400).json({ ok: false, error: "missing device id" });

  const now = Date.now();
  touchPresence(user.id, now);
  const trail = trailNow();
  const existing = activeRedemption(deviceId, now);
  if (existing && existing.gifted) {
    const waitMin = Math.ceil((GIFT_COOLDOWN_MS - (now - (existing.gifted_at || existing.redeemed_at))) / 60000);
    return res.status(409).json({ ok: false, error: `One snack per hour — try again in ${waitMin} min.` });
  }
  if (existing) {
    return res.status(409).json({ ok: false, error: "already picked", redeemedToday: existing.type, giftedToday: false });
  }
  db.prepare("INSERT INTO redemptions (user_id, device_id, date, type, redeemed_at) VALUES (?, ?, ?, ?, ?)").run(
    user.id,
    deviceId,
    trail.date,
    type,
    now
  );
  res.json({ ok: true, redeemedToday: type, giftedToday: false });
});

app.post("/api/backpack/gift", (req, res) => {
  const body = req.body || {};
  const user = getUser(body.userId);
  if (!user) return res.status(401).json({ ok: false, error: "unknown user — make a profile first" });

  const deviceId = deviceOf(body);
  const now = Date.now();
  touchPresence(user.id, now);
  const redemption = activeRedemption(deviceId, now);
  if (!redemption) return res.status(400).json({ ok: false, error: "redeem a powerup first" });
  if (redemption.gifted) {
    const waitMin = Math.ceil((GIFT_COOLDOWN_MS - (now - (redemption.gifted_at || redemption.redeemed_at))) / 60000);
    return res.status(409).json({ ok: false, error: `One snack per hour — try again in ${waitMin} min.` });
  }

  const count = db.prepare("SELECT COUNT(*) AS c FROM backpack WHERE eaten_at IS NULL").get().c;
  if (count >= BACKPACK_SLOTS) {
    return res.status(409).json({ ok: false, error: "backpack is full — wait for Mickey to snack" });
  }

  db.prepare("INSERT INTO backpack (user_id, device_id, type, added_at) VALUES (?, ?, ?, ?)").run(
    user.id,
    deviceId,
    redemption.type,
    now
  );
  db.prepare("UPDATE redemptions SET gifted = 1, gifted_at = ? WHERE id = ?").run(now, redemption.id);

  // The boost does NOT start yet — it activates once Mickey finishes eating the
  // powerup (see advanceEating). Gifting just drops it in the backpack.
  addEvent("gift", user.name, redemption.type);

  res.json({ ok: true, packed: redemption.type });
});

// ---- leave (fired via sendBeacon on tab close) ----
app.post("/api/leave", (req, res) => {
  const user = getUser((req.body || {}).userId);
  if (user) db.prepare("UPDATE users SET last_seen_at = 0 WHERE id = ?").run(user.id);
  res.json({ ok: true });
});

// ---- love ----
app.post("/api/love", (req, res) => {
  const body = req.body || {};
  const user = getUser(body.userId);
  if (!user) return res.status(401).json({ ok: false, error: "unknown user — make a profile first" });

  const now = Date.now();
  touchPresence(user.id, now);
  const tracker = computeTracker(now);
  const trail = trailNow();
  const hamsterState = resolveHamsterState(tracker, trail);
  if (hamsterState === "running") {
    return res.status(409).json({ ok: false, error: "Mickey is mid-run — send love when he rests" });
  }
  if (now - user.last_love_at < LOVE_COOLDOWN_MS) {
    return res.status(429).json({ ok: false, error: "one heart at a time!" });
  }
  db.prepare("UPDATE users SET last_love_at = ? WHERE id = ?").run(now, user.id);
  kvSet("lovedUntil", now + LOVE_GLOW_MS);
  addEvent("love", user.name);
  res.json({ ok: true, lovedUntil: now + LOVE_GLOW_MS });
});

// ============================ DEV ROUTES ============================
// Manual state switching + fake-data seeding for local testing only.
// REMOVE THIS BLOCK BEFORE GOING LIVE (or run with MICKEY_DEV=0).
if (DEV_ENABLED) {
  // POST /api/dev/state { override: "running"|"refuel"|"sleeping"|null }
  app.post("/api/dev/state", (req, res) => {
    const state = (req.body || {}).override;
    if (state === null || state === "auto") {
      kvDel("devOverride");
      return res.json({ ok: true, override: null });
    }
    if (!["running", "refuel", "sleeping"].includes(state)) {
      return res.status(400).json({ ok: false, error: "override must be running|refuel|sleeping|auto" });
    }
    kvSet("devOverride", { state });
    res.json({ ok: true, override: state });
  });

  // POST /api/dev/seed — load a fake multi-day trail history (~1,850 mi).
  app.post("/api/dev/seed", (req, res) => {
    const perDay = [150, 205, 120, 235, 175, 215, 140, 60, 190, 165, 200];
    const bonusDay = 7; // give one day a big powerup boost
    db.prepare("DELETE FROM daily_log").run();
    const today = trailNow();
    const base = new Date(`${today.date}T12:00:00Z`);
    perDay.forEach((miles, i) => {
      const d = new Date(base);
      d.setUTCDate(d.getUTCDate() - (perDay.length - 1 - i));
      const date = d.toISOString().slice(0, 10);
      const bonus = i === bonusDay ? miles * 4 : 0; // 5x day -> +4x bonus
      const wheelMin = Math.round(miles / 2.1 * 60); // ~2.1 mph avg
      db.prepare(
        `INSERT INTO daily_log (date, device_miles, bonus_miles, wheel_minutes, last_raw_miles, last_raw_wheel_min)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(date, miles, bonus, wheelMin, miles, wheelMin);
    });
    const total = db.prepare("SELECT SUM(device_miles + bonus_miles) AS t FROM daily_log").get().t;
    res.json({ ok: true, days: perDay.length, totalMiles: Math.round(total) });
  });

  // POST /api/dev/reset — clear fake history, backpack, redemptions + state.
  app.post("/api/dev/reset", (req, res) => {
    db.prepare("DELETE FROM daily_log").run();
    db.prepare("DELETE FROM backpack").run();
    db.prepare("DELETE FROM redemptions").run();
    kvDel("devOverride");
    kvDel("boost");
    kvDel("boosts");
    kvDel("eating");
    kvDel("eatGapUntil");
    res.json({ ok: true });
  });

  // POST /api/dev/redemptions/clear — let today's testers redeem again.
  app.post("/api/dev/redemptions/clear", (req, res) => {
    db.prepare("DELETE FROM redemptions").run();
    res.json({ ok: true });
  });
}
// =========================== END DEV ROUTES =========================

// ---- static frontend (repo root), with private paths blocked ----
const WEB_ROOT = path.join(__dirname, "..");
const BLOCKED = /^\/(server|firmware|reference|tools|design_handoff|node_modules|\.)/;
app.use((req, res, next) => {
  if (BLOCKED.test(req.path)) return res.status(404).json({ error: "not found" });
  next();
});
app.use(express.static(WEB_ROOT, { extensions: ["html"] }));

app.use((req, res) => res.status(404).json({ error: "not found" }));

app.listen(PORT, () => {
  console.log(`Mickey Miles API v2 listening on http://0.0.0.0:${PORT}`);
  console.log(`  trail timezone: ${TRAIL_TZ}`);
});
