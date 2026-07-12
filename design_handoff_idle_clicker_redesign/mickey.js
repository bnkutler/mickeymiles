/**
 * Mickey sprites — drawn to match the real Mickey (black-and-white dwarf
 * hamster): black cap over the head/eyes and ears, white muzzle and chin,
 * a white band across the shoulders, black saddle, white belly, pink nose
 * and feet. Asymmetric on purpose.
 */

var MICKEY_PAL = {
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

var MICKEY_RUN_BODY = [
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

var MICKEY_RUN_LEGS = [
  [
    "......Ww............WWw.....",
    ".....Ww..............Ww.....",
    "....pP................pP...."
  ],
  [
    ".......Ww..........Ww.......",
    ".......Ww..........Ww.......",
    ".......pP..........pP......."
  ],
  [
    "........WWw......wWW........",
    ".........Ww......Ww.........",
    ".........pP......pP........."
  ],
  [
    ".......Ww..........Ww.......",
    ".......Ww..........Ww.......",
    ".......pP..........pP......."
  ]
];

// ---- front view (refueling), 20 x 19 ----

var MICKEY_SIT = [
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
  "kKKWWWWWPPPPWWWWWKKk",
  "kKKWWWWWWWWWWWWWWKKk",
  "kKKWWWWWWWWWWWWWWKKk",
  ".kKWWWWWWWWWWWWWWKk.",
  ".kKKWWWWWWWWWWWWKKk.",
  "..kPPWWWWWWWWWWPPk..",
  "...pp..........pp..."
];

// ---- sleeping (side, curled), 24 x 10 ----

var MICKEY_SLEEP = [
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

var FOOD_SPRITES = {
  cheerio: {
    pal: { G: "#3f6032", g: "#2b4522", h: "#557f44", ".": null },
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
    // item held between the paws, just under the muzzle
    drawFood(ctx, opts.item, x + 6 * scale, y + 8.5 * scale + nib, scale);
    // repaint paws over the item so he's holding it
    px(ctx, x + 8 * scale, y + 12 * scale, scale * 2, scale, MICKEY_PAL.P);
    px(ctx, x + 10 * scale, y + 12 * scale, scale * 2, scale, MICKEY_PAL.P);
  }
}

/** Sleeping Mickey (curled). Drawn inside the tent by the scene layer. */
function drawMickeySleep(ctx, x, y, scale) {
  drawGrid(ctx, MICKEY_SLEEP, MICKEY_PAL, x, y, scale);
}

/** Pup tent, sized around a sleeping Mickey. Returns interior anchor. */
function drawTent(ctx, x, y, w, h) {
  const canvasC = "#b8874f";
  const canvasD = "#94693a";
  const inner = "#4a3a28";
  // back slope
  for (let i = 0; i < h; i++) {
    const span = Math.round((i / h) * (w / 2));
    px(ctx, x + w / 2 - span, y + i, span * 2, 1, i % 4 === 0 ? canvasD : canvasC);
  }
  // opening (front face triangle, dark interior)
  for (let i = Math.round(h * 0.25); i < h; i++) {
    const span = Math.round(((i - h * 0.25) / (h * 0.75)) * (w / 3.2));
    px(ctx, x + w / 2 - span, y + i, span * 2, 1, inner);
  }
  // ridge pole + pegs
  px(ctx, x + w / 2 - 1, y - 3, 2, 4, "#6e563c");
  px(ctx, x - 2, y + h - 1, 3, 2, "#6e563c");
  px(ctx, x + w - 1, y + h - 1, 3, 2, "#6e563c");
}

/** Mickey's little backpack, open, with up to two food items poking out. */
function drawBackpackProp(ctx, x, y, scale, peekItems = []) {
  const A = "#c9713d", B = "#a2552c", C = "#7d3f20", S = "#e0b26a";
  px(ctx, x, y + 3 * scale, 12 * scale, 10 * scale, A);
  px(ctx, x, y + 3 * scale, 12 * scale, scale, B);
  px(ctx, x, y + 12 * scale, 12 * scale, scale, C);
  px(ctx, x + scale, y + 4 * scale, scale, 8 * scale, B);
  px(ctx, x + 4 * scale, y + 8 * scale, 4 * scale, 3 * scale, S); // pocket
  px(ctx, x + 4 * scale, y + 8 * scale, 4 * scale, scale, C);
  // open top
  px(ctx, x + scale, y + 2 * scale, 10 * scale, 2 * scale, "#3a2414");
  peekItems.slice(0, 2).forEach((type, i) => {
    drawFood(ctx, type, x + (1 + i * 4.5) * scale, y - 3.5 * scale, scale * 0.9);
  });
  // flap folded behind
  px(ctx, x + 2 * scale, y, 8 * scale, scale, B);
  px(ctx, x + 3 * scale, y + scale, 6 * scale, scale, B);
}

/** Tiny pixel-person avatar for Friends & Fam. avatar = {hair, skin, outfit}. */
var AVATAR_SKINS = ["#f5d3b3", "#eab890", "#d29b6e", "#a9714b", "#7f4f31", "#5b3a22"];
var AVATAR_OUTFITS = ["#5f8f4f", "#4f6fa8", "#b05343", "#7d5a9e", "#c97f3f", "#3f8f88"];
var AVATAR_HAIR_LABELS = ["Short", "Long", "Curly", "Cap", "Beanie", "Sun Hat"];
var AVATAR_OUTFIT_LABELS = ["Forest Tee", "Blue Tee", "Red Flannel", "Purple Tee", "Orange Hoodie", "Teal Tee"];

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
