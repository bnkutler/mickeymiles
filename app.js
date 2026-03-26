/**
 * API base URL — no trailing slash.
 * - Override in index.html: window.MICKEY_API_BASE = "https://your-api.onrender.com"
 * - Default: local Node server for development
 */
const API_BASE = (typeof window !== "undefined" && window.MICKEY_API_BASE) || "http://localhost:3000";
const POLL_INTERVAL_MS = 4000;

/** Live tracker display state (updated from GET /api/state) */
let trackerState = {
  isMoving: false,
  speedMph: 0,
  lastUpdateLabel: "Connecting…"
};

/** Daily rows from backend; empty until first successful fetch */
let dailyLog = [];

let connectionMode = "loading";

async function fetchTrackerState() {
  const url = `${API_BASE}/api/state`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const data = await res.json();
  if (!data.tracker || !Array.isArray(data.dailyLog)) {
    throw new Error("bad response shape");
  }
  trackerState = {
    isMoving: Boolean(data.tracker.isMoving),
    speedMph: Number(data.tracker.speedMph) || 0,
    lastUpdateLabel: data.tracker.lastUpdateLabel || "Live"
  };
  dailyLog = data.dailyLog.map((row) => ({
    date: row.date,
    miles: Number(row.miles) || 0,
    wheelMinutes: Number(row.wheelMinutes) || 0,
    avgSpeedMph: Number(row.avgSpeedMph) || 0
  }));
  connectionMode = "live";
}

function applyOfflineState(message) {
  connectionMode = "offline";
  trackerState = {
    ...trackerState,
    lastUpdateLabel: message || "Cannot reach backend"
  };
}

function updateModeChip() {
  const el = document.getElementById("mode-chip");
  if (!el) return;
  el.classList.remove("chip-live", "chip-offline");
  if (connectionMode === "live") {
    el.textContent = "Live Tracker";
    el.classList.add("chip-live");
  } else if (connectionMode === "offline") {
    el.textContent = "Backend offline";
    el.classList.add("chip-offline");
  } else {
    el.textContent = "Connecting…";
  }
}

function startPolling() {
  const tick = async () => {
    try {
      await fetchTrackerState();
    } catch {
      applyOfflineState(`No response from ${API_BASE}`);
    }
    updateModeChip();
    renderStatus();
    renderLog();
    renderJourney();
  };
  tick();
  setInterval(tick, POLL_INTERVAL_MS);
}

const ROUTE_TOTAL_MILES = 2790;

const landmarks = [
  {
    name: "Santa Monica Pier",
    marker: 0,
    scene: "pier",
    copy: "Starting line at the coast. Mickey is fueled up and ready to leave the Pacific."
  },
  {
    name: "Los Angeles",
    marker: 20,
    scene: "hollywood",
    copy: "A quick city stretch with bright lights, hills, and a huge sign watching over the run."
  },
  {
    name: "Grand Canyon",
    marker: 490,
    scene: "canyon",
    copy: "A deep desert view with layered canyon walls and warm sunset colors."
  },
  {
    name: "Flagstaff",
    marker: 560,
    scene: "mountain_pines",
    copy: "Cooler air, pines, and mountain silhouettes around northern Arizona."
  },
  {
    name: "Albuquerque",
    marker: 920,
    scene: "sandia",
    copy: "Desert city lights under the Sandia Mountains and a wide New Mexico sky."
  },
  {
    name: "Santa Fe",
    marker: 985,
    scene: "pueblo",
    copy: "Adobe walls, soft earth tones, and a calm high-desert plaza vibe."
  },
  {
    name: "Cadillac Ranch",
    marker: 1270,
    scene: "cadillac",
    copy: "Colorful art cars poking up from the plains, perfect for a quirky checkpoint."
  },
  {
    name: "Amarillo, TX",
    marker: 1285,
    scene: "plains_sun",
    copy: "Open Texas skies and long flat stretches where the miles stack up fast."
  },
  {
    name: "Oklahoma City",
    marker: 1545,
    scene: "city_plains",
    copy: "Midwest city blocks, broad streets, and a skyline on the horizon."
  },
  {
    name: "St. Louis",
    marker: 1920,
    scene: "arch",
    copy: "The Gateway Arch marks a major milestone and a strong eastbound push."
  },
  {
    name: "Indianapolis",
    marker: 2165,
    scene: "speedway_city",
    copy: "A speed-themed stop is perfect for Mickey's wheel-powered marathon."
  },
  {
    name: "Columbus",
    marker: 2335,
    scene: "river_city",
    copy: "Tree-lined neighborhoods and city bridges as the final leg approaches."
  },
  {
    name: "Nashville",
    marker: 2415,
    scene: "music_city",
    copy: "Neon, stage lights, and a music-row inspired detour on the map display."
  },
  {
    name: "Pittsburgh",
    marker: 2580,
    scene: "bridges",
    copy: "Steel city bridges and rolling hills signal the northeastern stretch."
  },
  {
    name: "Philadelphia",
    marker: 2710,
    scene: "liberty_bell",
    copy: "Historic brick tones and a Liberty Bell icon before the final sprint."
  },
  {
    name: "New York City",
    marker: 2790,
    scene: "nyc",
    copy: "The skyline finish line. Mickey's coast-to-coast legend ends here."
  }
].sort((a, b) => a.marker - b.marker);

let selectedLandmarkIndex = 0;

