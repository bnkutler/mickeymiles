/**
 * Mickey sprites — drawn to match the real Mickey (black-and-white dwarf
 * hamster): black cap over the head/eyes and ears, white muzzle and chin,
 * a white band across the shoulders, black saddle, white belly, pink nose
 * and feet. Asymmetric on purpose.
 */

const MICKEY_PAL = {
  K: "#2b2623", // black fur
  k: "#191512", // black fur shadow
  W: "#f6f3ea", // white fur
  w: "#d8d1bf", // white fur shade
  P: "#e8a49d", // pink (ears, feet)
  p: "#c67f78", // pink shade
  N: "#ef8f93", // nose
  E: "#171214", // eye
  ".": null
};

// ---- side view, facing right, 28 x 14 body + leg rows per frame ----

const MICKEY_RUN_BODY = [
  "....................KK......",
  "...................KPpK.....",
  "..............KKKKKKKKKK....",
  "............kKKKKKKKKKKKK...",
  "..........kKKWWKKKKKKKKKKK..",
  ".........kKKWWWWKKKKKEEKKK..",
  "........kKKWWWWWKKKKKEEWWW..",
  ".......kKKWWWWWWKKKKKWWWWWN.",
  "......kKKWWWWWWWKKKKWWWWWWNN",
  "......kKKWWWWWWWKKKWWWWWWWW.",
  ".....kKKWWWWWWWWKKWWWWWWWW..",
  ".....kKWWWWWWWWWWWWWWWWWw...",
  ".....kKWwWWWWWWWWWWWWWWw....",
  "......kWwwWWWWWWWWWWWww....."
];

// Simple two-leg gallop, 3 rows per frame: neutral -> extended -> neutral ->
// tucked. One near-side front leg and one back leg, so the gait reads clearly
// without a busy tangle of limbs.
const MICKEY_RUN_LEGS = [
  [
    ".......WW........WW.........",
    ".......WW........WW.........",
    ".......PP........PP........."
  ],
  [
    "......WW..........WW........",
    ".....WW............WW.......",
    "....PP..............PP......"
  ],
  [
    ".......WW........WW.........",
    ".......WW........WW.........",
    ".......PP........PP........."
  ],
  [
    "........WW......WW..........",
    ".........WW....WW...........",
    "..........PP..PP............"
  ]
];

// ---- front view (refueling), 20 x 19 ----

const MICKEY_SIT = [
  ".KKK............KKK.",
  "KKPPK..........KPPKK",
  ".KKKKKKKKKKKKKKKKKK.",
  "KKKKKKKKKWWKKKKKKKKK",
  "KKKEEKKKKWWKKKKEEKKK",
  "KKKEEKKKWWWWKKKKEEKK",
  "kKKKKKWWWWWWWWKKKKKk",
  "kKKKWWWWNNWWWWWKKKKk",
  "kKKWWWWWwwWWWWWWKKKk",
  ".kKWWWWWWWWWWWWWWKk.",
  ".kKKWWWWWWWWWWWWKKk.",
  "kKKKWWWWWWWWWWWWKKKk",
  "kKKWWWWWWWWWWWWWWKKk",
  "kKKWWWWWWWWWWWWWWKKk",
  "kKKWWWWWWWWWWWWWWKKk",
  ".kKWWWWWWWWWWWWWWKk.",
  ".kKKWWWWWWWWWWWWKKk.",
  "..kPPWWWWWWWWWWPPk..",
  "...pp..........pp..."
];

// ---- sleeping (side, curled), 24 x 10 ----

const MICKEY_SLEEP = [
  ".......KKKKKKKKK........",
  ".....KKKKKKKKKKKKKK.....",
  "....KKKWWWWKKKKKKKKKK...",
  "...kKKWWWWWWWKKKKKKKKK..",
  "..kKKWWWWWWWWWKKkkKKKKN.",
  "..kKWWWWWWWWWWWKKKKKWWN.",
  "..kKWWWWWWWWWWWWKKWWWW..",
  "..kKWwWWWWWWWWWWWWWWw...",
  "...kWwwWWWWWWWWWWWww....",
  "....kwwwwWWWWWwwww......"
];

// ---- food items, 8 x 8 grids ----

