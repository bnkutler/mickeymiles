/** Tiny pixel-art drawing helpers shared by the Mickey sprites and scenes. */

function px(ctx, x, y, w, h, color) {
  if (!color) return;
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}

function pxCircle(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  for (let y = -r; y <= r; y++) {
    const span = Math.floor(Math.sqrt(r * r - y * y));
    ctx.fillRect(Math.round(cx - span), Math.round(cy + y), span * 2 + 1, 1);
  }
}

function pxLine(ctx, x0, y0, x1, y1, color, size = 1) {
  ctx.fillStyle = color;
  let x = Math.round(x0);
  let y = Math.round(y0);
  const ex = Math.round(x1);
  const ey = Math.round(y1);
  const dx = Math.abs(ex - x);
  const sx = x < ex ? 1 : -1;
  const dy = -Math.abs(ey - y);
  const sy = y < ey ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    ctx.fillRect(x, y, size, size);
    if (x === ex && y === ey) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

/**
 * Draw a string-grid sprite. `rows` is an array of equal-length strings and
 * `palette` maps each character to a color (undefined/"." = transparent).
 */
function drawGrid(ctx, rows, palette, x, y, scale = 1) {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    let c = 0;
    while (c < row.length) {
      const color = palette[row[c]];
      if (!color) { c++; continue; }
      // run-length: merge adjacent same-color cells into one fillRect
      let end = c + 1;
      while (end < row.length && palette[row[end]] === color) end++;
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x + c * scale), Math.round(y + r * scale), (end - c) * scale, scale);
      c = end;
    }
  }
}

/** Shade a #rrggbb color by factor (<1 darkens, >1 lightens). */
function shade(hex, factor) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v * factor)));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/** Mix two #rrggbb colors; t=0 -> a, t=1 -> b. */
function mix(a, b, t) {
  const na = parseInt(a.slice(1), 16);
  const nb = parseInt(b.slice(1), 16);
  const ch = (sa, sb) => Math.round(sa + (sb - sa) * t);
  const r = ch((na >> 16) & 255, (nb >> 16) & 255);
  const g = ch((na >> 8) & 255, (nb >> 8) & 255);
  const bl = ch(na & 255, nb & 255);
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, "0")}`;
}

/** Deterministic pseudo-random from an integer — keeps scene noise stable. */
function hashNoise(n) {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