function initTabs() {
  const tabButtons = Array.from(document.querySelectorAll(".tab-button"));
  const panels = {
    status: document.getElementById("tab-status"),
    log: document.getElementById("tab-log"),
    journey: document.getElementById("tab-journey")
  };

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      tabButtons.forEach((other) => other.classList.remove("is-active"));
      button.classList.add("is-active");
      const tab = button.dataset.tab;
      Object.values(panels).forEach((panel) => panel.classList.remove("is-active"));
      panels[tab].classList.add("is-active");
    });
  });
}

function formatDateLabel(isoDate) {
  const date = new Date(`${isoDate}T12:00:00`);
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric"
  });
}

function formatMinutes(minutes) {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (!hrs) return `${mins} min`;
  return `${hrs}h ${mins.toString().padStart(2, "0")}m`;
}

function renderStatus() {
  const statusStrip = document.getElementById("status-strip");
  const wheelState = document.getElementById("wheel-state");
  const lastUpdate = document.getElementById("last-update");
  const speedValue = document.getElementById("speed-value");
  const meterFill = document.getElementById("meter-fill");

  statusStrip.textContent = trackerState.isMoving ? "On the Move" : "Resting and Refueling";
  statusStrip.style.borderColor = trackerState.isMoving ? "#7f9159" : "#7da167";
  statusStrip.style.background = trackerState.isMoving
    ? "rgba(158, 169, 106, 0.12)"
    : "rgba(140, 188, 114, 0.08)";
  statusStrip.style.color = trackerState.isMoving ? "#f0efd8" : "#dcebcf";

  wheelState.textContent = trackerState.isMoving ? "Moving" : "Stopped";
  lastUpdate.textContent = trackerState.lastUpdateLabel;
  speedValue.textContent = trackerState.speedMph.toFixed(1);
  meterFill.style.width = `${Math.min(100, (trackerState.speedMph / 8) * 100)}%`;

  const meterNote = document.querySelector(".meter-note");
  if (meterNote) {
    meterNote.textContent = trackerState.isMoving
      ? "Mickey is on the wheel."
      : "Wheel is not moving, so Mickey is shown at rest.";
  }

  drawStatusScene(document.getElementById("status-scene-canvas"), trackerState.isMoving);
}

function renderLog() {
  const logList = document.getElementById("log-list");
  logList.innerHTML = "";

  if (!dailyLog.length) {
    const empty = document.createElement("li");
    empty.className = "log-item log-row log-empty";
    empty.innerHTML =
      "<span>No daily data yet — when the tracker sends telemetry, days appear here.</span>";
    logList.appendChild(empty);
    return;
  }

  [...dailyLog]
    .sort((a, b) => b.date.localeCompare(a.date))
    .forEach((entry) => {
      const item = document.createElement("li");
      item.className = "log-item log-row";
      item.innerHTML = `
        <span>${formatDateLabel(entry.date)}</span>
        <span>${entry.miles.toFixed(1)} mi</span>
        <span>${formatMinutes(entry.wheelMinutes)}</span>
        <span>${entry.avgSpeedMph.toFixed(1)} mph</span>
      `;
      logList.appendChild(item);
    });
}

function getJourneyStats() {
  const totalMiles = dailyLog.reduce((sum, row) => sum + row.miles, 0);
  const days = dailyLog.length;
  const milesLeft = Math.max(ROUTE_TOTAL_MILES - totalMiles, 0);
  let currentLandmark = landmarks[0];

  for (const landmark of landmarks) {
    if (totalMiles >= landmark.marker) {
      currentLandmark = landmark;
    } else {
      break;
    }
  }

  return { totalMiles, days, milesLeft, currentLandmark };
}

function renderJourney() {
  const stats = getJourneyStats();
  document.getElementById("journey-days").textContent = String(stats.days);
  document.getElementById("journey-total").textContent = stats.totalMiles.toFixed(1);
  document.getElementById("journey-left").textContent = stats.milesLeft.toFixed(1);
  document.getElementById("journey-subtitle").textContent =
    `Current checkpoint: ${stats.currentLandmark.name}`;
  document.getElementById("current-landmark").textContent = stats.currentLandmark.name;
  document.getElementById("current-landmark-copy").textContent = stats.currentLandmark.copy;
  document.getElementById("current-mile-marker").textContent = `${stats.currentLandmark.marker} mi`;

  const progressPct = Math.min(100, (stats.totalMiles / ROUTE_TOTAL_MILES) * 100);
  document.getElementById("journey-progress").style.width = `${progressPct}%`;
  document.getElementById("journey-mickey").style.left = `${progressPct}%`;

  drawLandmarkScene(document.getElementById("journey-scene-canvas"), stats.currentLandmark.scene, true);

  selectedLandmarkIndex = landmarks.findIndex((landmark) => landmark.name === stats.currentLandmark.name);
  renderLandmarkList(stats.totalMiles, stats.currentLandmark.name);
  renderLandmarkPreview(landmarks[selectedLandmarkIndex], stats.totalMiles);
}

function renderLandmarkList(totalMiles, currentLandmarkName) {
  const landmarkList = document.getElementById("landmark-list");
  landmarkList.innerHTML = "";

  landmarks.forEach((landmark, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "landmark-button";
    if (landmark.name === currentLandmarkName) {
      button.classList.add("is-current");
    }
    if (index === selectedLandmarkIndex) {
      button.classList.add("is-selected");
    }

    const milesAway = Math.max(0, landmark.marker - totalMiles);
    button.innerHTML = `
      <span class="landmark-name">${landmark.name}</span>
      <span class="landmark-detail">${milesAway === 0 ? "Reached" : `${milesAway.toFixed(1)} mi away`}</span>
    `;
    button.addEventListener("click", () => {
      selectedLandmarkIndex = index;
      renderLandmarkList(totalMiles, currentLandmarkName);
      renderLandmarkPreview(landmark, totalMiles);
    });

    landmarkList.appendChild(button);
  });
}

