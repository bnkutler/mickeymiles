# Handoff: Mickey Miles — Idle-Clicker Redesign (Retro Arcade)

## Overview
Mickey Miles tracks a pet hamster's progress along the Pacific Crest Trail (2,650 mi) via
IR-sensor telemetry from a wheel. This handoff covers a redesign of the frontend toward an
"idle clicker mobile game" aesthetic: full-bleed pixel-art scenes with HUD chrome around the
edges instead of the original stacked-card layout.

**Only 5 screens from the design exploration are in scope for this handoff:**
- **2a** — Status (main/home screen)
- **2b** — Daily Log
- **3a** — Trail Map
- **3b** — Friends & Fam: Character Setup
- **3c** — Friends & Fam: Home (powerups + crowd)

Ignore any other screens/options (1a/1b/1c, 2c) present in the bundled HTML file — those were
earlier exploration variants superseded by the 5 above.

## About the Design Files
The bundled `Status Screen Redesign.dc.html` is a **design reference** built as a single
streaming "Design Component" prototype tool (a proprietary authoring format from the design
tool this was built in) — it is **not** production code and should not be copied verbatim.
Treat it as a high-fidelity, interactive mock: recreate the 5 screens listed above in your
app's real environment (its existing frontend stack/framework, component patterns, state
management, and API layer), using its established conventions. Where the mock uses demo/static
data, wire it to your real `/api/state`, `/api/telemetry`, etc. endpoints per your app's
existing API contract.

The four `.js` files bundled alongside it (`pixel.js`, `mickey.js`, `landmarks.js`, `scenes.js`)
are **your own original app's existing pixel-art renderer** — copied in unmodified except for
one mechanical change (`const` → `var` at top level, done only so this prototype tool could
safely re-run the scripts; irrelevant to your codebase). These are the real source of truth for
Mickey's sprites, the 45 PCT landmark scene configs, and the procedural scene painter. Reuse
them as-is; do not reimplement the pixel art.

## Fidelity
**High-fidelity.** Colors, typography, spacing, and the pixel-art rendering are final-intent.
Demo data (mileage numbers, log rows, bleacher names) is illustrative — replace with live data
from your existing API.

## Design Tokens

**Fonts** (Google Fonts, already used by the existing app):
- `"Press Start 2P"` — all caps HUD labels, headers, buttons, stat numbers
- `"VT323"` — body copy, list rows, names, mileage detail text

**Retro Arcade palette** (used across 2a/2b/3a/3b/3c):
- `#1b2218` — bezel/border, dock background
- `#060905` — deepest shadow / inset ring
- `#647256` — chip/border stroke (muted olive)
- `#4a5640` / `#47553f` / `#4d5943` — card/row borders
- `#8cbc72` — accent green (live indicator, active glow)
- `#d9be79` — gold accent (mileage, borders, powerup highlight)
- `#e0d59c` — HUD readout text (speed, stats)
- `#e26a7a` — love/heart accent (pink-red)
- `#c0c5ae` — secondary/muted text
- `#f4f7e5` / `#f2f1e7` — bright HUD text (active states)
- Phone/card background for 3b & 3c: `#343d29` (lightened olive — intentionally NOT
  near-black, contrasts with the darker `#1b2218` bezel)
- Ocean (3a map): `#3f6f8f`; land: `#5e7a4a` with `#527048`/`#6d8a58` speckle texture

**Chrome/shape language:**
- Phone canvas: 390×844 CSS box, 14px solid `#1b2218` border, `border-radius: 6px` (hard,
  console-like — not soft/rounded), `box-shadow: 0 20px 45px rgba(0,0,0,0.4), inset 0 0 0 3px #060905`
