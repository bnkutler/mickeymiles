/**
 * Mickey Miles — minimal backend
 * POST /api/telemetry — ESP32 uploads metrics (requires shared secret)
 * GET  /api/state     — website reads live tracker + daily log (public read)
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

require("dotenv").config({ path: path.join(__dirname, ".env") });

const PORT = Number(process.env.PORT) || 3000;
const TELEMETRY_SECRET = process.env.TELEMETRY_SECRET || "change-me-in-production";
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const STATE_FILE = path.join(DATA_DIR, "state.json");
const DAILY_FILE = path.join(DATA_DIR, "daily_log.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJson(file, fallback) {
  try {
    const raw = fs.readFileSync(file, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(file, obj) {
  const tmp = `${file}.${crypto.randomBytes(8).toString("hex")}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

function loadDailyLog() {
  return readJson(DAILY_FILE, []);
}

function saveDailyLog(rows) {
  writeJsonAtomic(DAILY_FILE, rows);
}

function upsertDaily(rows, entry) {
  const i = rows.findIndex((r) => r.date === entry.date);
  if (i >= 0) {
    rows[i] = { ...rows[i], ...entry };
  } else {
    rows.push(entry);
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return rows;
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json; charset=utf-8"
  };
}

function send(res, status, body) {
  res.writeHead(status, corsHeaders());
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        if (!raw.trim()) return resolve({});
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function handleTelemetry(body) {
  if (body.secret !== TELEMETRY_SECRET) {
    return { ok: false, error: "invalid secret" };
  }

  const date = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
    ? body.date
    : new Date().toISOString().slice(0, 10);

  const miles = Number(body.milesToday);
  const wheelMinutes = Number(body.wheelMinutesToday);
  const avgSpeedMph = Number(body.avgSpeedMph);
  const speedMph = Number(body.speedMph);
  const isMoving = Boolean(body.isMoving);

  const dailyEntry = {
    date,
    miles: Number.isFinite(miles) ? Math.max(0, miles) : 0,
    wheelMinutes: Number.isFinite(wheelMinutes) ? Math.max(0, wheelMinutes) : 0,
    avgSpeedMph: Number.isFinite(avgSpeedMph) ? Math.max(0, avgSpeedMph) : 0
  };

  let rows = loadDailyLog();
  rows = upsertDaily(rows, dailyEntry);
  saveDailyLog(rows);

  const now = new Date().toISOString();
  const state = {
    isMoving,
    speedMph: Number.isFinite(speedMph) ? Math.max(0, speedMph) : 0,
    lastTelemetryAt: now,
    lastDeviceDate: date
  };
  writeJsonAtomic(STATE_FILE, state);

  return { ok: true };
}

function handleGetState() {
  const state = readJson(STATE_FILE, {
    isMoving: false,
    speedMph: 0,
    lastTelemetryAt: null
  });
  const dailyLog = loadDailyLog();

  const last = state.lastTelemetryAt ? new Date(state.lastTelemetryAt) : null;
  let lastUpdateLabel = "No data yet";
  if (last && !Number.isNaN(last.getTime())) {
    const agoSec = Math.floor((Date.now() - last.getTime()) / 1000);
    if (agoSec < 120) {
      lastUpdateLabel = `Live · ${agoSec}s ago`;
    } else if (agoSec < 3600) {
      lastUpdateLabel = `Live · ${Math.floor(agoSec / 60)}m ago`;
    } else {
      lastUpdateLabel = `Last seen ${last.toLocaleString()}`;
    }
  }

  return {
    tracker: {
      isMoving: Boolean(state.isMoving),
      speedMph: Number(state.speedMph) || 0,
      lastUpdateLabel,
      lastTelemetryAt: state.lastTelemetryAt
    },
    dailyLog
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
    return res.end();
  }

  if (url.pathname === "/api/health" && req.method === "GET") {
    return send(res, 200, { ok: true });
  }

  if (url.pathname === "/api/state" && req.method === "GET") {
    try {
      return send(res, 200, handleGetState());
    } catch (e) {
      return send(res, 500, { error: String(e.message) });
    }
  }

  if (url.pathname === "/api/telemetry" && req.method === "POST") {
    try {
      const body = await parseBody(req);
      const result = handleTelemetry(body);
      if (!result.ok) {
        return send(res, 401, result);
      }
      return send(res, 200, { ok: true });
    } catch (e) {
      return send(res, 400, { error: "bad json", detail: String(e.message) });
    }
  }

  send(res, 404, { error: "not found" });
});

ensureDataDir();
server.listen(PORT, () => {
  console.log(`Mickey Miles API listening on http://0.0.0.0:${PORT}`);
  console.log(`  GET  /api/state`);
  console.log(`  POST /api/telemetry`);
});
