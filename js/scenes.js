/**
 * Landmark scene renderer. Every scene is layered the same way:
 * sky bands -> celestial (sun / moon+stars) -> far silhouette -> ground
 * -> trail path -> motifs. Colors come from the landmark config in
 * landmarks.js; night versions are derived automatically.
 */

const NIGHT_SKY = "#141c33";

function sceneCtx(ctx, w, h, night) {
  return {
    ctx, w, h,
    night,
    horizonY: Math.round(h * 0.56),
    groundY: Math.round(h * 0.62),
    trailY: Math.round(h * 0.86),
    // darken any palette color for night scenes
    c(color) {
      return night ? mix(shade(color, 0.42), NIGHT_SKY, 0.35) : color;
    }
  };
}

function renderScene(canvas, lm, night) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const s = sceneCtx(ctx, w, h, night);

  drawSky(s, lm.sky);
  if (night) drawNightSky(s);
  else drawDaySky(s, lm.sky);

  drawFar(s, lm.far);
  drawGround(s, lm.ground);

  for (const [type, opts] of lm.motifs) {
    const painter = MOTIFS[type];
    if (painter) painter(s, opts || {});
  }
  drawTrailPath(s, lm.ground);
}

// ------------------------------------------------------------------ layers

function drawSky(s, sky) {
  const bands = [
    [0, 0.26, sky[0]],
    [0.26, 0.44, mix(sky[0], sky[1], 0.5)],
    [0.44, 0.72, sky[1]],
    [0.72, 1, sky[2]]
  ];
  for (const [a, b, color] of bands) {
    px(s.ctx, 0, s.horizonY * a, s.w, Math.ceil(s.horizonY * (b - a)) + 1, s.c(color));
  }
  // dithered seam between the two biggest bands
  const seamY = Math.round(s.horizonY * 0.44);
  for (let x = 0; x < s.w; x += 4) {
    if (hashNoise(x * 7 + 1) > 0.5) px(s.ctx, x, seamY - 2, 2, 2, s.c(sky[1]));
  }
}

function drawDaySky(s, sky) {
  const sunX = s.w * 0.82, sunY = s.horizonY * 0.24;
  px(s.ctx, sunX - 7, sunY - 5, 14, 10, "#f2df9e");
  px(s.ctx, sunX - 5, sunY - 7, 10, 14, "#f2df9e");
  px(s.ctx, sunX - 4, sunY - 4, 8, 8, "#f8ecc0");
  const cloud = mix(sky[0], "#ffffff", 0.65);
  drawCloud(s, s.w * 0.16, s.horizonY * 0.2, 26, cloud);
  drawCloud(s, s.w * 0.52, s.horizonY * 0.36, 20, cloud);
  drawCloud(s, s.w * 0.88, s.horizonY * 0.52, 16, mix(sky[1], "#ffffff", 0.5));
}

function drawCloud(s, x, y, w, color) {
  px(s.ctx, x, y, w, 4, color);
  px(s.ctx, x + w * 0.18, y - 3, w * 0.5, 3, color);
  px(s.ctx, x + w * 0.55, y + 4, w * 0.4, 3, color);
}

function drawNightSky(s) {
  for (let i = 0; i < 46; i++) {
    const x = Math.floor(hashNoise(i * 3 + 11) * s.w);
    const y = Math.floor(hashNoise(i * 5 + 29) * s.horizonY * 0.9);
    const tw = hashNoise(i * 7 + 3) > 0.82;
    px(s.ctx, x, y, 1, 1, tw ? "#fff8d8" : "#c9cfe4");
    if (tw) { px(s.ctx, x - 1, y, 3, 1, "#8b93b8"); px(s.ctx, x, y - 1, 1, 3, "#8b93b8"); }
  }
  const mx = s.w * 0.8, my = s.horizonY * 0.22;
  pxCircle(s.ctx, mx, my, 8, "#e8e4cf");
  pxCircle(s.ctx, mx - 3, my - 2, 7, mix(NIGHT_SKY, "#e8e4cf", 0.18));
}