function renderLandmarkPreview(landmark, totalMiles) {
  document.getElementById("preview-landmark-name").textContent = landmark.name;
  document.getElementById("preview-landmark-copy").textContent = landmark.copy;
  const milesAway = Math.max(0, landmark.marker - totalMiles);
  document.getElementById("preview-distance").textContent =
    milesAway === 0 ? "Mickey has reached this stop" : `${milesAway.toFixed(1)} miles away`;
  drawLandmarkScene(document.getElementById("preview-scene-canvas"), landmark.scene, false);
}

function drawStatusScene(canvas, isMoving) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  fillRect(ctx, 0, 0, w, h, "#171b14");
  fillRect(ctx, 0, 0, w, 74, "#5f7f56");
  fillRect(ctx, 0, 74, w, 42, "#394231");
  fillRect(ctx, 0, 116, w, 28, "#4c3b2e");

  for (let x = 0; x < w; x += 12) {
    fillRect(ctx, x, 18 + (x % 24 === 0 ? 1 : 0), 8, 2, "rgba(236,241,220,0.35)");
  }
  drawCloudBand(ctx, 16, 18, "#d8e6c6");
  drawCloudBand(ctx, 102, 26, "#cfe0bb");

  for (let x = 0; x < w; x += 10) {
    fillRect(ctx, x, 121 + ((x / 10) % 2), 5, 2, "#6a5643");
    fillRect(ctx, x + 4, 132 + ((x / 10) % 3), 3, 2, "#3f3127");
  }

  drawWheelStand(ctx, 129, 102);
  drawWheel(ctx, 138, 72, 41, isMoving);
  drawHamsterSprite(ctx, isMoving ? "run" : "rest", 36, 84, 3);
  drawFoodDish(ctx, 28, 116);
  drawPlantPot(ctx, 10, 102);
}

function drawWheel(ctx, cx, cy, radius, isMoving) {
  const colors = {
    rim: "#c8c4b4",
    rimDark: "#8f8878",
    spokes: isMoving ? "#c9d7aa" : "#a39f91",
    shadow: "#1a1914"
  };

  fillCircle(ctx, cx, cy, radius + 4, colors.shadow);
  fillCircle(ctx, cx, cy, radius, colors.rimDark);
  fillCircle(ctx, cx, cy, radius - 5, "#171a14");
  fillCircle(ctx, cx, cy, radius - 7, colors.rim);
  fillCircle(ctx, cx, cy, radius - 14, "#171a14");

  const spokeOffset = isMoving ? 8 : 0;
  for (let i = 0; i < 8; i += 1) {
    const angle = ((Math.PI * 2) / 8) * i + (spokeOffset * Math.PI) / 180;
    const x2 = Math.round(cx + Math.cos(angle) * (radius - 16));
    const y2 = Math.round(cy + Math.sin(angle) * (radius - 16));
    drawPixelLine(ctx, cx, cy, x2, y2, colors.spokes, 2);
  }
  fillCircle(ctx, cx, cy, 6, "#d9d4c1");
  fillCircle(ctx, cx, cy, 3, "#8d876f");
}

function drawHamsterSprite(ctx, pose, x, y, scale) {
  const sprites = {
    rest: [
      "........................",
      ".......ee...............",
      ".....bbbbbb.............",
      "....bbbbbbbww...........",
      "...bbbbbbbbwwww.........",
      "...bbbbbbbggwwww........",
      "..bbbbbbbbgggwwww.......",
      "..bbbbbbbggggwwwww......",
      "..bbbbbbgggggwwwwww.....",
      "..bbbbbggggwwwwbbww.....",
      "...bbbbgggwwwwwbbbww....",
      "....bbgggwwwwwbbbbww....",
      ".....gggwwwwwbbbbbw.....",
      "....pp.gwwwwbbbbww......",
      "...pp...wwwwwwwww.......",
      "........................"
    ],
    run: [
      "........................",
      ".......ee...............",
      ".....bbbbbb.............",
      "....bbbbbbbww...........",
      "...bbbbbbbbwwww.........",
      "..bbbbbbbbggwwww........",
      "..bbbbbbbggggwwww.......",
      "..bbbbbbgggggwwwww......",
      "...bbbbggggwwwwwbbw.....",
      "....bbgggwwwwwbbbww.....",
      "...ggggwwwwwwbbbbbw.....",
      "..g..gwwwwwwbbbbbw......",
      ".pp..gwwwwwbbbbww.......",
      "pp....wwwwwwwww........",
      "..pp...wwwww............",
      "........................"
    ]
  };

  const palette = {
    b: "#060606",
    g: "#a8a89d",
    w: "#f1f0ea",
    p: "#ddb3ac",
    e: "#d9c7c0",
    ".": null
  };

  const sprite = sprites[pose];
  sprite.forEach((row, rowIndex) => {
    [...row].forEach((pixel, colIndex) => {
      const color = palette[pixel];
      if (!color) return;
      fillRect(ctx, x + colIndex * scale, y + rowIndex * scale, scale, scale, color);
    });
  });

  fillRect(ctx, x + 9 * scale, y + 5 * scale, scale, scale, "#ffffff");
  fillRect(ctx, x + 10 * scale, y + 5 * scale, scale, scale, "#111111");
  fillRect(ctx, x + 17 * scale, y + 10 * scale, scale, scale, "#111111");
}