const FOOD_SPRITES = {
  cheerio: {
    pal: { G: "#24391b", g: "#162611", h: "#33512a", ".": null },
    rows: [
      "..GGGG..",
      ".GhhhhG.",
      "GhhGGhhG",
      "GhGggGhG",
      "GhGggGhG",
      "GhhGGhhG",
      ".GhhhhG.",
      "..GGGG.."
    ]
  },
  pumpkin_seed: {
    pal: { t: "#b08e5a", C: "#ecdcae", c: "#d4bd85", ".": null },
    rows: [
      "....tt..",
      "...tCCt.",
      "..tCCCt.",
      ".tCCCCt.",
      ".tCCCct.",
      "tCCCct..",
      "tCcct...",
      ".tt....."
    ]
  },
  blueberry: {
    pal: { B: "#4f6fb5", b: "#3a5490", d: "#2a3f6e", h: "#7f9ad4", ".": null },
    rows: [
      "...dd...",
      "..bddb..",
      ".BBbbBB.",
      "BBhBBBBB",
      "BBBBBBBb",
      "BBBBBBbb",
      ".BBBBbb.",
      "..bbbb.."
    ]
  },
  chili: {
    pal: { g: "#4f7a3a", G: "#3a5c2a", R: "#c94434", r: "#96291f", h: "#e07055", ".": null },
    rows: [
      ".....gG.",
      "......g.",
      "..RRRrg.",
      ".RhRRRr.",
      ".RRRRr..",
      ".RRRr...",
      "..RRr...",
      "...r...."
    ]
  }
};

function drawFood(ctx, type, x, y, scale = 1) {
  const f = FOOD_SPRITES[type] || FOOD_SPRITES.cheerio;
  drawGrid(ctx, f.rows, f.pal, x, y, scale);
}

/** Running Mickey (side view, facing right). frame 0-3, gather frames bounce 1px. */
function drawMickeyRun(ctx, x, y, scale, frame) {
  const f = ((frame % 4) + 4) % 4;
  const bounce = f === 1 || f === 3 ? -1 * scale : 0;
  drawGrid(ctx, MICKEY_RUN_BODY, MICKEY_PAL, x, y + bounce, scale);
  drawGrid(ctx, MICKEY_RUN_LEGS[f], MICKEY_PAL, x, y + 14 * scale + bounce, scale);
  // eye glint
  px(ctx, x + 21 * scale, y + 5 * scale + bounce, Math.max(1, scale / 2), Math.max(1, scale / 2), "#ffffff");
}

/**
 * Sitting/refueling Mickey (front view) holding a food item.
 * opts: { item: 'cheerio'|..., nibble: 0|1, smile: bool }
 */
function drawMickeySit(ctx, x, y, scale, opts = {}) {
  drawGrid(ctx, MICKEY_SIT, MICKEY_PAL, x, y, scale);
  // eye glints
  px(ctx, x + 3 * scale, y + 4 * scale, Math.max(1, scale / 2), Math.max(1, scale / 2), "#ffffff");
  px(ctx, x + 15 * scale, y + 4 * scale, Math.max(1, scale / 2), Math.max(1, scale / 2), "#ffffff");

  if (opts.smile) {
    const m = "#6b4a44";
    px(ctx, x + 7 * scale, y + 8 * scale, scale, scale, m);
    px(ctx, x + 12 * scale, y + 8 * scale, scale, scale, m);
    px(ctx, x + 8 * scale, y + 9 * scale, scale * 4, scale, m);
    px(ctx, x + 1 * scale, y + 8 * scale, scale * 2, scale, "#e8a49d");
    px(ctx, x + 17 * scale, y + 8 * scale, scale * 2, scale, "#e8a49d");
  }

  if (opts.item) {
    const nib = opts.nibble ? scale : 0;
    // item held just under the muzzle...
    drawFood(ctx, opts.item, x + 6 * scale, y + 8.5 * scale + nib, scale);
    // ...with a black arm bridging the body to each pink paw, so the paws read
    // as hands on arms rather than floating dots
    px(ctx, x + 3 * scale, y + 10 * scale + nib, scale * 2.4, scale * 1.9, MICKEY_PAL.K);
    px(ctx, x + 14.6 * scale, y + 10 * scale + nib, scale * 2.4, scale * 1.9, MICKEY_PAL.K);
    // pink paw gripping each SIDE of the food (not covering the front)
    px(ctx, x + 4.4 * scale, y + 11 * scale + nib, scale * 1.7, scale * 1.5, MICKEY_PAL.P);
    px(ctx, x + 13.9 * scale, y + 11 * scale + nib, scale * 1.7, scale * 1.5, MICKEY_PAL.P);
    px(ctx, x + 4.6 * scale, y + 12.3 * scale + nib, scale * 1.3, scale * 0.6, MICKEY_PAL.p);
    px(ctx, x + 14.1 * scale, y + 12.3 * scale + nib, scale * 1.3, scale * 0.6, MICKEY_PAL.p);
  }
}