function drawGround(s, ground) {
  px(s.ctx, 0, s.groundY, s.w, s.h - s.groundY, s.c(ground.base));
  // banded shading toward the viewer
  px(s.ctx, 0, s.groundY, s.w, 3, s.c(shade(ground.base, 1.12)));
  px(s.ctx, 0, s.h - Math.round((s.h - s.groundY) * 0.35), s.w, Math.round((s.h - s.groundY) * 0.35), s.c(shade(ground.base, 0.9)));
  for (let i = 0; i < s.w; i += 7) {
    const n = hashNoise(i * 13 + 5);
    const y = s.groundY + 4 + n * (s.h - s.groundY - 8);
    px(s.ctx, i + n * 5, y, 3, 1, s.c(ground.detail));
    if (n > 0.6) px(s.ctx, i + 3, y + 3, 2, 1, s.c(shade(ground.detail, 0.85)));
  }
}

function drawTrailPath(s, ground) {
  const y = s.trailY;
  const c = s.c(mix(ground.base, "#e8d9b0", 0.45));
  const edge = s.c(mix(ground.base, "#6b5a3d", 0.5));
  px(s.ctx, 0, y, s.w, 6, c);
  for (let x = 0; x < s.w; x += 9) {
    px(s.ctx, x, y - 1, 4, 1, edge);
    px(s.ctx, x + 5, y + 6, 3, 1, edge);
  }
}

// -------------------------------------------------------- far silhouettes