function drawLandmarkScene(canvas, sceneType, includeHamster) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  const scene = scenePalette(sceneType);

  fillRect(ctx, 0, 0, w, h, scene.sky);
  fillRect(ctx, 0, h * 0.42, w, h * 0.16, scene.sky2);
  fillRect(ctx, 0, h * 0.58, w, h * 0.17, scene.horizon);
  fillRect(ctx, 0, h * 0.75, w, h * 0.25, scene.ground);

  if (scene.night) {
    drawStars(ctx, w, Math.floor(h * 0.45), scene.star);
  } else {
    drawSun(ctx, w - 34, 24, scene.sun);
    drawCloudBand(ctx, 22, 16, scene.cloud);
    drawCloudBand(ctx, 138, 28, scene.cloud2 || scene.cloud);
  }

  drawDistantHills(ctx, w, Math.floor(h * 0.76), scene.hillA, scene.hillB);

  for (let x = 0; x < w; x += 16) {
    fillRect(ctx, x, h - 14, 8, 3, scene.groundDetail);
    fillRect(ctx, x + 6, h - 9, 5, 2, scene.groundDetail2);
  }

  drawSceneMotif(ctx, sceneType, w, h, scene);

  if (includeHamster) {
    drawHamsterSprite(ctx, "rest", 14, h - 52, 3);
  }
}

function scenePalette(sceneType) {
  const palettes = {
    pier: { sky: "#83b9c8", sky2: "#a9d4d8", horizon: "#6f9da0", ground: "#4f5e4a", groundDetail: "#3c4638", groundDetail2: "#657459", accent: "#d6c07a", accent2: "#ede7cd", structure: "#7a5f43", hillA: "#607064", hillB: "#6f7f74", cloud: "#dde9db", cloud2: "#cfdccf", sun: "#efd59a", star: "#efeccf" },
    hollywood: { sky: "#9ec4a4", sky2: "#bfd8b1", horizon: "#7fa27a", ground: "#4f6944", groundDetail: "#3a5034", groundDetail2: "#647f58", accent: "#efe8d8", accent2: "#d8e7cc", structure: "#405540", hillA: "#596f52", hillB: "#6f865f", cloud: "#e6eddc", sun: "#edd798", star: "#efeccf" },
    canyon: { sky: "#d8b089", sky2: "#e8c49e", horizon: "#b97b5f", ground: "#82503d", groundDetail: "#633a2b", groundDetail2: "#9d624b", accent: "#f0dab0", accent2: "#cb7f5e", structure: "#ae6f56", hillA: "#9f6953", hillB: "#b57c60", cloud: "#efe0c7", sun: "#f0cb87", star: "#f5e5bf" },
    mountain_pines: { sky: "#9dc1c6", sky2: "#b6d0d0", horizon: "#697f83", ground: "#425744", groundDetail: "#304034", groundDetail2: "#58705a", accent: "#dbe6e2", accent2: "#8caab2", structure: "#314143", hillA: "#526864", hillB: "#6a7f7b", cloud: "#e1e9e4", sun: "#e5d394", star: "#ece8c7" },
    sandia: { sky: "#caa59f", sky2: "#ddbeb5", horizon: "#8f7b8f", ground: "#5e4b42", groundDetail: "#48382f", groundDetail2: "#756058", accent: "#ecd7b3", accent2: "#c9b5d3", structure: "#7d6e74", hillA: "#7e6575", hillB: "#957c8a", cloud: "#eadfda", sun: "#edd39a", star: "#efe8d0" },
    pueblo: { sky: "#a5c2ba", sky2: "#bfd2c5", horizon: "#c5a07f", ground: "#8a6148", groundDetail: "#674834", groundDetail2: "#a37454", accent: "#ead6bc", accent2: "#7baab0", structure: "#bf7d56", hillA: "#967261", hillB: "#ae866f", cloud: "#e7e4d8", sun: "#ecd79a", star: "#efe8cf" },
    cadillac: { sky: "#a9c2b6", sky2: "#c5d8c6", horizon: "#c7ab7c", ground: "#79563b", groundDetail: "#5b402c", groundDetail2: "#98704f", accent: "#d36f8c", accent2: "#7dcfad", structure: "#d1ccc1", hillA: "#8c7457", hillB: "#a38a67", cloud: "#ebeee3", sun: "#e9cf8d", star: "#f0e7c8" },
    plains_sun: { sky: "#b2cab1", sky2: "#cfddbf", horizon: "#d8c08b", ground: "#776942", groundDetail: "#5e5332", groundDetail2: "#948553", accent: "#efe7c6", accent2: "#d99f60", structure: "#7e6f4e", hillA: "#8d8057", hillB: "#9f9164", cloud: "#eff1e3", sun: "#f0d78d", star: "#f3ebcb" },
    city_plains: { sky: "#aabdb2", sky2: "#c7d1c3", horizon: "#85979c", ground: "#4d5b53", groundDetail: "#39443e", groundDetail2: "#66776e", accent: "#dde4da", accent2: "#d8c489", structure: "#66756c", hillA: "#5c6d64", hillB: "#73847a", cloud: "#e9ece4", sun: "#e9d391", star: "#eeebcf" },
    arch: { sky: "#aec0ba", sky2: "#ccd7ce", horizon: "#9ab39b", ground: "#4e6059", groundDetail: "#394943", groundDetail2: "#667b73", accent: "#e3e0d8", accent2: "#f4f1e8", structure: "#cfc9bb", hillA: "#667b71", hillB: "#7e9488", cloud: "#e8ede5", sun: "#ead79a", star: "#f0ebd0" },
    speedway_city: { sky: "#aeb6a8", sky2: "#c7cbbe", horizon: "#8c9290", ground: "#52524d", groundDetail: "#3d3d39", groundDetail2: "#6a6a64", accent: "#bf7d67", accent2: "#ece8dc", structure: "#b8b3a7", hillA: "#5d615a", hillB: "#767b72", cloud: "#e9e8e1", sun: "#e6cf93", star: "#ece7cd" },
    river_city: { sky: "#a9c0bf", sky2: "#bfd4d2", horizon: "#76949c", ground: "#486067", groundDetail: "#33464b", groundDetail2: "#617a82", accent: "#d3e4df", accent2: "#93b99c", structure: "#8f9ea2", hillA: "#567178", hillB: "#6e8b92", cloud: "#e5ece8", sun: "#e9d69b", star: "#eeebd0" },
    music_city: { sky: "#9a9f8f", sky2: "#b5ba9e", horizon: "#8a6e72", ground: "#4f403f", groundDetail: "#3a2f2e", groundDetail2: "#695554", accent: "#dec878", accent2: "#b6d8ca", structure: "#9a7d73", hillA: "#5d5250", hillB: "#726564", cloud: "#ece8de", sun: "#ebd391", star: "#efe8cd", night: true },
    bridges: { sky: "#a8b8b4", sky2: "#c2ccc9", horizon: "#77888f", ground: "#4f5960", groundDetail: "#394146", groundDetail2: "#66717a", accent: "#d9c483", accent2: "#dde5e1", structure: "#98a2a7", hillA: "#59656c", hillB: "#717f88", cloud: "#e6ebea", sun: "#e7d39a", star: "#ece9ce" },
    liberty_bell: { sky: "#b8c8bf", sky2: "#d2d8c8", horizon: "#c3a483", ground: "#6e5446", groundDetail: "#523d33", groundDetail2: "#856657", accent: "#dbb56f", accent2: "#d0e0d6", structure: "#b38164", hillA: "#85695a", hillB: "#9a7d68", cloud: "#ecebe1", sun: "#e7d194", star: "#efe8cf" },
    nyc: { sky: "#556267", sky2: "#68777a", horizon: "#6f7670", ground: "#30362f", groundDetail: "#222720", groundDetail2: "#40473f", accent: "#dccf84", accent2: "#a4c8b9", structure: "#8d948f", hillA: "#434a44", hillB: "#575f58", cloud: "#b7c2b9", sun: "#d8c17f", star: "#f0e9c8", night: true }
  };

  return palettes[sceneType] || palettes.pier;
}