/** Sleeping Mickey (curled). Drawn inside the tent by the scene layer. */
function drawMickeySleep(ctx, x, y, scale) {
  drawGrid(ctx, MICKEY_SLEEP, MICKEY_PAL, x, y, scale);
}

/**
 * Classic A-frame triangle tent. Returns the triangular door geometry so the
 * caller can clip a sleeping Mickey INSIDE the opening.
 */
function drawTent(ctx, x, y, w, h) {
  const canvasL = "#dda45f"; // sunlit left slope
  const canvasC = "#c98a4a"; // right slope
  const canvasD = "#a96f36"; // seams / shade
  const inner = "#382a1b";   // dark interior
  const trim = "#5d4430";
  const cx = x + w / 2;
  const baseY = y + h;

  // guy lines from the peak out to pegs (drawn first, behind the canvas)
  pxLine(ctx, cx, y + 1, x - 7, baseY, trim, 1);
  pxLine(ctx, cx, y + 1, x + w + 7, baseY, trim, 1);

  // triangular silhouette: width grows from the apex down to the base
  for (let i = 0; i < h; i++) {
    const span = Math.round((i / h) * (w / 2));
    px(ctx, cx - span, y + i, span, 1, canvasL);        // left slope
    px(ctx, cx, y + i, span, 1, canvasC);               // right slope
    if (i % 7 === 0) px(ctx, cx - span, y + i, span * 2, 1, canvasD); // fabric seam
  }
  px(ctx, cx - 1, y, 2, h, canvasD);                    // center ridge seam
  px(ctx, cx - 1, y - 4, 2, 5, trim);                   // ridge pole poking out the top

  // triangular door opening (dark interior), narrower than the tent
  const doorH = h * 0.82;
  const doorHalf = w * 0.26;
  for (let i = 0; i < doorH; i++) {
    const span = Math.round((1 - i / doorH) * doorHalf);
    px(ctx, cx - span, baseY - i, span * 2, 1, inner);
    px(ctx, cx - span - 2, baseY - i, 2, 1, canvasD);   // folded-back flap edges
    px(ctx, cx + span, baseY - i, 2, 1, canvasD);
  }

  // ground trim + pegs
  px(ctx, x - 4, baseY - 1, w + 8, 3, trim);
  px(ctx, x - 8, baseY + 1, 3, 2, trim);
  px(ctx, x + w + 5, baseY + 1, 3, 2, trim);

  return { cx, baseY, doorHalf, doorH, doorX: cx - doorHalf, doorY: baseY - doorH, doorW: doorHalf * 2 };
}

/**
 * Mickey's backpack, closed, resting on the ground. `baseY` is the ground
 * line — the pack is drawn sitting on it (13*scale tall, 12*scale wide).
 */
function drawBackpackProp(ctx, x, baseY, scale) {
  const A = "#c9713d", B = "#a2552c", C = "#7d3f20", S = "#e0b26a";
  const y = baseY - 13 * scale;
  // body, slightly slumped the way a soft pack sits
  px(ctx, x, y + 3 * scale, 12 * scale, 10 * scale, A);
  px(ctx, x + scale, y + 2 * scale, 10 * scale, scale, A);
  px(ctx, x, y + 12 * scale, 12 * scale, scale, C);            // ground shadow edge
  px(ctx, x + scale, y + 4 * scale, scale, 8 * scale, B);       // side shading
  px(ctx, x + 10 * scale, y + 4 * scale, scale, 8 * scale, B);
  // closed top flap with buckle
  px(ctx, x + scale, y + scale, 10 * scale, 3 * scale, B);
  px(ctx, x + scale, y + 3.6 * scale, 10 * scale, scale * 0.6, C);
  px(ctx, x + 5 * scale, y + 3 * scale, 2 * scale, 2 * scale, S);
  // front pocket
  px(ctx, x + 3.5 * scale, y + 7 * scale, 5 * scale, 3.5 * scale, B);
  px(ctx, x + 3.5 * scale, y + 7 * scale, 5 * scale, scale * 0.7, C);
  px(ctx, x + 5.5 * scale, y + 8 * scale, scale, scale, S);
  // little haul loop on top
  px(ctx, x + 5 * scale, y, 2 * scale, scale, C);
}