- A subtle scanline overlay sits over every full-bleed scene: `repeating-linear-gradient(rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(0,0,0,0.08) 3px)` with `mix-blend-mode: multiply`
- HUD chips: 2px solid border, dark translucent background (`rgba(10,14,8,0.7–0.78)`), no
  border-radius (hard corners throughout — this is a deliberate departure from the rest of the
  app's rounded-corner conventions)
- Buttons/cards use a "pressed key" shadow: `box-shadow: 0 3–4px 0 #11170f` (flat drop, not blur)

## Screens

### 2a — Status (home screen)
**Purpose:** Primary screen. Shows Mickey live on the trail (running / refueling / sleeping),
his current location, speed, and today's mileage; primary actions (love / powerup / backpack);
bottom tab nav.

**Layout:** Full-bleed canvas background (see "Scene rendering" below) filling the entire
390×844 screen edge-to-edge. All other UI is absolutely positioned HUD chrome on top:
- **Top-left**, stacked 6px apart: a `● LIVE` chip, and below it a location chip containing a
  small (16×16) pixel pin icon + the current landmark name in caps (Press Start 2P, 7px, gold
  `#e0d59c`).
- **Top-right:** a single chip, right-aligned, two lines: big readout (Press Start 2P, 14px,
  gold, `text-shadow: 2px 2px 0 rgba(0,0,0,0.5)`) = current MPH; small line below (7px,
  `#c0c5ae`) = "MPH · X.XX MI" (today's mileage).
- **Right edge, vertically centered:** 3 stacked 64×64 square buttons, 14px gap, each a 2px
  bordered dark button (`linear-gradient(180deg,#2e3a29,#212a1e)`, border color `#a86a74` for
  love / `#6e7b52` for the other two) containing a centered pixel-art icon (see Icons below):
  Love (heart), Powerup (lightning bolt), Backpack.
- **Bottom edge:** a 4-column grid dock, full width, dark background (`#1b2218`), 2px top
  border, 10px padding, 2px gaps between cells. Each cell is a button: STATUS / LOG / TRAIL /
  FRIENDS (Press Start 2P, 8px). The active tab (STATUS here) has a lighter gradient
  background (`linear-gradient(180deg,#364230,#252e22)`), brighter border (`#b8c78d`), and a
  soft text-shadow glow; inactive tabs are flat `#1b2218` / border `#4a5640` / muted text.

**Scene rendering (the full-bleed background):** This is a canvas, ~460×996 internal resolution
(roughly 2× the 390×844 display size, for crisper pixel art), `image-rendering: pixelated`.
It draws the existing procedural landmark scene (sky bands, sun/moon+stars, distant
silhouette — mountains/hills/etc per landmark, ground, dirt trail band) via the app's own
`renderScene(canvas, landmark, isNight)` from `scenes.js`, using whichever `LANDMARKS` entry
(from `landmarks.js`) matches the hamster's current mileage. On top of the cached scene image,
draw Mickey each frame based on his current state:
- **Running:** Mickey stays at a **fixed screen position** (~36% across, standing on the dirt
  trail band which sits at `86%` of the canvas height) using `drawMickeyRun` from `mickey.js` —
  do NOT move him across the screen. Instead, animate the **ground/foreground scrolling
  right-to-left** underneath/behind him (small grass-tuft and pebble marks drifting backward) to
  sell forward motion, plus 2–3 small dust-puff pixels trailing behind his feet. Leg-frame
  cycling speed and ground scroll speed should both derive from his current MPH using the same
  formulas as the existing app's `drawStage()` (`frameMs = max(80, 235 - mph*22)`;
  `scrollPxPerSec = 26 + min(8,mph)*16`) — don't use independent/mismatched constants for the
  two, or the run will feel unsynced.
- **Refueling:** `drawMickeySit` front-view sprite, holding/nibbling a food item (`drawFood`),
  with `drawBackpackProp` showing 1–2 upcoming snacks beside him.
- **Sleeping:** a **low, rounded dome tent** (explicitly NOT the tall pointy A-frame silhouette —
  redraw the tent as a flattened dome: rounded silhouette via `sqrt(1-(1-t)^1.6)` taper, roughly
  `height ≈ width * 0.55`, with a small rounded doorway arc, not a sharp triangular peak) with
  `drawMickeySleep` curled inside.
- If "loved" (someone sent a love tap), draw 2 small rising/fading pixel hearts near Mickey
  regardless of state.

**Icons (pixel-art, not emoji):** Love/Powerup/Backpack must be small hand-authored pixel-grid
icons drawn on a 24×24 canvas via the existing `drawGrid()` helper (in `pixel.js`) — NOT emoji
glyphs. Reference grids (`H`/`L`/`B` = fill color, lowercase = a `shade()`-darkened accent,
`.` = transparent):
- **Heart** (7×8 grid): fills most of the 24×24 box, color `#e26a7a` with a lighter shaded
  highlight row.
- **Lightning bolt** (9×10 grid, diagonal zigzag): color `#f2df9e` with a darker shaded trailing
  edge for a faceted look — a simple "Z" 2-stripe bolt reads poorly at this size; use the fuller
  zigzag captured in `mickey.js`/the handoff HTML's `drawPixelBolt`.
- **Backpack** (8×10 grid): main color `#c9713d`, darker seam/pocket outline `shade(color,0.7)`,
  lighter pocket accent `#e0b26a`.
- A **location pin** icon (used at 16×16 in the top-left location chip) is a filled circle with
  a tapered point and a dark "hole" — see `drawPixelPin` in the handoff file.
- All three action-button icons should be tweakable in scale (a size multiplier, ~0.7–1.4×) so
  they can be nudged to fill their 64×64 buttons without redoing the artwork.

### 2b — Daily Log
**Purpose:** Historical log of days run, each day's mileage (broken out into actual vs.
powerup-boosted), wheel time, avg speed, and milestone callouts when a landmark is crossed.