function drawFar(s, far) {
  const y = s.horizonY;
  const kinds = {
    hills() {
      farHillRow(s, y - 10, 26, s.c(far.colors[0]));
      farHillRow(s, y - 3, 34, s.c(far.colors[1] || far.colors[0]), 7);
      px(s.ctx, 0, y, s.w, s.groundY - y + 1, s.c(far.colors[1] || far.colors[0]));
    },
    mountains() {
      farPeaks(s, y, [[0.14, 30], [0.42, 40], [0.74, 34], [0.96, 24]], s.c(far.colors[0]), far.snow && s.c("#e8ecec"));
      farPeaks(s, y, [[0.28, 20], [0.6, 26], [0.88, 18]], s.c(far.colors[1] || far.colors[0]));
      px(s.ctx, 0, y, s.w, s.groundY - y + 1, s.c(far.colors[1] || far.colors[0]));
    },
    peak() {
      farPeaks(s, y, [[0.18, 18], [0.85, 16]], s.c(far.colors[1] || far.colors[0]));
      farCone(s, s.w * 0.55, y, far.sharp ? 26 : 40, far.sharp ? 52 : 46, s.c(far.colors[0]), far.snow && s.c("#eef1f2"), far.sharp);
      px(s.ctx, 0, y, s.w, s.groundY - y + 1, s.c(far.colors[1] || far.colors[0]));
    },
    jagged() {
      const cols = far.colors;
      farPeaks(s, y - 6, [[0.1, 34], [0.35, 44], [0.62, 38], [0.9, 46]], s.c(cols[0]), far.snow && s.c("#e6ebee"));
      farPeaks(s, y - 2, [[0.22, 26], [0.5, 30], [0.78, 24]], s.c(cols[1]));
      farPeaks(s, y, [[0.14, 14], [0.44, 18], [0.7, 15], [0.95, 12]], s.c(cols[2] || cols[1]));
      px(s.ctx, 0, y, s.w, s.groundY - y + 1, s.c(cols[2] || cols[1]));
    },
    mesas() {
      farMesa(s, s.w * 0.1, y, 44, 16, s.c(far.colors[0]));
      farMesa(s, s.w * 0.62, y, 60, 12, s.c(far.colors[1] || far.colors[0]));
      px(s.ctx, 0, y, s.w, s.groundY - y + 1, s.c(far.colors[1] || far.colors[0]));
    },
    domes() {
      farDome(s, s.w * 0.24, y, 34, 24, s.c(far.colors[0]), far.snow);
      farDome(s, s.w * 0.6, y, 46, 30, s.c(far.colors[1] || far.colors[0]), far.snow);
      farDome(s, s.w * 0.88, y, 28, 18, s.c(far.colors[0]), false);
      px(s.ctx, 0, y, s.w, s.groundY - y + 1, s.c(far.colors[1] || far.colors[0]));
    },
    spires() {
      for (let i = 0; i < 7; i++) {
        const fx = 0.12 + i * 0.12;
        const hgt = 22 + hashNoise(i * 17 + 2) * 26;
        farCone(s, s.w * fx, y, 7 + hashNoise(i * 9) * 6, hgt, s.c(far.colors[i % 2]), null, true);
      }
      px(s.ctx, 0, y, s.w, s.groundY - y + 1, s.c(far.colors[1] || far.colors[0]));
    },
    ridge() {
      farHillRow(s, y - 14, 44, s.c(far.colors[0]), 3);
      if (far.snow) for (let x = 0; x < s.w; x += 11) px(s.ctx, x + 2, y - 15 + Math.round(Math.sin(x / 44) * 4), 5, 2, s.c("#e9edee"));
      px(s.ctx, 0, y - 2, s.w, s.groundY - y + 3, s.c(far.colors[1] || far.colors[0]));
    },
    canyon() {
      px(s.ctx, 0, y - 26, s.w * 0.34, s.groundY - y + 27, s.c(far.colors[0]));
      px(s.ctx, s.w * 0.66, y - 30, s.w * 0.34, s.groundY - y + 31, s.c(far.colors[0]));
      px(s.ctx, s.w * 0.06, y - 14, s.w * 0.22, s.groundY - y + 15, s.c(far.colors[1]));
      px(s.ctx, s.w * 0.72, y - 12, s.w * 0.24, s.groundY - y + 13, s.c(far.colors[1]));
      for (let i = 0; i < 8; i++) {
        const cy = y - 24 + i * 5;
        px(s.ctx, 0, cy, s.w * (0.3 - i * 0.01), 1, s.c(shade(far.colors[0], 0.85)));
        px(s.ctx, s.w * (0.7 + i * 0.01), cy, s.w * 0.3, 1, s.c(shade(far.colors[0], 0.85)));
      }
      px(s.ctx, 0, y, s.w, s.groundY - y + 1, s.c(far.colors[1]));
    },
    gorge() {
      // steep green walls on both sides of a wide river gap
      for (let i = 0; i < 30; i++) {
        const t = i / 30;
        px(s.ctx, 0, y - 34 + i, s.w * (0.44 - t * 0.14), 1, s.c(far.colors[0]));
        px(s.ctx, s.w - s.w * (0.46 - t * 0.14), y - 34 + i, s.w * (0.46 - t * 0.14), 1, s.c(far.colors[1]));
      }
      px(s.ctx, 0, y - 4, s.w, s.groundY - y + 5, s.c(far.colors[1]));
    },
    volcano() {
      const bw = far.huge ? 62 : 44;
      const bh = far.huge ? 52 : 38;
      farPeaks(s, y, [[0.14, 16], [0.9, 14]], s.c(far.colors[1] || far.colors[0]));
      farCone(s, s.w * 0.58, y, bw, bh, s.c(far.colors[0]), far.snow && s.c("#f0f3f5"), false);
      px(s.ctx, 0, y, s.w, s.groundY - y + 1, s.c(far.colors[1] || far.colors[0]));
    },
    cones3() {
      farCone(s, s.w * 0.26, y, 30, 34, s.c(far.colors[0]), far.snow && s.c("#eef1f3"), false);
      farCone(s, s.w * 0.52, y, 32, 40, s.c(far.colors[1] || far.colors[0]), far.snow && s.c("#eef1f3"), false);
      farCone(s, s.w * 0.78, y, 30, 32, s.c(far.colors[0]), far.snow && s.c("#eef1f3"), false);
      px(s.ctx, 0, y, s.w, s.groundY - y + 1, s.c(far.colors[1] || far.colors[0]));
    },
    craterRim() {
      // broken caldera rim across the whole horizon
      for (let x = 0; x < s.w; x += 2) {
        const n = hashNoise(x * 3 + 7);
        const hgt = 18 + Math.sin(x / 26) * 6 + n * 8;
        px(s.ctx, x, y - hgt, 2, hgt + 1, s.c(far.colors[0]));
        if (n > 0.72) px(s.ctx, x, y - hgt, 2, 2, s.c("#e9edee"));
      }
      px(s.ctx, 0, y, s.w, s.groundY - y + 1, s.c(far.colors[1] || far.colors[0]));
    },
    flat() {
      px(s.ctx, 0, y - 2, s.w, s.groundY - y + 3, s.c(far.colors[0]));
    }
  };
  (kinds[far.kind] || kinds.hills)();
}

function farHillRow(s, baseY, amp, color, phase = 0) {
  for (let x = 0; x < s.w; x += 2) {
    const hgt = (Math.sin((x + phase * 20) / amp) * 0.5 + 0.5) * 16 + 4;
    px(s.ctx, x, baseY - hgt, 2, s.groundY - baseY + hgt + 1, color);
  }
}