function drawSceneMotif(ctx, sceneType, width, height, palette) {
  const baseY = Math.floor(height * 0.75);

  if (sceneType === "pier") {
    fillRect(ctx, 0, baseY - 8, width, 8, "#496f75");
    for (let x = 0; x < width; x += 10) fillRect(ctx, x, baseY - 5 + (x % 20 ? 1 : 0), 6, 1, "#7cb0b3");
    fillRect(ctx, 28, baseY - 34, 92, 4, palette.structure);
    for (let x = 32; x < 120; x += 16) fillRect(ctx, x, baseY - 30, 4, 28, palette.structure);
    drawFerrisWheel(ctx, 148, baseY - 30, 18, "#e7dfc7", "#c2b17b");
    fillRect(ctx, 132, 42, 28, 20, palette.accent2);
    fillRect(ctx, 136, 34, 20, 8, palette.accent);
    return;
  }

  if (sceneType === "hollywood") {
    drawHill(ctx, 0, baseY - 12, width, 26, "#2e4f2f");
    drawPalmTree(ctx, 24, baseY - 8, "#5d422d", "#2f5a34");
    drawPalmTree(ctx, 182, baseY - 6, "#5d422d", "#2f5a34");
    fillRect(ctx, 112, baseY - 54, 54, 4, palette.accent);
    const sign = ["H", "O", "L", "L", "Y", "W", "O", "O", "D"];
    sign.forEach((letter, idx) => drawLetterBlock(ctx, 114 + idx * 6, baseY - 62, letter, 1, palette.accent));
    return;
  }

  if (sceneType === "canyon") {
    drawCanyonLayer(ctx, 0, baseY - 48, width, 34, "#c46e4f");
    drawCanyonLayer(ctx, 0, baseY - 28, width, 24, "#a9513d");
    fillRect(ctx, 160, 18, 12, 12, palette.accent);
    return;
  }

  if (sceneType === "mountain_pines") {
    drawMountains(ctx, width, baseY, ["#607b96", "#46627d", "#334d67"]);
    drawPines(ctx, 26, baseY - 4, 5, "#162b1f");
    drawPines(ctx, 140, baseY - 2, 6, "#1c3628");
    return;
  }

  if (sceneType === "sandia") {
    drawMountains(ctx, width, baseY, ["#8e6aa1", "#755488", "#5f426f"]);
    drawHotAirBalloon(ctx, 20, baseY - 34, "#dcbf88", "#7b6d54");
    drawCityBlocks(ctx, 28, baseY - 18, 100, 16, palette.structure, "#ffd8b8");
    return;
  }

  if (sceneType === "pueblo") {
    fillRect(ctx, 26, baseY - 36, 56, 28, palette.structure);
    fillRect(ctx, 42, baseY - 48, 30, 12, palette.structure);
    fillRect(ctx, 48, baseY - 22, 8, 14, "#40302a");
    fillRect(ctx, 92, baseY - 42, 50, 34, "#b96f4f");
    fillRect(ctx, 108, baseY - 24, 10, 16, "#40302a");
    return;
  }

  if (sceneType === "cadillac") {
    const carColors = ["#ff5da2", "#62ffb5", "#ffdd66", "#8cc0ff", "#ff7f59"];
    carColors.forEach((color, index) => {
      const x = 18 + index * 26;
      fillRect(ctx, x, baseY - 26 + index, 8, 22, color);
      fillRect(ctx, x + 6, baseY - 28 + index, 4, 24, "#d9d9d9");
    });
    return;
  }

  if (sceneType === "plains_sun") {
    fillRect(ctx, 168, 18, 16, 16, palette.accent);
    drawHill(ctx, 0, baseY - 10, width, 18, "#8d7b3c");
    fillRect(ctx, 38, baseY - 18, 54, 8, palette.structure);
    drawRoadSign(ctx, 112, baseY - 18, "#d6d1bb", "#6f6340");
    return;
  }

  if (sceneType === "city_plains") {
    drawCityBlocks(ctx, 18, baseY - 36, 150, 34, palette.structure, palette.accent2);
    fillRect(ctx, 86, baseY - 52, 12, 16, palette.structure);
    drawBridge(ctx, 12, baseY - 12, 70, 10, "#879188");
    return;
  }

  if (sceneType === "arch") {
    drawCityBlocks(ctx, 22, baseY - 20, 82, 18, "#7d8c87", "#e4e4da");
    fillRect(ctx, 110, baseY - 16, 26, 14, "#b29b87");
    drawArch(ctx, 148, baseY - 8, 38, 58, palette.structure);
    return;
  }

  if (sceneType === "speedway_city") {
    drawCityBlocks(ctx, 26, baseY - 26, 96, 24, palette.structure, "#f0f7ff");
    drawPagoda(ctx, 114, baseY - 22, "#d0c9b4", "#9a3f33");
    drawOvalTrack(ctx, 154, baseY - 10, 56, 18, "#b4becd", "#3a414e");
    return;
  }

  if (sceneType === "river_city") {
    fillRect(ctx, 0, baseY - 12, width, 8, "#2f6d9b");
    drawBridge(ctx, 44, baseY - 16, 96, 18, palette.structure);
    drawCityBlocks(ctx, 18, baseY - 34, 74, 20, "#7f95aa", "#d8f5ff");
    fillRect(ctx, 92, baseY - 46, 10, 32, "#6f808f");
    return;
  }

  if (sceneType === "music_city") {
    drawCityBlocks(ctx, 20, baseY - 30, 122, 28, "#6a6258", "#d6c581");
    drawBatmanTower(ctx, 158, baseY - 8, "#9b8f81");
    drawMusicNote(ctx, 178, baseY - 26, "#d9c078");
    return;
  }

  if (sceneType === "bridges") {
    fillRect(ctx, 0, baseY - 10, width, 10, "#32597e");
    drawBridge(ctx, 18, baseY - 14, 132, 22, palette.structure);
    drawBridge(ctx, 76, baseY - 20, 98, 14, "#c2a46b");
    drawHill(ctx, 152, baseY - 26, 90, 24, "#4f6075");
    return;
  }

  if (sceneType === "liberty_bell") {
    fillRect(ctx, 26, baseY - 34, 68, 28, palette.structure);
    fillRect(ctx, 36, baseY - 22, 12, 16, "#49362f");
    fillRect(ctx, 62, baseY - 40, 5, 34, "#8c6f5e");
    fillRect(ctx, 58, baseY - 44, 13, 4, "#b9977f");
    drawBell(ctx, 146, baseY - 8, palette.accent);
    return;
  }

  if (sceneType === "nyc") {
    drawCityBlocks(ctx, 16, baseY - 46, 164, 44, palette.structure, "#dcca7b");
    fillRect(ctx, 102, baseY - 64, 10, 18, palette.structure);
    fillRect(ctx, 105, baseY - 72, 4, 8, palette.accent2);
    fillRect(ctx, 0, baseY - 8, width, 8, "#27446b");
    drawStatueOfLiberty(ctx, 24, baseY - 8, "#9bb8a8");
  }
}