**Layout:** Same phone chrome (bezel, scanline, bottom dock — LOG tab active) as 2a, but:
- **No** live/location chip and **no** canvas scene as the literal background — instead the
  canvas renders the current landmark's scene **dimmed** (a `rgba(8,10,6,0.62)` black overlay on
  top of the rendered scene) as atmospheric backdrop behind the list.
- **Top area** (full width, 14px padding): 3 equal-width stat chips in a row, each 2px-bordered,
  dark translucent background: **TOTAL MI** (gold `#e0d59c`), **TRUE MI** (green `#8cbc72`),
  **MI LEFT** (dusty red `#d98787`). Numbers in Press Start 2P 12px, labels 7px muted below.
- **Below that:** a scrollable list, header "DAILY LOG" (Press Start 2P, 11px, bright), then
  one card per day: date (VT323 17px) · total miles for that day in bold gold (Press Start 2P
  9px) · wheel time · avg speed, all in one row. **If that day included a powerup boost**, a
  second line appears inside the same card: `actual X.X mi` (green) and `+X.X mi powerup` (gold),
  side by side. Milestone days (a landmark was crossed) get an extra full-width banner below the
  card: gradient gold/green background, gold border, "🏔 Reached <name> — mile <n>".

**Mileage math (must be implemented, not just displayed):**
- Each day has an **actual** (physical wheel-turned) mileage and a **bonus** (powerup-boosted)
  mileage, which may be 0.
- **True Miles** (the "TRUE MI" stat) = sum of **actual** mileage only, across the whole trip.
- **Total Miles** (the "TOTAL MI" stat, and the number shown per log row) = actual + bonus,
  summed across the trip.
- **Miles Left** = `2650 - Total Miles` (i.e. powerup bonus miles DO count toward progress on
  the trail and reduce miles left; only "True Miles" tracks the hamster's literal physical
  effort separately).
- This mirrors the existing backend's real powerup mechanic (see main app README: "Powerup
  multipliers — while a boost is active, each mile delta banks `delta × (multiplier − 1)` bonus
  miles into that day") — wire this screen to that real data rather than reintroducing new
  business logic.

### 3a — Trail Map
**Purpose:** A single continuous, vertically scrollable, low-detail stylized map of the entire
PCT (Mexico → Canada), replacing the old flat text list of landmarks.

