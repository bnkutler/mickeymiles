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
| `POST /api/backpack/gift` | `{userId}` — puts today's redeemed powerup in Mickey's 6-slot backpack (409 when full) **and activates the boost** (one boost at a time; the newest gift overrides). |
| `POST /api/love` | `{userId}` — only while Mickey rests (refuel/sleep), 6 s per-user cooldown. Everyone sees the smile + toast. |
| `GET /api/health` | Liveness. |

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
