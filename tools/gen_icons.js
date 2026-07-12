/**
 * Generates the PWA icons (Mickey's face, pixel art) without any deps.
 * Usage: node tools/gen_icons.js   -> writes icons/*.png
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

// ---- tiny PNG encoder (RGBA, no filtering) ----

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0; // filter: none
    rgba.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

// ---- Mickey face, 16x16 ----

const FACE = [
  "................",
  ".KKK........KKK.",
  "KKPKK......KKPKK",
  ".KKKKKKKKKKKKKK.",
  "KKKKKKKWWKKKKKKK",
  "KKeEKKKWWKKKeEKK",
  "KKEEKKWWWWKKEEKK",
  "KKKKWWWWWWWWKKKK",
  ".KKWWWNNWWWWKKK.",
  ".KKWWWWwWWWWKK..",
  "..KWWWWWWWWWK...",
  "..KKWWWWWWWKK...",
  "...KKWWWWWKK....",
  "....KKKKKKK.....",
  "................",
  "................"
];

const COLORS = {
  K: [43, 38, 35],
  P: [232, 164, 157],
  W: [246, 243, 234],
  w: [216, 209, 191],
  N: [239, 143, 147],
  E: [23, 18, 20],
  e: [128, 124, 130]
};

// The site's accent green (#8cbc72), slightly graded, with a darker green edge.
const BG_TOP = [150, 198, 124];
const BG_BOT = [124, 170, 96];
const BORDER = [79, 105, 62];

function makeIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const border = Math.max(2, Math.round(size * 0.03));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // background: vertical gradient with a chunky border
      let c;
      if (x < border || y < border || x >= size - border || y >= size - border) {
        c = BORDER;
      } else {
        const t = y / size;
        c = [
          Math.round(BG_TOP[0] + (BG_BOT[0] - BG_TOP[0]) * t),
          Math.round(BG_TOP[1] + (BG_BOT[1] - BG_TOP[1]) * t),
          Math.round(BG_TOP[2] + (BG_BOT[2] - BG_TOP[2]) * t)
        ];
      }
      // face sprite mapped over the middle ~84% of the tile
      const pad = size * 0.08;
      const cell = (size - pad * 2) / 16;
      const gx = Math.floor((x - pad) / cell);
      const gy = Math.floor((y - pad) / cell);
      if (gx >= 0 && gx < 16 && gy >= 0 && gy < 16) {
        const ch = FACE[gy][gx];
        if (COLORS[ch]) c = COLORS[ch];
      }
      rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = 255;
    }
  }
  return encodePng(size, size, rgba);
}

const outDir = path.join(__dirname, "..", "icons");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "icon-192.png"), makeIcon(192));
fs.writeFileSync(path.join(outDir, "icon-512.png"), makeIcon(512));
fs.writeFileSync(path.join(outDir, "apple-touch-icon.png"), makeIcon(180));
console.log("wrote icons/icon-192.png, icons/icon-512.png, icons/apple-touch-icon.png");
