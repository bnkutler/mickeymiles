# Mickey Miles 🐹

Mickey (a black-and-white dwarf hamster) is running the **Pacific Crest Trail** —
2,650 miles from Mexico to Canada — on his wheel. A slotted IR sensor on the
wheel counts revolutions and an ESP32 posts telemetry; this site turns it into
a live pixel-art trail journal that friends and family can join.

The frontend uses a "retro arcade idle-clicker" layout: a full-bleed pixel
scene fills the screen with HUD chips on top (live/location/boost, speed +
today's miles), a right-edge action stack (love / powerup / backpack, all
hand-drawn pixel icons), and a 4-tab bottom dock — **STATUS** (Mickey running
in place over scrolling ground, refueling beside his backpack, or asleep in a
dome tent), **LOG** (day cards with actual-vs-powerup mile breakdowns and
TOTAL / TRUE / LEFT stats over a dimmed scene), **TRAIL** (one tall scrollable
pixel map of the whole PCT with coastline, per-landmark scenery, and a pin on
Mickey's position), and **FRIENDS** (shuffler-style avatar builder, daily
powerup cards, and the bleachers of live viewers).

## Layout

```
index.html, styles.css, js/, icons/, manifest.webmanifest, sw.js   -> static frontend (PWA)
server/                                                            -> Node/Express + SQLite backend
firmware/mickey_tracker/                                           -> XIAO ESP32-S3 sketch
tools/gen_icons.js                                                 -> regenerates the PWA icons
reference/mickey/                                                  -> photos of the real Mickey (art reference)
```

## Running locally

```bash
cd server
cp .env.example .env        # set TELEMETRY_SECRET (must match firmware secrets.h)
npm install
npm start                   # http://localhost:3000 serves the API *and* the site
```

The frontend is plain static files — the server serves the repo root, or host
the root on any static host and point `window.MICKEY_API_BASE` (in
`index.html`) at the API origin.

## API contract

### Device → server

`POST /api/telemetry` — unchanged from v1, the firmware needs no protocol changes.

```json
{
  "secret": "…",             // must equal TELEMETRY_SECRET
  "date": "2026-07-11",      // device-local day (drives the daily log rows)
  "isMoving": true,
  "speedMph": 1.84,          // already median-smoothed on-device
  "milesToday": 0.512,       // cumulative for the day
  "wheelMinutesToday": 22.4, // cumulative for the day
  "avgSpeedMph": 1.4
}
```

Server-side handling worth knowing:
- **Deltas, not overwrites** — daily miles/wheel-time are accumulated from the
  change between reports, so a device reboot (counters back to 0) never erases
  banked miles.
- **Plausibility guards** — a delta implying more than `MAX_PLAUSIBLE_MPH` (6)
  since the previous report is dropped, wheel-time can't exceed the wall-clock
  time that actually passed, real miles are capped at `MAX_DAILY_DEVICE_MILES`
  (12) per trail day, and a device date more than a day off the trail day is
  ignored in favour of the trail day. Rejections are recorded and surfaced by
  `GET /api/health`. See **When the wheel logs nonsense** below for why.
- **Second smoothing pass** — `/api/state` exposes the average of the raw
  speed samples from the last ~18 s, so the speedometer doesn't tick.
- **Powerup multipliers** — while a boost is active, each mile delta banks
  `delta × (multiplier − 1)` bonus miles into that day.

### Site ↔ server

| Endpoint | What it does |
| --- | --- |
| `GET /api/state?userId&since` | Everything in one poll: tracker (smoothed speed), trail-local time + day/night, hamster state (`running`/`refuel`/`sleeping`, current snack, love glow), today's totals, full daily log (with bonus miles), journey totals, active boost, backpack, bleachers (present visitors), powerup catalog, and toast events with `id > since`. Passing `userId` heartbeats presence and returns `you` (today's redemption status). |
| `POST /api/users` | `{name, avatar:{hair,skin,outfit}}` → `{user:{id,…}}`. The id is stored client-side (localStorage) — no passwords. |
| `GET /api/users/:id` | Re-hydrate a stored profile. |
| `POST /api/powerups/redeem` | `{userId, type}` — one per user per trail-local day (`pumpkin_seed` 2×/30 min, `blueberry` 5×/10 min, `chili` 10×/2 min). 409 if already redeemed. |
| `POST /api/backpack/gift` | `{userId}` — puts today's redeemed powerup in Mickey's 6-slot backpack (409 when full). The boost starts once Mickey has eaten it, and **stacks** with anything already running. |
| `POST /api/love` | `{userId}` — only while Mickey rests (refuel/sleep), 6 s per-user cooldown. Everyone sees the smile + toast. |
| `GET /api/health` | Liveness, plus `lastTelemetryAt` / `telemetryAgeSec` and `lastAnomaly` — enough to tell a silent tracker from a misbehaving one without opening a shell. |

### Powerups: stacking, and run-time countdown

Two rules that are easy to get wrong when reading the code:

- **They stack.** Every live powerup contributes; a new gift never replaces the
  one in effect. Bonuses **add** rather than compound, so a 2× and a 5× make
  **6×** (`1 + 1 + 4`), not 10×. Six stacked chillies compounding would be a
  million-×. To change it, make `combinedMultiplier()` multiply instead of sum.
- **Their timers burn run time, not wall-clock time.** `remainingMs` is
  decremented only by wheel motion the device actually reports, so a powerup
  gifted while Mickey sleeps is still whole when he wakes up. A 30-minute
  pumpkin seed means *30 minutes of running* — which, at Mickey's current ~20
  wheel-minutes a night, is well over a day of trail. Retune `durationMs` in
  `POWERUPS` if that's too generous.

`GET /api/state` returns `boost` (combined multiplier, run time left on the
longest, and how many are stacked) plus `boosts`, the full stack.

Game rules living server-side: Mickey is `running` when the wheel moves,
otherwise `refuel` (7:00–19:59 trail time) or `sleeping`. While refueling he
munches a default dark-green Cheerio for 60 s each (with a ~1 s empty-pawed
pause between). When a friend's powerup is waiting in the backpack he finishes
the current Cheerio first, then eats the powerup over 20 s — and the boost
**only takes effect once he's swallowed it** (emitting a "Thanks for the …,
name!" event). Trail timezone (day/night, daily resets) is `TRAIL_TZ`
(default `America/Los_Angeles`) — keep it matching the firmware `TZ_STRING`.

## Dev tools (local testing — remove before launch)

While testing, a small **DEV** bar appears in the top-left corner on every host
(hide it temporarily with `?nodev` in the URL):
- **Auto / Run / Refuel / Sleep** — force Mickey's on-screen state, overriding
  the usual telemetry + time-of-day logic (handy for checking each scene).
- **Seed Log** — loads ~11 fake days of trail history (~2,095 mi, including one
  powerup-boosted day) so the Log, Trail, and Journey views have real content.