/** Tiny pixel-person avatar for Friends & Fam. avatar = {hair, skin, outfit}. */
const AVATAR_SKINS = ["#f5d3b3", "#eab890", "#d29b6e", "#a9714b", "#7f4f31", "#5b3a22"];
const AVATAR_OUTFITS = ["#5f8f4f", "#4f6fa8", "#b05343", "#7d5a9e", "#c97f3f", "#3f8f88"];
const AVATAR_HAIR_LABELS = ["Short", "Long", "Curly", "Cap", "Beanie", "Sun Hat"];
const AVATAR_OUTFIT_LABELS = ["Forest Tee", "Blue Tee", "Red Flannel", "Purple Tee", "Orange Hoodie", "Teal Tee"];

// ---- HUD pixel icons (hand-authored grids — never emoji) ----

const ICON_HEART = [
  ".HH.HH.",
  "HHHHHHH",
  "HHHHHHH",
  "HHHHHHH",
  "HhhhhhH",
  ".HHHHH.",
  "..HHH..",
  "...H..."
];

// Classic lightning bolt: pointed head, notched mid bar, tapering tail.
const ICON_BOLT = [
  ".....LLL",
  "....LLLL",
  "...LLLL.",
  "..LLLL..",
  ".LLLLLLL",
  "...LLLl.",
  "..LLL...",
  ".LLL....",
  ".LL.....",
  "LL......"
];

const ICON_PACK = [
  "..BB..B.",
  ".BBBBBB.",
  "BBBBBBBB",
  "BSSSSSSB",
  "BSllllSB",
  "BSSSSSSB",
  "BBBBBBBB",
  "BBBBBBBB",
  "BBBBBBBB",
  ".BBBBBB."
];

/** Center a grid icon inside a square `box` canvas area at (0,0). */
function drawIconGrid(ctx, rows, palette, box, mult = 1) {
  const cell = (box / Math.max(rows.length, rows[0].length)) * mult;
  const x = (box - rows[0].length * cell) / 2;
  const y = (box - rows.length * cell) / 2;
  drawGrid(ctx, rows, palette, x, y, cell);
}

function drawPixelHeart(ctx, box, mult = 1) {
  const c = "#e26a7a";
  drawIconGrid(ctx, ICON_HEART, { H: c, h: shade(c, 1.28), ".": null }, box, mult);
}

function drawPixelBolt(ctx, box, mult = 1, color = "#f2df9e") {
  drawIconGrid(ctx, ICON_BOLT, { L: color, l: shade(color, 0.68), ".": null }, box, mult);
}

function drawPixelPack(ctx, box, mult = 1) {
  const c = "#c9713d";
  drawIconGrid(ctx, ICON_PACK, { B: c, S: shade(c, 0.7), l: "#e0b26a", ".": null }, box, mult);
}

/** Small map pin: filled circle, tapered point, dark hole. */
function drawPixelPin(ctx, x, y, s, color) {
  pxCircle(ctx, x + 3 * s, y + 3 * s, 3 * s, color);
  px(ctx, x + 2 * s, y + 5 * s, 2 * s, 2 * s, color);
  px(ctx, x + 2.5 * s, y + 6.5 * s, s, s, color);
  pxCircle(ctx, x + 3 * s, y + 3 * s, 1.1 * s, "#161c14");
}

