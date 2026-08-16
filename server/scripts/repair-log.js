#!/usr/bin/env node
/**
 * Mickey Miles — daily log repair tool.
 *
 * Deletes (or zeroes) bogus days from `daily_log` when the wheel sensor logs
 * garbage — e.g. the Jul 31 – Aug 6 phantom-pulse run, where a 120 Hz light
 * source flickering into the slot sensor produced a rock-steady 20 pulses/sec
 * around the clock (~337 mi/day against a real ~0.3 mi/day).
 *
 * Safe by default: prints what it *would* do and changes nothing until you
 * pass --apply, which snapshots the database first.
 *
 *   node scripts/repair-log.js --list
 *   node scripts/repair-log.js --from 2026-07-31 --to 2026-08-06
 *   node scripts/repair-log.js --from 2026-07-31 --to 2026-08-06 --apply
 *
 * Flags:
 *   --list              show every day in the log, then exit
 *   --from / --to       inclusive YYYY-MM-DD range to repair
 *   --zero              keep the rows but set all counters to 0 (default: delete)
 *   --apply             actually write (backs up the DB first)
 *   --no-backup         skip the snapshot (not recommended)
 *
 * On Render: open the service Shell, `cd /opt/render/project/src/server` (the
 * service's rootDir), then run the commands above. DATA_DIR is already set in
 * the environment, so the script opens the same database the live server uses.
 */

const fs = require("fs");
const { db } = require("../db");

// ------------------------------------------------------------------ arg parse

function parseArgs(argv) {
  const args = { zero: false, apply: false, backup: true, list: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--list") args.list = true;
    else if (a === "--zero") args.zero = true;
    else if (a === "--apply") args.apply = true;
    else if (a === "--no-backup") args.backup = false;
    else if (a === "--from") args.from = argv[++i];
    else if (a === "--to") args.to = argv[++i];
    else if (a === "--help" || a === "-h") args.help = true;
    else {
      console.error(`unknown argument: ${a}`);
      process.exit(1);
    }
  }
  return args;
}

// Shape *and* validity — "2026-13-99" is the right shape but not a date, and
// silently comparing it as a string gives a baffling error later.
function isDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || "")) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
const args = parseArgs(process.argv.slice(2));

if (args.help) {
  const header = fs.readFileSync(__filename, "utf8").split("*/")[0];
  console.log(header.replace(/^#!.*\n/, "").replace(/^\/\*\*?$|^ \*\/?|^ \* ?/gm, "").trim());
  process.exit(0);
}

// ------------------------------------------------------------------- reporting

const fmt = (n, d = 3) => Number(n).toFixed(d).padStart(10);

function allRows() {
  return db.prepare("SELECT * FROM daily_log ORDER BY date ASC").all();
}

function totalOf(rows) {
  return rows.reduce((sum, r) => sum + (r.device_miles || 0) + (r.bonus_miles || 0), 0);
}

function printRows(rows, marked = new Set()) {
  console.log("  date          miles      bonus   wheelMin     avgMph");
  for (const r of rows) {
    const miles = (r.device_miles || 0) + (r.bonus_miles || 0);
    const avg = r.wheel_minutes >= 0.5 ? r.device_miles / (r.wheel_minutes / 60) : 0;
    const flag = marked.has(r.date) ? "  <-- REMOVE" : "";
    console.log(
      `  ${r.date} ${fmt(miles)} ${fmt(r.bonus_miles)} ${fmt(r.wheel_minutes, 1)} ${fmt(avg, 2)}${flag}`
    );
  }
}

const before = allRows();

if (args.list || (!args.from && !args.to)) {
  console.log(`\nDaily log — ${before.length} day(s), ${totalOf(before).toFixed(2)} total miles\n`);
  printRows(before);
  if (!args.list) {
    console.log("\nNothing to do: pass --from YYYY-MM-DD --to YYYY-MM-DD to repair a range.\n");
  }
  process.exit(0);
}

for (const [flag, value] of [["--from", args.from], ["--to", args.to]]) {
  if (!isDate(value)) {
    console.error(`${flag} must be a real date as YYYY-MM-DD (got ${value === undefined ? "nothing" : value})`);
    process.exit(1);
  }
}
if (args.from > args.to) {
  console.error("--from must not be after --to");
  process.exit(1);
}

// --------------------------------------------------------------------- preview

const doomed = before.filter((r) => r.date >= args.from && r.date <= args.to);
const survivors = before.filter((r) => r.date < args.from || r.date > args.to);

if (!doomed.length) {
  console.log(`\nNo rows between ${args.from} and ${args.to} — nothing to do.\n`);
  process.exit(0);
}

const doomedDates = new Set(doomed.map((r) => r.date));
console.log(`\nDatabase: ${db.name}`);
console.log(`Range:    ${args.from} .. ${args.to}  (${args.zero ? "zero out" : "delete"})\n`);
printRows(before, doomedDates);
console.log(
  `\n  removing ${doomed.length} day(s) / ${totalOf(doomed).toFixed(2)} miles` +
    `\n  journey total  ${totalOf(before).toFixed(2)}  ->  ${totalOf(survivors).toFixed(2)} miles` +
    `\n  days on trail  ${before.filter((r) => totalOf([r]) > 0).length}  ->  ` +
    `${survivors.filter((r) => totalOf([r]) > 0).length}\n`
);

if (!args.apply) {
  console.log("Dry run — nothing was changed. Re-run with --apply to commit.\n");
  process.exit(0);
}

// ----------------------------------------------------------------------- apply

if (args.backup) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = `${db.name}.backup-${stamp}`;
  db.backup(dest)
    .then(() => {
      console.log(`Backup written: ${dest}`);
      commit();
    })
    .catch((err) => {
      console.error(`Backup failed, aborting: ${err.message}`);
      process.exit(1);
    });
} else {
  commit();
}

function commit() {
  const run = db.transaction(() => {
    if (args.zero) {
      db.prepare(
        `UPDATE daily_log
            SET device_miles = 0, bonus_miles = 0, wheel_minutes = 0,
                last_raw_miles = 0, last_raw_wheel_min = 0
          WHERE date >= ? AND date <= ?`
      ).run(args.from, args.to);
    } else {
      db.prepare("DELETE FROM daily_log WHERE date >= ? AND date <= ?").run(args.from, args.to);
    }
  });
  run();

  const after = allRows();
  console.log(`\nDone. ${after.length} day(s) remain, ${totalOf(after).toFixed(2)} total miles.\n`);
  printRows(after);
  console.log("");
  process.exit(0);
}