function drawCloudBand(ctx, x, y, color) {
  fillRect(ctx, x, y, 18, 4, color);
  fillRect(ctx, x + 4, y - 3, 10, 3, color);
  fillRect(ctx, x + 12, y + 2, 8, 3, color);
}

function drawWheelStand(ctx, x, y) {
  fillRect(ctx, x - 10, y - 32, 4, 36, "#6a5b48");
  fillRect(ctx, x + 18, y - 32, 4, 36, "#6a5b48");
  fillRect(ctx, x - 14, y + 4, 42, 4, "#534534");
  fillRect(ctx, x - 2, y - 16, 14, 4, "#7c6f59");
}

function drawFoodDish(ctx, x, y) {
  fillRect(ctx, x, y, 22, 4, "#a38f78");
  fillRect(ctx, x + 2, y - 4, 18, 4, "#c8b59a");
  fillRect(ctx, x + 5, y - 6, 3, 2, "#d8d1a3");
  fillRect(ctx, x + 11, y - 7, 4, 2, "#bda55f");
}

function drawPlantPot(ctx, x, y) {
  fillRect(ctx, x + 2, y + 8, 14, 10, "#8a6a4a");
  fillRect(ctx, x, y + 6, 18, 3, "#b58c64");
  fillRect(ctx, x + 7, y - 6, 3, 12, "#5d7a47");
  fillRect(ctx, x + 3, y - 4, 5, 3, "#7ea35f");
  fillRect(ctx, x + 9, y - 2, 6, 3, "#8fb76a");
}