function farPeaks(s, baseY, peaks, color, snow) {
  for (const [fx, hgt] of peaks) {
    const cx = s.w * fx;
    for (let i = 0; i < hgt; i += 1) {
      const span = ((hgt - i) / hgt) * hgt * 1.1 + 2;
      px(s.ctx, cx - span, baseY - i, span * 2, 1, color);
    }
    if (snow) {
      for (let i = hgt - 7; i < hgt; i++) {
        const span = ((hgt - i) / hgt) * hgt * 1.1 + 2;
        px(s.ctx, cx - span, baseY - i, span * 2, 1, snow);
      }
    }
  }
}

function farCone(s, cx, baseY, halfW, hgt, color, snow, sharp) {
  for (let i = 0; i < hgt; i++) {
    const t = (hgt - i) / hgt;
    const span = sharp ? t * halfW : Math.pow(t, 0.8) * halfW;
    px(s.ctx, cx - span, baseY - i, span * 2 + 1, 1, color);
  }
  if (snow) {
    const cap = Math.round(hgt * 0.38);
    for (let i = hgt - cap; i < hgt; i++) {
      const t = (hgt - i) / hgt;
      const span = (sharp ? t : Math.pow(t, 0.8)) * halfW;
      const jag = hashNoise(i * 31) > 0.6 ? 2 : 0;
      px(s.ctx, cx - span - jag, baseY - i, span * 2 + 1 + jag * 2, 1, snow);
    }
  }
}

function farMesa(s, x, baseY, w, hgt, color) {
  px(s.ctx, x, baseY - hgt, w, hgt + 1, color);
  px(s.ctx, x - 5, baseY - hgt + 4, 5, hgt - 3, color);
  px(s.ctx, x + w, baseY - hgt + 6, 4, hgt - 5, color);
  px(s.ctx, x + 3, baseY - hgt, w - 6, 2, shade(color, 1.15));
}

function farDome(s, cx, baseY, w, hgt, color, snow) {
  for (let i = 0; i < hgt; i++) {
    const t = i / hgt;
    const span = Math.sqrt(1 - t * t) * (w / 2);
    px(s.ctx, cx - span, baseY - hgt + i, span * 2, 1, color);
  }
  px(s.ctx, cx - w * 0.12, baseY - hgt, 2, hgt * 0.8, shade(color, 1.12));
  if (snow) px(s.ctx, cx - w * 0.18, baseY - hgt + 2, w * 0.3, 3, "#eef1f3");
}

// ----------------------------------------------------------------- motifs

