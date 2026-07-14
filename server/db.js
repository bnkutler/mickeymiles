/**
 * Mickey Miles — SQLite persistence layer.
 * Everything that must survive a restart lives here: users, daily mileage,
 * powerup redemptions, backpack contents, toast events, and misc kv state.
 */

const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(path.join(DATA_DIR, "mickey.sqlite"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  hair          INTEGER NOT NULL DEFAULT 0,
  skin          INTEGER NOT NULL DEFAULT 0,
  outfit        INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL DEFAULT 0,
  last_love_at  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS daily_log (
  date               TEXT PRIMARY KEY,
  device_miles       REAL NOT NULL DEFAULT 0,
  bonus_miles        REAL NOT NULL DEFAULT 0,
  wheel_minutes      REAL NOT NULL DEFAULT 0,
  last_raw_miles     REAL NOT NULL DEFAULT 0,
  last_raw_wheel_min REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS redemptions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL,
  device_id   TEXT,
  date        TEXT NOT NULL,
  type        TEXT NOT NULL,
  redeemed_at INTEGER NOT NULL,
  gifted      INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, date)
);

CREATE TABLE IF NOT EXISTS backpack (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   TEXT NOT NULL,
  device_id TEXT,
  type      TEXT NOT NULL,
  added_at  INTEGER NOT NULL,
  eaten_at  INTEGER
);

CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  type       TEXT NOT NULL,
  user_name  TEXT NOT NULL DEFAULT '',
  item_type  TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS kv (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

// Migrations for older databases: add columns the current code expects.
function addColumnIfMissing(table, column, decl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
  }
}
addColumnIfMissing("redemptions", "device_id", "TEXT");
addColumnIfMissing("redemptions", "gifted_at", "INTEGER"); // when it was gifted (hourly cooldown)
addColumnIfMissing("backpack", "device_id", "TEXT");       // so we can tell whose gift got eaten
db.exec("CREATE INDEX IF NOT EXISTS idx_redemptions_device ON redemptions(device_id, id)");
db.exec("CREATE INDEX IF NOT EXISTS idx_backpack_device ON backpack(device_id, eaten_at)");

const kvGetStmt = db.prepare("SELECT value FROM kv WHERE key = ?");
const kvSetStmt = db.prepare(
  "INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
);
const kvDelStmt = db.prepare("DELETE FROM kv WHERE key = ?");

function kvGet(key, fallback = null) {
  const row = kvGetStmt.get(key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value);
  } catch {
    return fallback;
  }
}

function kvSet(key, value) {
  kvSetStmt.run(key, JSON.stringify(value));
}

function kvDel(key) {
  kvDelStmt.run(key);
}

function addEvent(type, userName, itemType = "") {
  db.prepare(
    "INSERT INTO events (type, user_name, item_type, created_at) VALUES (?, ?, ?, ?)"
  ).run(type, userName, itemType, Date.now());
  // keep the table small — toasts older than the last 300 are never shown
  db.prepare(
    "DELETE FROM events WHERE id NOT IN (SELECT id FROM events ORDER BY id DESC LIMIT 300)"
  ).run();
}

module.exports = { db, kvGet, kvSet, kvDel, addEvent };