function drawAvatar(ctx, x, y, scale, avatar) {
  const skin = AVATAR_SKINS[avatar.skin % AVATAR_SKINS.length] || AVATAR_SKINS[0];
  const outfit = AVATAR_OUTFITS[avatar.outfit % AVATAR_OUTFITS.length] || AVATAR_OUTFITS[0];
  const outfitD = shade(outfit, 0.72);
  const hair = avatar.hair % 6;

  // head
  px(ctx, x + 3 * scale, y + 2 * scale, 6 * scale, 5 * scale, skin);
  // eyes
  px(ctx, x + 4 * scale, y + 4 * scale, scale, scale, "#241c18");
  px(ctx, x + 7 * scale, y + 4 * scale, scale, scale, "#241c18");
  // mouth
  px(ctx, x + 5 * scale, y + 6 * scale, 2 * scale, scale * 0.6, shade(skin, 0.7));

  // hair / hat
  const hairColors = ["#2a2320", "#6e4a2c", "#1d1a17", "#b04338", "#3f5f9e", "#d8b96e"];
  const hc = hairColors[hair];
  if (hair === 0) { // short
    px(ctx, x + 3 * scale, y + scale, 6 * scale, 1.5 * scale, hc);
    px(ctx, x + 2.5 * scale, y + 2 * scale, scale, 2 * scale, hc);
  } else if (hair === 1) { // long
    px(ctx, x + 3 * scale, y + scale, 6 * scale, 1.5 * scale, hc);
    px(ctx, x + 2 * scale, y + 2 * scale, 1.4 * scale, 6 * scale, hc);
    px(ctx, x + 8.6 * scale, y + 2 * scale, 1.4 * scale, 6 * scale, hc);
  } else if (hair === 2) { // curly
    px(ctx, x + 2.4 * scale, y + 0.4 * scale, 7.2 * scale, 2.2 * scale, hc);
    px(ctx, x + 2 * scale, y + 1.4 * scale, scale, 2.4 * scale, hc);
    px(ctx, x + 9 * scale, y + 1.4 * scale, scale, 2.4 * scale, hc);
  } else if (hair === 3) { // cap
    px(ctx, x + 3 * scale, y + 0.6 * scale, 6 * scale, 1.8 * scale, hc);
    px(ctx, x + 8 * scale, y + 2 * scale, 3.4 * scale, scale, hc);
  } else if (hair === 4) { // beanie
    px(ctx, x + 3 * scale, y + 0.2 * scale, 6 * scale, 2.2 * scale, hc);
    px(ctx, x + 3 * scale, y + 2 * scale, 6 * scale, 0.8 * scale, shade(hc, 0.7));
    px(ctx, x + 5.4 * scale, y - 0.8 * scale, 1.4 * scale, 1.2 * scale, shade(hc, 1.25));
  } else { // sun hat
    px(ctx, x + 1.4 * scale, y + 2 * scale, 9.2 * scale, scale, hc);
    px(ctx, x + 3.4 * scale, y + 0.4 * scale, 5.2 * scale, 1.8 * scale, hc);
    px(ctx, x + 3.4 * scale, y + 1.6 * scale, 5.2 * scale, 0.6 * scale, shade(hc, 0.75));
  }

  // body
  px(ctx, x + 2.6 * scale, y + 7 * scale, 6.8 * scale, 5 * scale, outfit);
  px(ctx, x + 2.6 * scale, y + 7 * scale, 6.8 * scale, scale * 0.7, outfitD);
  // arms
  px(ctx, x + 1.6 * scale, y + 7.4 * scale, scale, 3.4 * scale, outfit);
  px(ctx, x + 9.4 * scale, y + 7.4 * scale, scale, 3.4 * scale, outfit);
  px(ctx, x + 1.6 * scale, y + 10.8 * scale, scale, scale, skin);
  px(ctx, x + 9.4 * scale, y + 10.8 * scale, scale, scale, skin);
  // outfit variants: flannel check / hoodie pocket
  if (avatar.outfit % 6 === 2) {
    px(ctx, x + 4 * scale, y + 7 * scale, scale * 0.8, 5 * scale, outfitD);
    px(ctx, x + 7 * scale, y + 7 * scale, scale * 0.8, 5 * scale, outfitD);
    px(ctx, x + 2.6 * scale, y + 9 * scale, 6.8 * scale, scale * 0.8, outfitD);
  }
  if (avatar.outfit % 6 === 4) {
    px(ctx, x + 4.4 * scale, y + 9.6 * scale, 3.2 * scale, 1.8 * scale, outfitD);
  }
  // legs
  px(ctx, x + 3.6 * scale, y + 12 * scale, 1.8 * scale, 2.6 * scale, "#3a3f4a");
  px(ctx, x + 6.6 * scale, y + 12 * scale, 1.8 * scale, 2.6 * scale, "#3a3f4a");
  px(ctx, x + 3.4 * scale, y + 14.4 * scale, 2.2 * scale, scale * 0.8, "#241f1c");
  px(ctx, x + 6.4 * scale, y + 14.4 * scale, 2.2 * scale, scale * 0.8, "#241f1c");
}