function drawStars(ctx, width, maxY, color) {
  for (let x = 8; x < width; x += 19) {
    const y = 8 + ((x * 7) % Math.max(12, maxY - 10));
    fillRect(ctx, x, y, 1, 1, color);
    if (x % 3 === 0) {
      fillRect(ctx, x - 1, y, 3, 1, color);
      fillRect(ctx, x, y - 1, 1, 3, color);
    }
  }
}

function drawSun(ctx, x, y, color) {
  fillRect(ctx, x, y, 10, 10, color);
  fillRect(ctx, x + 2, y - 3, 6, 3, color);
  fillRect(ctx, x + 2, y + 10, 6, 3, color);
  fillRect(ctx, x - 3, y + 2, 3, 6, color);
  fillRect(ctx, x + 10, y + 2, 3, 6, color);
}

function drawDistantHills(ctx, width, baseY, colorA, colorB) {
  drawHill(ctx, 0, baseY - 18, width, 18, colorA);
  drawHill(ctx, 0, baseY - 10, width, 10, colorB);
}

function drawFerrisWheel(ctx, cx, cy, radius, rim, gondola) {
  fillCircle(ctx, cx, cy, radius, rim);
  fillCircle(ctx, cx, cy, radius - 2, "rgba(0,0,0,0)");
  fillCircle(ctx, cx, cy, radius - 4, "#7b9da0");
  fillCircle(ctx, cx, cy, radius - 7, "#5b7a7d");
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI * 2 * i) / 6;
    const gx = Math.round(cx + Math.cos(angle) * (radius - 2));
    const gy = Math.round(cy + Math.sin(angle) * (radius - 2));
    fillRect(ctx, gx - 1, gy - 1, 3, 3, gondola);
    drawPixelLine(ctx, cx, cy, gx, gy, "#e7e0c7", 1);
  }
}

function drawPalmTree(ctx, x, baseY, trunk, leaf) {
  fillRect(ctx, x, baseY - 18, 3, 18, trunk);
  fillRect(ctx, x - 1, baseY - 14, 5, 2, trunk);
  fillRect(ctx, x - 5, baseY - 20, 12, 2, leaf);
  fillRect(ctx, x - 2, baseY - 23, 7, 2, leaf);
  fillRect(ctx, x - 6, baseY - 17, 5, 2, leaf);
  fillRect(ctx, x + 4, baseY - 17, 5, 2, leaf);
}

function drawHotAirBalloon(ctx, x, y, balloon, basket) {
  fillRect(ctx, x, y, 10, 8, balloon);
  fillRect(ctx, x + 2, y - 3, 6, 3, balloon);
  drawPixelLine(ctx, x + 2, y + 8, x + 4, y + 12, basket, 1);
  drawPixelLine(ctx, x + 8, y + 8, x + 6, y + 12, basket, 1);
  fillRect(ctx, x + 3, y + 12, 4, 2, basket);
}

function drawRoadSign(ctx, x, baseY, signColor, poleColor) {
  fillRect(ctx, x + 6, baseY - 14, 2, 14, poleColor);
  fillRect(ctx, x, baseY - 18, 14, 6, signColor);
  fillRect(ctx, x + 2, baseY - 16, 10, 2, "#7c6a45");
}

function drawPagoda(ctx, x, y, bodyColor, roofColor) {
  fillRect(ctx, x, y + 10, 18, 10, bodyColor);
  fillRect(ctx, x - 2, y + 8, 22, 2, roofColor);
  fillRect(ctx, x + 2, y + 4, 14, 4, bodyColor);
  fillRect(ctx, x, y + 2, 18, 2, roofColor);
  fillRect(ctx, x + 7, y - 2, 4, 4, bodyColor);
}

function drawBatmanTower(ctx, x, baseY, color) {
  fillRect(ctx, x, baseY - 34, 20, 34, color);
  fillRect(ctx, x + 2, baseY - 40, 5, 6, color);
  fillRect(ctx, x + 13, baseY - 40, 5, 6, color);
  fillRect(ctx, x + 5, baseY - 30, 2, 2, "#d7c57a");
  fillRect(ctx, x + 13, baseY - 26, 2, 2, "#d7c57a");
}

function drawStatueOfLiberty(ctx, x, baseY, color) {
  fillRect(ctx, x, baseY - 4, 12, 4, "#6c6f63");
  fillRect(ctx, x + 4, baseY - 18, 4, 14, color);
  fillRect(ctx, x + 3, baseY - 22, 6, 4, color);
  fillRect(ctx, x + 8, baseY - 20, 5, 2, color);
  fillRect(ctx, x + 12, baseY - 25, 2, 7, "#d8c97d");
}

function drawCityBlocks(ctx, x, y, width, height, buildingColor, windowColor) {
  let cursor = x;
  while (cursor < x + width) {
    const w = 10 + ((cursor / 7) % 5) * 4;
    const h = 10 + ((cursor / 9) % 6) * 4;
    fillRect(ctx, cursor, y + Math.max(0, height - h), Math.min(w, x + width - cursor), h, buildingColor);
    for (let wx = cursor + 2; wx < cursor + w - 1; wx += 4) {
      for (let wy = y + Math.max(0, height - h) + 2; wy < y + height - 1; wy += 5) {
        fillRect(ctx, wx, wy, 2, 2, windowColor);
      }
    }
    cursor += Math.max(10, Math.min(w + 3, 20));
  }
}