- **New Me** — clears your local character (and today's redemptions) so you can
  build a fresh one and gift another powerup.
- **Clear** — wipes the fake history, backpack, redemptions, and any override.

These are backed by `POST /api/dev/state`, `/api/dev/seed`, `/api/dev/reset`,
and `/api/dev/redemptions/clear`, all gated behind `DEV_ENABLED` in `server.js`. **Before going live**, either run
the server with `MICKEY_DEV=0` or delete the two clearly-marked `DEV TOOLS` /
`DEV ROUTES` blocks in `server.js`, the `initDevTools()` function in
`js/app.js`, and the `.dev-bar` markup/styles.

## When the wheel logs nonsense

### What happened (Jul 31 – Aug 6, 2026)

The log picked up ~1,900 phantom miles — days of 337 mi against a real ~0.3 —
and then went silent. The daily totals gave it away by being *too* consistent:

| Day | Miles | Wheel min | Implied pulse rate |
| --- | --- | --- | --- |
| Jul 30 (normal) | 0.438 | 29.0 | bursty, ~0.9 mph |
| Aug 1 | 337.283 | 1088.3 | 19.998 Hz |
| Aug 2 | 337.286 | 1090.1 | 19.998 Hz |
| Aug 5 | 337.346 | 1087.5 | 20.001 Hz |

A hamster does not run 20.000 pulses/sec for five days to four significant
figures. **A 120 Hz light source (mains ripple — a lamp, a charger LED, daylight
through a fan) was reaching the slot sensor.** The ISR's 45 ms debounce
quantises a 8.333 ms flicker to the next whole period ≥ 45 ms — exactly 6 × 8.333
= **50.000 ms, or 20.000 Hz** — which is why every day landed on the same total.

Nothing caught it because 20 Hz reads as ~15.6 mph, just under the firmware's
25 mph reject, and the backend trusted whatever the device sent.

The silence since Aug 5, 20:55 Central is separate: the ESP32 stopped posting
and had no way to recover on its own.

### Fixes

- **Firmware** — `configTzTime` instead of `configTime(0, 0, …)` (the latter
  overwrote `TZ_STRING` and left the device on UTC, rolling every day at 19:00
  Central); NTP re-syncs instead of syncing once at boot; no posting on an
  unsynced clock; wheel time accumulated in whole ms (a float minute counter
  froze around 1,024); a watchdog reboot after 15 min with no successful POST;
  rate-limited serial logging; and a two-part phantom-pulse guard that freezes
  the counters when pulses are metronome-regular (400 intervals within 3 ms of
  each other) or never pause for 45 minutes.
- **Backend** — the plausibility guards described above, which hold regardless
  of what the firmware sends.

## Is the mileage right?

Miles are just `pulses × MILES_PER_PULSE`, and `MILES_PER_PULSE` is
`(diameter × π ÷ 160934) ÷ FLAGS_PER_REV`. Only three things can make the
total wrong, and only one of them is checkable from a desk.

**1. The wheel constants.** `mickey_tracker.ino` assumes a **20 cm** diameter;
`firmware/tests/t3_rev_count.ino` says **28 cm**. One is wrong, and if it's the
firmware, every mile is 40% low. Measure the **inner running surface** — the
band Mickey's feet actually touch — not the outer rim, and set line 43 from it.

**2. `FLAGS_PER_REV`.** Set to 2. If only one flag exists, or the sensor
reliably catches one of the two, every mile is exactly **half** of reality.

**3. Missed passes.** A trim pot on the LM393 sets the comparator threshold. Set
too near the edge it both drops real passes (undercount) *and* oscillates on
supply ripple — which is what produced the Jul 31 phantom run. One adjustment
explains both symptoms.

### Calibrating

Flash `firmware/tests/t3_rev_count`, then turn the wheel **by hand, exactly 20
revolutions, slowly**:

| Count | Meaning |
| --- | --- |
| 40 | Correct — 2 flags, no misses |
| 20 | Only one flag is being seen: all history is 2× low |
| 37–39 | Dropping passes: adjust the trim pot |
| 45+ | Double-counting: raise `DEBOUNCE_MS` |

Repeat spinning it fast. A beam-break should count identically at both speeds.

Once you know the truth, `--scale` corrects the history rather than discarding
it (`--scale 1.4` for a 28 cm wheel that was logged as 20 cm). Going forward the
raw pulse count is stored per day in `daily_log.device_pulses` and exposed as
`pulses` on each log row, so miles can always be re-derived from the sensor
data rather than being a one-way calculation.

### What the firmware was getting wrong

Two measurement bugs, both fixed, both found by simulating the sketch's own code:

- **Wheel time was padded by 6 seconds per bout.** Time accrued while the wheel
  "looked busy", which included the whole `STOPPED_AFTER_MS` timeout after each
  bout ended — **+49%** on a night of ten-second bouts, which also dragged the
  reported average speed down. Time is now the sum of gaps between consecutive
  pulses: 99% accurate across bout lengths.
- **The first pulse after a rest was treated as a stride.** Its interval is the
  length of the *rest* — possibly minutes — so it read as ~0 mph and suppressed
  the start of every bout. Long intervals are now rejected from the speed window.

Note that both bugs affected *time*, not distance. Distance has always been a
straight pulse count, so if the total looks low, it's one of the three causes
above — most likely the wheel diameter.

### Repairing the log

`server/scripts/repair-log.js` deletes or zeroes a range of days. It is a dry
run until you pass `--apply`, which snapshots the database first. Run it from
the Render **Shell** (`cd /opt/render/project/src/server`), where `DATA_DIR`
already points at the persistent disk:

```bash
node scripts/repair-log.js --list                                  # show every day
node scripts/repair-log.js --from 2026-07-31 --to 2026-08-06       # preview
node scripts/repair-log.js --from 2026-07-31 --to 2026-08-06 --apply
```

Deleting the range drops those days entirely; `--zero` keeps the rows at 0 if
you'd rather the log show them. Mickey's trail position is derived from the sum
of the log, so it moves back on its own.

## Deploying (Render)

One service serves both the API and the site (same origin — no CORS, one deploy).

1. **Web service** from this repo: root directory `server`, build `npm install`,
   start `npm start`.
2. Env vars:
   - `TELEMETRY_SECRET` — long random string; must match the firmware `secrets.h`.
   - `TRAIL_TZ` — e.g. `America/Los_Angeles`; must match the firmware `TZ_STRING`.
   - `MICKEY_DEV=0` — **set this in production** to hide the DEV bar and disable
     the `/api/dev/*` endpoints.
3. **Persistence:** SQLite lives at `server/data/mickey.sqlite`. Render's **free**
   tier has an *ephemeral* disk, so users/backpack/log/journey reset on every
   redeploy (and periodic instance recycles) — fine for a demo, not for a
   months-long journey. To keep data, use the **Starter** plan ($7/mo), attach a
   **Persistent Disk** (mount e.g. `/var/data`), and set `DATA_DIR=/var/data`.
   Because the device POSTs every 5 s, the web service never idles/spins down.
4. Leave `window.MICKEY_API_BASE = ""` in `index.html` (same origin). Only set a
   URL there if you host the frontend separately from the API.
5. Point the firmware `API_BASE_URL` at the service URL and flash.

## Firmware notes

`firmware/mickey_tracker/mickey_tracker.ino` (Seeed XIAO ESP32-S3): interrupt-
counted slot-sensor pulses; speed comes from the **median of the last 6 pulse
intervals** (impossible >25 mph intervals rejected before entering the window)
with a gentle per-pulse blend — no more single-revolution jitter. Stopped
detection (decay after 6 s idle) is unchanged. Copy `secrets_template.h` →
`secrets.h` to configure Wi-Fi/API/timezone.

## Icons

`node tools/gen_icons.js` regenerates `icons/` (dependency-free PNG encoder).