const MOTIFS = {
  scrub(s, o) {
    const n = o.sparse ? 5 : 9;
    for (let i = 0; i < n; i++) {
      const x = hashNoise(i * 23 + 4) * s.w;
      const y = s.groundY + 4 + hashNoise(i * 41 + 9) * (s.trailY - s.groundY - 10);
      const g = s.c(mix("#7a8a4f", "#93885a", hashNoise(i * 7)));
      px(s.ctx, x, y, 7, 3, g);
      px(s.ctx, x + 1, y - 2, 4, 2, g);
      px(s.ctx, x + 4, y - 1, 3, 1, s.c("#5f6f3d"));
    }
  },
  meadow(s, o) {
    for (let i = 0; i < 26; i++) {
      const x = hashNoise(i * 19 + 3) * s.w;
      const y = s.groundY + 3 + hashNoise(i * 29 + 8) * (s.trailY - s.groundY - 8);
      px(s.ctx, x, y - 2, 1, 3, s.c(o.dry ? "#c2ae62" : "#79a04f"));
      if (!o.dry && hashNoise(i * 13) > 0.62) px(s.ctx, x, y - 3, 1, 1, s.c(["#e4c9dd", "#e8e19a", "#c96f6f"][i % 3]));
    }
  },
  joshua(s, o) {
    const n = o.n || 3;
    for (let i = 0; i < n; i++) {
      const x = (0.18 + i * 0.3 + hashNoise(i * 31) * 0.08) * s.w;
      const y = s.groundY + 6 + hashNoise(i * 11) * 8;
      const trunk = s.c("#7d6844"), leaf = s.c("#5f7048");
      px(s.ctx, x, y - 16, 3, 17, trunk);
      px(s.ctx, x - 5, y - 20, 3, 6, trunk); px(s.ctx, x - 5, y - 15, 8, 2, trunk);
      px(s.ctx, x + 5, y - 22, 3, 8, trunk); px(s.ctx, x + 3, y - 15, 5, 2, trunk);
      // spiky tufts
      for (const [tx, ty] of [[x + 1, y - 19], [x - 4, y - 23], [x + 6, y - 25]]) {
        px(s.ctx, tx - 3, ty, 8, 3, leaf);
        px(s.ctx, tx - 1, ty - 2, 4, 2, leaf);
        px(s.ctx, tx - 4, ty - 1, 2, 1, leaf); px(s.ctx, tx + 4, ty - 1, 2, 1, leaf);
      }
    }
  },
  oaks(s, o) {
    for (let i = 0; i < (o.n || 2); i++) {
      const x = (0.2 + i * 0.5) * s.w;
      const y = s.groundY + 8;
      px(s.ctx, x, y - 10, 3, 11, s.c("#6b4f34"));
      pxCircle(s.ctx, x + 1, y - 14, 8, s.c("#5c703f"));
      pxCircle(s.ctx, x - 3, y - 11, 5, s.c("#6b7f4a"));
    }
  },
  pines(s, o) {
    const n = o.n || 3;
    for (let i = 0; i < n; i++) {
      const x = (0.08 + (i + 0.5) / n * 0.9 + hashNoise(i * 37) * 0.05) * s.w;
      const y = s.groundY + 5 + hashNoise(i * 17 + 6) * 9;
      const hgt = 20 + hashNoise(i * 7 + 1) * 9;
      pine(s, x, y, hgt, s.c(o.gnarly ? "#4c5f40" : "#3e5c38"));
    }
  },
  firs(s, o) {
    const n = o.n || 3;
    for (let i = 0; i < n; i++) {
      const x = (0.06 + (i + 0.5) / n * 0.92 + hashNoise(i * 43) * 0.04) * s.w;
      const y = s.groundY + 4 + hashNoise(i * 19 + 2) * 10;
      fir(s, x, y, 22 + hashNoise(i * 11) * 10, s.c("#2f4a38"));
    }
  },
  boulders(s, o) {
    const x = (o.x || 0.5) * s.w;
    const y = s.groundY + 10;
    px(s.ctx, x, y - 6, 14, 7, s.c("#8f8a7a"));
    px(s.ctx, x + 3, y - 9, 8, 3, s.c("#a09b8a"));
    px(s.ctx, x + 10, y - 3, 9, 4, s.c("#7d7869"));
    px(s.ctx, x + 2, y - 5, 3, 2, s.c("#a8a392"));
  },
  rocks(s, o) {
    for (let i = 0; i < 6; i++) {
      const x = hashNoise(i * 51 + 7) * s.w;
      const y = s.groundY + 4 + hashNoise(i * 61 + 2) * (s.trailY - s.groundY - 8);
      const c = o.dark ? "#4a4440" : "#8a8474";
      px(s.ctx, x, y, 5, 3, s.c(c));
      px(s.ctx, x + 1, y - 1, 3, 1, s.c(shade(c, 1.2)));
    }
  },
  eagleRock(s, o) {
    const x = (o.x || 0.6) * s.w, y = s.groundY + 8;
    const c = s.c("#9a8f76"), d = s.c("#7d7359");
    px(s.ctx, x, y - 8, 18, 9, c);          // body pile
    px(s.ctx, x - 7, y - 13, 9, 6, c);      // left wing up
    px(s.ctx, x - 10, y - 15, 5, 4, d);
    px(s.ctx, x + 16, y - 13, 9, 6, c);     // right wing up
    px(s.ctx, x + 22, y - 15, 5, 4, d);
    px(s.ctx, x + 7, y - 12, 6, 5, d);      // head
  },
  slabs(s) {
    // Vasquez Rocks: tilted sandstone slabs
    const c1 = s.c("#c08a5a"), c2 = s.c("#a06f43");
    slab(s, s.w * 0.22, s.groundY + 12, 34, 30, c1);
    slab(s, s.w * 0.5, s.groundY + 14, 42, 38, c2);
    slab(s, s.w * 0.78, s.groundY + 12, 30, 24, c1);
  },
  turbines(s, o) {
    const n = o.n || 4;
    for (let i = 0; i < n; i++) {
      const x = (0.1 + (i / n) * 0.85) * s.w;
      const y = s.horizonY - 2 - hashNoise(i * 13) * 10;
      const pole = s.c("#d8d8d4");
      px(s.ctx, x, y - 16, 2, 17, pole);
      const a = hashNoise(i * 5) * Math.PI;
      for (let b = 0; b < 3; b++) {
        const ang = a + (b * Math.PI * 2) / 3;
        pxLine(s.ctx, x + 1, y - 16, x + 1 + Math.cos(ang) * 8, y - 16 + Math.sin(ang) * 8, pole, 1);
      }
    }
  },
  lake(s, o) {
    const y = (o.y || 0.66) * s.h;
    const hgt = s.trailY - 6 - y;
    const c = s.c(o.color || "#4f7fa3");
    px(s.ctx, s.w * (o.big ? 0 : 0.12), y, s.w * (o.big ? 1 : 0.76), hgt, c);
    for (let x = 0; x < s.w; x += 10) {
      if (hashNoise(x * 3 + 2) > 0.4) px(s.ctx, x + 2, y + 3 + hashNoise(x) * (hgt - 5), 5, 1, s.c(shade(o.color || "#4f7fa3", 1.28)));
    }
    px(s.ctx, s.w * (o.big ? 0 : 0.12), y, s.w * (o.big ? 1 : 0.76), 1, s.c(shade(o.color || "#4f7fa3", 1.4)));
  },
  tarn(s) {
    MOTIFS.lake(s, { y: 0.7, color: "#57879c" });
  },
  craterLake(s) {
    // impossibly blue water filling the caldera up to the rim line
    const top = s.horizonY - 8;
    px(s.ctx, 0, top, s.w, s.groundY - top + 6, s.c("#1f4f9e"));
    px(s.ctx, 0, top, s.w, 2, s.c("#3a6cc0"));
    for (let x = 0; x < s.w; x += 8) {
      if (hashNoise(x * 5 + 3) > 0.45) px(s.ctx, x, top + 4 + hashNoise(x * 7) * (s.groundY - top), 4, 1, s.c("#3a6cc0"));
    }
    // Wizard Island cinder cone
    farCone(s, s.w * 0.32, s.groundY + 2, 16, 12, s.c("#4a5a48"), null, false);
    px(s.ctx, s.w * 0.32 - 2, s.groundY - 9, 4, 2, s.c("#38463a"));
  },
  river(s, o) {
    const c = s.c(o.color || "#6da3bd");
    const y0 = s.groundY + 6;
    const len = s.trailY - y0 - 8;
    // continuous meander toward the viewer, regardless of canvas height
    for (let i = 0; i <= len; i += 2) {
      const t = i / len;
      const w2 = 8 + t * 26;
      const cx = s.w * (0.5 + Math.sin(t * 3.2) * 0.06);
      px(s.ctx, cx - w2 / 2, y0 + i, w2, 2, c);
      if (hashNoise(i * 17 + 3) > 0.8) {
        px(s.ctx, cx - w2 / 4, y0 + i, 3, 1, s.c(shade(o.color || "#6da3bd", 1.3)));
      }
    }
    px(s.ctx, s.w * 0.5 - 4, y0 + 2, 3, 1, s.c("#e8f0f2"));
  },
  riverWide(s) {
    const y = s.groundY - 2;
    px(s.ctx, 0, y, s.w, Math.round((s.trailY - y) * 0.62), s.c("#39698e"));
    for (let x = 0; x < s.w; x += 9) {
      if (hashNoise(x * 11 + 1) > 0.42) px(s.ctx, x, y + 3 + hashNoise(x * 3) * 12, 5, 1, s.c("#5786a8"));
    }
  },
  falls(s) {
    const x = s.w * 0.4, top = s.horizonY - 22, bottom = s.groundY + 14;
    px(s.ctx, x - 26, top, 52, bottom - top, s.c("#5f6e60"));           // cliff
    px(s.ctx, x - 26, top, 52, 3, s.c("#74856f"));
    for (let i = 0; i < 3; i++) {
      const fx = x - 12 + i * 10;
      px(s.ctx, fx, top + 2, 5, bottom - top - 2, s.c(i === 1 ? "#e6f2f4" : "#c8e0e6"));
      for (let yy = top + 6; yy < bottom; yy += 7) px(s.ctx, fx + 1, yy, 3, 2, s.c("#f4fbfc"));
    }
    px(s.ctx, x - 22, bottom - 2, 44, 5, s.c("#7fb0bd"));                // plunge pool
    px(s.ctx, x - 16, bottom - 4, 8, 2, s.c("#e6f2f4"));
  },
  bridge(s, o) {
    const y = o.grand ? s.groundY + 2 : s.groundY + 8;
    const c = s.c(o.grand ? "#7d8890" : "#8a6f4a");
    px(s.ctx, 0, y, s.w, 3, c);
    px(s.ctx, s.w * 0.2, y - (o.grand ? 14 : 8), 3, o.grand ? 17 : 11, c);
    px(s.ctx, s.w * 0.76, y - (o.grand ? 14 : 8), 3, o.grand ? 17 : 11, c);
    if (o.grand) {
      // truss arcs
      for (let x = 0; x <= s.w; x += 4) {
        const t = x / s.w;
        const arc = Math.sin(Math.min(1, Math.max(0, (t - 0.18) / 0.6)) * Math.PI) * 12;
        px(s.ctx, x, y - 3 - arc, 2, 1, c);
        if (x % 12 === 0 && arc > 1) px(s.ctx, x, y - 2 - arc, 1, arc, s.c("#6a747c"));
      }
    }
  },
  tunnel(s, o) {
    const x = (o.x || 0.6) * s.w, y = s.groundY + 4;
    px(s.ctx, x - 12, y - 14, 24, 15, s.c("#8a8478"));
    for (let i = 0; i < 7; i++) {
      const span = Math.sqrt(1 - (i / 7) * (i / 7)) * 7;
      px(s.ctx, x - span, y - 12 + i, span * 2, 1, s.c("#241f1a"));
    }
    px(s.ctx, x - 8, y + 1, 16, 1, s.c("#5f5a4f"));
    px(s.ctx, x - 14, y - 15, 28, 2, s.c("#9a948a"));
  },
  cabin(s, o) {
    const x = (o.x || 0.3) * s.w, w = o.w || 34, y = s.groundY + 12;
    const body = s.c(o.color || "#96604a");
    px(s.ctx, x, y - 14, w, 15, body);
    px(s.ctx, x, y - 14, w, 4, s.c(shade(o.color || "#96604a", 0.8)));
    // roof
    for (let i = 0; i < 7; i++) px(s.ctx, x - 3 + i, y - 15 - i, w + 6 - i * 2, 1, s.c("#5d4430"));
    px(s.ctx, x + 4, y - 8, 6, 9, s.c("#3a2c20"));                 // door
    px(s.ctx, x + w - 11, y - 8, 7, 5, s.c(s.night ? "#e8cf7f" : "#b8d4dc")); // window
  },
  lodge(s) {
    const x = s.w * 0.24, y = s.groundY + 12, w = 64;
    px(s.ctx, x, y - 18, w, 19, s.c("#6e5138"));
    for (let i = 0; i < 10; i++) px(s.ctx, x - 4 + i * 1.4, y - 19 - i, w + 8 - i * 2.8, 1, s.c("#4a3624"));
    px(s.ctx, x + w / 2 - 4, y - 30, 8, 12, s.c("#5d442e")); // chimney tower
    for (let i = 0; i < 4; i++) px(s.ctx, x + 6 + i * 15, y - 10, 7, 6, s.c(s.night ? "#e8cf7f" : "#c2d8de"));
    px(s.ctx, x + w / 2 - 3, y - 8, 6, 9, s.c("#33261a"));
  },
  monument(s, o) {
    // terminus monument: stepped wooden pillars
    const x = (o.x || 0.6) * s.w, y = s.trailY - 2;
    const c = s.c("#a8845c"), d = s.c("#84633f");
    const hs = o.north ? [10, 15, 22, 15, 10] : [12, 17, 24, 17, 12];
    hs.forEach((hgt, i) => {
      px(s.ctx, x + i * 6, y - hgt, 5, hgt, i % 2 ? d : c);
      px(s.ctx, x + i * 6, y - hgt, 5, 2, s.c("#c2a074"));
    });
    px(s.ctx, x + 12, y - 26, 5, 2, s.c("#d8ba88"));
  },
  fence(s) {
    // the border fence, rusty and endless
    const y = s.groundY + 6;
    px(s.ctx, 0, y - 12, s.w, 1, s.c("#7d5a44"));
    for (let x = 2; x < s.w; x += 7) px(s.ctx, x, y - 12, 2, 13, s.c(hashNoise(x) > 0.5 ? "#8a6248" : "#75503a"));
    px(s.ctx, 0, y - 6, s.w, 1, s.c("#7d5a44"));
  },
  borderSign(s, o) {
    const x = s.w * 0.55, y = s.trailY - 4;
    px(s.ctx, x + 6, y - 18, 3, 18, s.c("#7a6248"));
    px(s.ctx, x, y - 26, 16, 9, s.c("#e0d8bc"));
    px(s.ctx, x, y - 26, 16, 1, s.c("#8a8268"));
    px(s.ctx, x + 2, y - 24, 5, 2, s.c("#4a5f8e")); // "CA"
    px(s.ctx, x + 9, y - 24, 5, 2, s.c("#4a5f8e")); // "OR"
    px(s.ctx, x + 2, y - 21, 12, 1, s.c("#8a8268"));
  },
  borderCut(s) {
    // the treeless swath cut along the US/Canada border
    const y = s.horizonY;
    px(s.ctx, s.w * 0.42, y - 26, s.w * 0.12, 26, s.c("#8fa06a"));
  },
  sign(s, o) {
    const x = (o.x || 0.5) * s.w, y = s.trailY - 2;
    px(s.ctx, x + 4, y - 12, 2, 12, s.c("#6e5438"));
    px(s.ctx, x, y - 17, 11, 6, s.c("#d8cba0"));
    px(s.ctx, x + 1, y - 15, 8, 2, s.c("#6b5e40"));
  },
  snowpatch(s) {
    for (let i = 0; i < 5; i++) {
      const x = hashNoise(i * 33 + 5) * s.w;
      const y = s.groundY + 3 + hashNoise(i * 27 + 1) * (s.trailY - s.groundY - 10);
      px(s.ctx, x, y, 12 + hashNoise(i * 3) * 10, 3, s.c("#e8edee"));
      px(s.ctx, x + 3, y + 3, 8, 1, s.c("#c8d4d8"));
    }
  },
  steam(s, o) {
    const x = (o.x || 0.3) * s.w;
    for (let i = 0; i < 4; i++) {
      const y = s.groundY - 2 - i * 7;
      px(s.ctx, x + Math.sin(i * 1.8) * 4, y, 6 - i, 4, s.c(i > 2 ? "#c8cec9" : "#dde4de"));
    }
    px(s.ctx, x - 3, s.groundY + 2, 12, 3, s.c("#9a8f78"));
  },
  goats(s) {
    for (let i = 0; i < 2; i++) {
      const x = s.w * (0.3 + i * 0.22), y = s.groundY + 8 + i * 5;
      px(s.ctx, x, y - 5, 9, 5, s.c("#eceae2"));
      px(s.ctx, x + 8, y - 8, 4, 4, s.c("#eceae2"));  // head
      px(s.ctx, x + 10, y - 9, 2, 2, s.c("#d8d5c8"));  // horn nub
      px(s.ctx, x + 1, y, 1, 4, s.c("#d8d5c8"));
      px(s.ctx, x + 7, y, 1, 4, s.c("#d8d5c8"));
    }
  },
  boat(s) {
    const x = s.w * 0.55, y = s.h * 0.68;
    px(s.ctx, x, y, 22, 4, s.c("#b04a3a"));
    px(s.ctx, x + 2, y - 4, 18, 4, s.c("#e8e2d0"));
    px(s.ctx, x + 8, y - 8, 6, 4, s.c("#8a8478"));
    px(s.ctx, x - 4, y + 4, 30, 1, s.c("#5786a8"));
  }
};