function drawMountains(ctx, width, baseY, colors) {
  const peaks = [
    { x: 28, h: 42, w: 78, color: colors[0] },
    { x: 96, h: 58, w: 92, color: colors[1] },
    { x: 168, h: 38, w: 76, color: colors[2] }
  ];
  peaks.forEach((peak) => {
    for (let row = 0; row < peak.h; row += 2) {
      const span = Math.floor((row / peak.h) * peak.w);
      fillRect(ctx, peak.x - span / 2, baseY - row, span + 8, 2, peak.color);
    }
  });
}

function drawPines(ctx, startX, baseY, count, color) {
  for (let i = 0; i < count; i += 1) {
    const x = startX + i * 18;
    fillRect(ctx, x + 4, baseY - 14, 3, 14, "#3d2a1f");
    for (let row = 0; row < 12; row += 3) {
      fillRect(ctx, x + 1 - row / 3, baseY - 14 + row, 9 + row * 2, 2, color);
    }
  }
}

function drawCanyonLayer(ctx, x, y, width, height, color) {
  for (let i = 0; i < width; i += 14) {
    const stepHeight = height - ((i / 14) % 3) * 6;
    fillRect(ctx, x + i, y + (height - stepHeight), 16, stepHeight, color);
  }
}

function drawHill(ctx, x, y, width, height, color) {
  for (let i = 0; i < width; i += 8) {
    const bump = Math.round(Math.sin(i / 18) * 4);
    fillRect(ctx, x + i, y + bump, 10, height - bump, color);
  }
}

function drawArch(ctx, x, baseY, width, height, color) {
  for (let row = 0; row < height; row += 2) {
    const ratio = row / height;
    const inset = Math.round((ratio * ratio) * (width / 2 - 3));
    fillRect(ctx, x + inset, baseY - row, 3, 2, color);
    fillRect(ctx, x + width - inset - 3, baseY - row, 3, 2, color);
  }
  fillRect(ctx, x + Math.floor(width / 2) - 2, baseY - height + 4, 4, 4, color);
}

function drawOvalTrack(ctx, x, y, width, height, lineColor, innerColor) {
  fillRect(ctx, x, y, width, height, lineColor);
  fillRect(ctx, x + 3, y + 3, width - 6, height - 6, innerColor);
  fillRect(ctx, x + 8, y + 7, width - 16, height - 14, "#1f2430");
}

function drawBridge(ctx, x, y, width, height, color) {
  fillRect(ctx, x, y + height - 4, width, 4, color);
  fillRect(ctx, x + 10, y + 4, 4, height - 8, color);
  fillRect(ctx, x + width - 14, y + 4, 4, height - 8, color);
  for (let i = 0; i <= 4; i += 1) {
    const px = x + 12 + i * ((width - 28) / 4);
    fillRect(ctx, px, y + 4, 2, 2, color);
    drawPixelLine(ctx, px + 1, y + 6, x + Math.floor(width / 2), y + height - 5, color, 1);
  }
}

function drawBell(ctx, x, baseY, color) {
  fillRect(ctx, x + 6, baseY - 28, 18, 4, color);
  fillRect(ctx, x + 3, baseY - 24, 24, 4, color);
  for (let row = 0; row < 18; row += 2) {
    fillRect(ctx, x + 4 - Math.floor(row / 6), baseY - 20 + row, 22 + Math.floor(row / 3), 2, color);
  }
  fillRect(ctx, x + 14, baseY - 2, 4, 4, "#7b4d15");
}

function drawMusicNote(ctx, x, y, color) {
  fillRect(ctx, x, y, 3, 12, color);
  fillRect(ctx, x + 3, y, 8, 3, color);
  fillRect(ctx, x + 8, y + 3, 3, 10, color);
  fillRect(ctx, x - 3, y + 9, 6, 4, color);
  fillRect(ctx, x + 5, y + 10, 6, 4, color);
}

function drawLetterBlock(ctx, x, y, letter, scale, color) {
  const glyphs = {
    H: ["101", "101", "111", "101", "101"],
    O: ["111", "101", "101", "101", "111"],
    L: ["100", "100", "100", "100", "111"],
    Y: ["101", "101", "111", "010", "010"],
    W: ["101", "101", "101", "111", "111"],
    D: ["110", "101", "101", "101", "110"]
  };
  const rows = glyphs[letter];
  rows.forEach((row, rowIndex) => {
    [...row].forEach((pixel, colIndex) => {
      if (pixel === "1") {
        fillRect(ctx, x + colIndex * scale, y + rowIndex * scale, scale, scale, color);
      }
    });
  });
}

function fillRect(ctx, x, y, width, height, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
}

function fillCircle(ctx, cx, cy, radius, color) {
  ctx.fillStyle = color;
  for (let y = -radius; y <= radius; y += 1) {
    for (let x = -radius; x <= radius; x += 1) {
      if (x * x + y * y <= radius * radius) {
        ctx.fillRect(cx + x, cy + y, 1, 1);
      }
    }
  }
}

function drawPixelLine(ctx, x0, y0, x1, y1, color, size) {
  ctx.fillStyle = color;
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;

  while (true) {
    ctx.fillRect(x, y, size, size);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

function init() {
  initTabs();
  updateModeChip();
  renderStatus();
  renderLog();
  renderJourney();
  startPolling();
}

init();