**Layout:** Same phone chrome, TRAIL tab active in the dock. **No top chips at all** — the map
canvas fills the entire screen from the very top down to the bottom dock. The canvas itself is
tall (~460×2680 at this scale — roughly 3.2× the screen height) inside a container with
`overflow-y: auto`, so the phone screen shows a viewport onto it and the user scrolls to see the
whole trail.

**Map rendering, bottom-to-top = Mexico-to-Canada** (matches the existing app's Journey tab
convention: north/Canada at the top):
- **Ocean** fills the full canvas width with a flat blue (`#3f6f8f`); **land** occupies the
  right ~78% of the width with a gently wobbling coastline (combine a couple of sine waves plus
  low-frequency hash noise for the wobble — don't make it perfectly smooth/geometric). Add a
  speckled, patchy texture on the land (small random-placed 3–4px darker/lighter dabs) for
  visual richness — explicitly **do not** use any periodic/evenly-spaced texture (e.g. a
  color band every N pixels): that reads as visible horizontal striping and should be avoided.
  Draw a thin (~2px) highlight strictly along the coastline edge itself, not as a repeating
  dashed pattern down the whole height.
- **One row per landmark** (45 total, from `LANDMARKS` in `landmarks.js`), evenly spaced
  vertically down the tall canvas (equal pixel spacing per landmark index — not proportional to
  the real mile gaps, which vary too much to keep labels legible).
- **The trail path** is a single smooth, organic, non-repeating curve threading through every
  landmark's position — derive each landmark's horizontal offset from a noise function (not a
  clean repeating sine wave, which reads as artificial/random rather than a real trail), then
  connect the points with a smoothed curve (e.g. quadratic-curve-through-midpoints) rendered as
  a thick dashed tan line (`#e8d9b0`, dash pattern, rounded caps).
- **Scenery per landmark**, drawn from that landmark's *own* data (not arbitrary decoration):
  if its `far.kind` is a mountain-ish silhouette (`mountains`/`peak`/`jagged`/`volcano`/`cones3`/
  `ridge`/`domes`/`spires`/`craterRim`), draw a small mountain/cone silhouette beside its point
  (reuse the existing `farCone()` painter from `scenes.js`); if its `motifs` include
  `pines`/`firs`/`oaks`/`joshua`, draw 1–2 small pine-tree silhouettes (reuse the existing
  `pine()` painter). This keeps the map's scenery accurate to what that stretch of trail
  actually looks like in the main Status scene.
- **Each landmark** gets a small pixel pin (bigger/red-accented if it's the hamster's *current*
  position) plus its name (VT323, ~20px, or 16px if the name is long) and "mile N" (VT323,
  ~16px, muted) to the right of the pin. Text sizes here are intentionally larger than the
  original app's tiny Press-Start-2P trail list for legibility at a glance while scrolling.
- **State/region divider lines:** two dashed lines (California/Oregon around mile 1700,
  Oregon/Washington around mile 2150) — **no text labels on them** (the landmark pins/names
  already carry location context) — and each line must **start exactly at that row's land edge**
  (use the same coastline-wobble function to find the correct x, don't run into the ocean) and
  extend to the right edge of the canvas.
- **"CANADA"** and **"MEXICO"** endpoint labels (Press Start 2P, ~13px, gold) at the very top and
  bottom of the map only — don't duplicate these with a border line/label at the same position.

### 3b — Friends & Fam: Character Setup
**Purpose:** First-time flow where a new visitor names themselves and builds a pixel avatar
before they can cheer Mickey on or send powerups.

**Layout:** Same bezel, but the phone's inner background is the lighter olive `#343d29` (not
the near-black used elsewhere) — and there is **no top LIVE chip** on this screen. Content is a
single vertically scrollable, centered column:
1. Header: "JOIN THE TRAIL CREW" (Press Start 2P, 12px) + one line of subcopy (VT323, 15px,
   muted).
2. **A large avatar preview** — bigger than the original app's small 96×118 builder preview.
   Render at roughly 176×216 (scale ≈13) inside a bordered box (`3px solid #55624a`, inset
   shadow), centered.
3. A single **Name** text field (VT323 18px, dark input background `#171d14`, 2px border).
4. **Three shuffler rows**, one per customizable attribute — **not** a grid of swatches. Each
   row is a bordered bar (`2px solid #5a684c`, `#1b2218` background) with a left ◀ arrow, a
   centered Press Start 2P label, and a right ▶ arrow:
   - `◀ HAIR / HAT ▶`
   - `◀ SKIN ▶`
   - `◀ OUTFIT ▶`
   Pressing an arrow cycles that attribute's index (wrapping 0–5, matching the existing 6
   options per category already defined in `mickey.js`: `AVATAR_HAIR_LABELS`, `AVATAR_SKINS`,
   `AVATAR_OUTFITS`) and immediately redraws the big preview via the existing `drawAvatar()`
   function. Arrow glyphs are plain ◀/▶ characters in Press Start 2P (no custom icon needed —
   the font's blockiness already reads as pixel-art).
5. A full-width "CHECK IN ✓" button (Press Start 2P 11px, gold border, dark gradient fill,
   pressed-key shadow) at the bottom, matching the big-button style used elsewhere in the app.

### 3c — Friends & Fam: Home
**Purpose:** Returning-visitor screen: greet them, let them pick today's one powerup, gift it
into Mickey's backpack, and show who else is watching live ("the bleachers").

**Layout:** Same lighter `#343d29` background, no top LIVE chip, FRIENDS tab active in the dock.
Scrollable column:
1. **"Me" row:** small avatar (52×66, via `drawAvatar`) + "HEY, <NAME>!" (Press Start 2P 11px)
   + one line of muted subcopy about the once-per-day powerup rule, inside a bordered card.
2. **"PICK TODAY'S POWERUP"** header, then a 3-column grid of powerup cards. Each card: a 32×32
   pixel-art food icon (reuse the existing `drawFood()` / `FOOD_SPRITES` from `mickey.js` — do
   **not** use emoji for these either), the powerup name in caps (Press Start 2P 7px), and below
   it the effect in **larger, bolder** text than the original app used: format as
   `"{multiplier}x Miles"` (VT323, 18px, bold, gold `#d9be79`) on one line, then
   `"{duration} min"` (VT323, 13px, muted) on the next — e.g. "5x Miles" / "10 min". The selected
   card gets a gold border + glow; unpicked cards are flat dark. Below the grid, a full-width
   "🎒 Pack it in Mickey's Backpack" button (disabled/relabeled if the backpack is full, per the
   existing app's real rule of a 6-slot backpack).
3. **"ON THE BLEACHERS"** header, then a horizontally-scrollable row of everyone currently
   watching: each seat is a small avatar (drawn ~44×56) + their name (VT323 13px, truncated with
   ellipsis if long) in a bordered strip with a subtle two-tone "stadium seating" gradient
   background (`linear-gradient(0deg, #2a2418 0 12px, transparent 12px)` over a faint white
   wash) — matches the existing app's `.bleachers` treatment.

## Assets
- All avatars, Mickey sprites, food icons, and landmark scene painters are **already in your
  codebase** — see the bundled `mickey.js`, `scenes.js`, `landmarks.js`, `pixel.js`. Nothing new
  needs to be drawn; the redesign only changes chrome/layout around this existing pixel art.
- New pixel-art assets introduced by this redesign (heart / lightning bolt / backpack / pin
  icons for the HUD) are defined as small string-grid sprites directly in the handoff HTML
  (`drawPixelHeart`, `drawPixelBolt`, `drawPixelPack`, `drawPixelPin`) — port these grids as-is
  using your own `drawGrid`-equivalent helper (or the bundled `pixel.js` one).
- Fonts: Google Fonts `Press Start 2P` and `VT323` (already loaded by the existing app).

## Files
- `Status Screen Redesign.dc.html` — the full interactive design reference (contains extra
  exploration screens beyond the 5 in scope — see Overview above for which ids to build)
- `pixel.js`, `mickey.js`, `landmarks.js`, `scenes.js` — your existing pixel-art renderer,
  copied in unmodified (aside from the `const`→`var` note above)