function pine(s, x, y, hgt, color) {
  px(s.ctx, x - 1, y - 4, 3, 5, s.c("#4f3a28"));
  for (let i = 0; i < hgt; i += 2) {
    const t = i / hgt;
    const span = (1 - t) * (hgt * 0.32) + 1;
    px(s.ctx, x - span, y - 4 - i, span * 2 + 1, 2, i % 4 === 0 ? shade(color, 0.88) : color);
  }
}

function fir(s, x, y, hgt, color) {
  px(s.ctx, x - 1, y - 3, 2, 4, s.c("#42301f"));
  for (let i = 0; i < hgt; i += 2) {
    const t = i / hgt;
    const span = Math.max(1, (1 - t) * (hgt * 0.26));
    px(s.ctx, x - span, y - 3 - i, span * 2 + 1, 2, i % 6 === 0 ? shade(color, 1.14) : color);
  }
  px(s.ctx, x, y - 3 - hgt, 1, 2, color);
}

function slab(s, cx, baseY, w, hgt, color) {
  // tilted parallelogram slab
  for (let i = 0; i < hgt; i++) {
    const t = i / hgt;
    const rowW = w * (1 - t * 0.72);
    const xOff = t * w * 0.34;
    px(s.ctx, cx - rowW / 2 + xOff, baseY - i, rowW, 1, i % 5 === 0 ? shade(color, 0.86) : color);
  }
}
