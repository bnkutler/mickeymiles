/**
 * The Pacific Crest Trail, Mexico -> Canada, as 45 pixel-art checkpoints.
 * `mile` values are gameplay markers snapped near real PCT features.
 *
 * Scene config per landmark:
 *   sky    — [top, mid, horizon] daytime colors (night is derived)
 *   far    — background silhouette painter + colors
 *   ground — base + detail colors
 *   motifs — ordered list of mid/foreground painters (see scenes.js)
 */

const ROUTE_TOTAL_MILES = 2650;

const LANDMARKS = [
  {
    name: "Southern Terminus", mile: 0, region: "Mexican Border",
    blurb: "Five wooden pillars at the Mexican border fence. Every northbound legend starts with one paw on this monument.",
    sky: ["#8fbdd4", "#b8d4d2", "#e2d9ae"],
    far: { kind: "hills", colors: ["#a3906a", "#8a7a58"] },
    ground: { base: "#c2a071", detail: "#9a7c53" },
    motifs: [["scrub", {}], ["monument", { x: 0.62 }], ["fence", {}]]
  },
  {
    name: "Campo, CA", mile: 15, region: "Border Country",
    blurb: "The first trail town — a store, a railroad, and a whole lot of sun-baked chaparral.",
    sky: ["#93c0d3", "#bcd6cf", "#e6dcb0"],
    far: { kind: "hills", colors: ["#9c8a63", "#837252"] },
    ground: { base: "#bd9b6e", detail: "#957751" },
    motifs: [["scrub", {}], ["cabin", { x: 0.3, w: 40, color: "#a3583c" }], ["sign", { x: 0.72, text: "PCT" }]]
  },
  {
    name: "Lake Morena", mile: 40, region: "Border Country",
    blurb: "First blue water of the trip — a reservoir tucked into boulder-piled hills.",
    sky: ["#8cbdd6", "#b6d5d4", "#dcd9b2"],
    far: { kind: "hills", colors: ["#8f815f", "#776a4c"] },
    ground: { base: "#b09266", detail: "#8b724d" },
    motifs: [["lake", { color: "#4f7fa3", y: 0.68 }], ["boulders", { x: 0.15 }], ["scrub", { sparse: true }]]
  },
  {
    name: "Mt. Laguna", mile: 75, region: "Laguna Mountains",
    blurb: "Suddenly: pine trees at 6,000 feet, with the desert floor shimmering far below.",
    sky: ["#7fb4d2", "#a9cdd2", "#d3d6ae"],
    far: { kind: "mountains", colors: ["#6d7d62", "#57684f"] },
    ground: { base: "#8f8a58", detail: "#6f6b41" },
    motifs: [["pines", { n: 5 }], ["boulders", { x: 0.78 }]]
  },
  {
    name: "Warner Springs", mile: 110, region: "High Chaparral",
    blurb: "Golden grasslands and Eagle Rock — a boulder pile shaped exactly like an eagle in flight.",
    sky: ["#8abbd4", "#b8d3c9", "#e3d9a8"],
    far: { kind: "hills", colors: ["#a3925f", "#877849"] },
    ground: { base: "#c9ad6d", detail: "#a1884e" },
    motifs: [["meadow", {}], ["eagleRock", { x: 0.6 }], ["oaks", { n: 2 }]]
  },
  {
    name: "San Jacinto / Idyllwild", mile: 150, region: "San Jacinto Mountains",
    blurb: "A granite skyscraper of a mountain. Idyllwild feeds hikers pancakes at its feet.",
    sky: ["#79aed2", "#a4c9d4", "#ccd2b4"],
    far: { kind: "peak", colors: ["#8d9099", "#6f7480"], snow: true },
    ground: { base: "#7d7f54", detail: "#5f613d" },
    motifs: [["firs", { n: 4 }], ["boulders", { x: 0.2 }]]
  },
  {
    name: "Snow Creek / Whitewater", mile: 195, region: "San Gorgonio Pass",
    blurb: "A 7,000-foot plunge to the desert floor, wind farms roaring across the pass.",
    sky: ["#93c2dc", "#c3dad2", "#ecdcae"],
    far: { kind: "mountains", colors: ["#a08a76", "#84705d"] },
    ground: { base: "#cbab77", detail: "#a3854f" },
    motifs: [["river", { color: "#7fb3c9" }], ["turbines", { n: 3 }], ["scrub", { sparse: true }]]
  },
  {
    name: "Big Bear Lake", mile: 265, region: "San Bernardino Mountains",
    blurb: "Alpine lake, ski runs, and pine-scented switchbacks high above the desert.",
    sky: ["#7cb2d4", "#a8cdd6", "#cfd6b4"],
    far: { kind: "mountains", colors: ["#5f7360", "#4b5e4d"] },
    ground: { base: "#7f8256", detail: "#62653e" },
    motifs: [["lake", { color: "#3f7ca6", y: 0.66 }], ["pines", { n: 4 }]]
  },
  {
    name: "Wrightwood / Mt. Baden-Powell", mile: 340, region: "Angeles Crest",
    blurb: "Forty switchbacks to a 9,400-foot summit guarded by 1,500-year-old pines.",
    sky: ["#7fb0d6", "#abc9dc", "#d6d8bc"],
    far: { kind: "peak", colors: ["#7c8474", "#616a5d"], snow: true },
    ground: { base: "#8a8560", detail: "#6a6746" },
    motifs: [["snowpatch", {}], ["pines", { n: 4, gnarly: true }]]
  },
  {
    name: "Vasquez Rocks / Agua Dulce", mile: 410, region: "Sierra Pelona",
    blurb: "Tilted sandstone slabs famous from a hundred westerns (and a certain Star Trek fight).",
    sky: ["#95bfd8", "#c6d8ca", "#ecd9a6"],
    far: { kind: "hills", colors: ["#a98e62", "#8c744c"] },
    ground: { base: "#c7a26b", detail: "#9f8049" },
    motifs: [["slabs", {}], ["scrub", { sparse: true }]]
  },
  {
    name: "Tehachapi Pass", mile: 495, region: "Tehachapi Mountains",
    blurb: "Golden hills striped with hundreds of wind turbines, all spinning at once.",
    sky: ["#8fc0da", "#c1d8cc", "#e9dcaa"],
    far: { kind: "hills", colors: ["#b09a5e", "#948046"] },
    ground: { base: "#cdb271", detail: "#a68e50" },
    motifs: [["turbines", { n: 5 }], ["meadow", { dry: true }]]
  },
  {
    name: "Mojave Desert Crossing", mile: 555, region: "Mojave",
    blurb: "The LA Aqueduct walk — flat, huge, and lined with Joshua trees under a giant sky.",
    sky: ["#9cc6de", "#cfdcca", "#f0dda4"],
    far: { kind: "mesas", colors: ["#b28f68", "#977853"] },
    ground: { base: "#d3b276", detail: "#ab8c53" },
    motifs: [["joshua", { n: 3 }], ["scrub", { sparse: true }]]
  },
  {
    name: "Walker Pass", mile: 650, region: "Southern Sierra Gateway",
    blurb: "The desert's last stand — piñon slopes hinting that big mountains are coming.",
    sky: ["#8dbcd8", "#bcd4cc", "#e2d7ac"],
    far: { kind: "mountains", colors: ["#93855e", "#7a6c4b"] },
    ground: { base: "#bda06a", detail: "#97794b" },
    motifs: [["scrub", {}], ["boulders", { x: 0.7 }], ["sign", { x: 0.25, text: "PCT" }]]
  },
  {
    name: "Kennedy Meadows", mile: 700, region: "Sierra Gateway",
    blurb: "Hikers clap when you walk in. Trade the sun hat for an ice axe — the Sierra starts here.",
    sky: ["#83b6d6", "#b2d0d2", "#d8d8b2"],
    far: { kind: "mountains", colors: ["#7d8668", "#646e53"] },
    ground: { base: "#a29a62", detail: "#7f7847" },
    motifs: [["river", { color: "#6da3bd" }], ["meadow", {}], ["pines", { n: 3 }], ["sign", { x: 0.8, text: "KM" }]]
  },
  {
    name: "Mt. Whitney Area", mile: 765, region: "High Sierra",
    blurb: "The highest peak in the lower 48 looms just off-trail. Granite as far as eyes go.",
    sky: ["#6fa8d4", "#9cc4dc", "#c6d4c4"],
    far: { kind: "jagged", colors: ["#9aa0ac", "#7d8492", "#5f6674"], snow: true },
    ground: { base: "#8b8d74", detail: "#6c6e58" },
    motifs: [["boulders", { x: 0.3 }], ["snowpatch", {}], ["tarn", {}]]
  },
  {
    name: "Kings Canyon", mile: 830, region: "High Sierra",
    blurb: "Glacier-carved canyons a mile deep, threaded by icy green rivers.",
    sky: ["#74abd2", "#a2c6d6", "#ccd2bc"],
    far: { kind: "canyon", colors: ["#8a8a80", "#6e6f68"] },
    ground: { base: "#7f855e", detail: "#626844" },
    motifs: [["river", { color: "#5f9aa8" }], ["firs", { n: 3 }], ["boulders", { x: 0.75 }]]
  },
  {
    name: "Tuolumne Meadows", mile: 900, region: "Yosemite",
    blurb: "Southern Yosemite: lazy river bends through meadow grass beneath granite domes.",
    sky: ["#7cb3da", "#accede", "#d4dcc0"],
    far: { kind: "domes", colors: ["#a8a698", "#8c8b7e"] },
    ground: { base: "#8b9a5e", detail: "#6d7a45" },
    motifs: [["meadow", {}], ["river", { color: "#6ba6c2" }], ["pines", { n: 2 }]]
  },
  {
    name: "Yosemite High Country", mile: 945, region: "Yosemite",
    blurb: "Granite bowls, hidden lakes, and switchbacks that never quite end.",
    sky: ["#77aed8", "#a6c9dc", "#ccd4c0"],
    far: { kind: "domes", colors: ["#9fa094", "#83857b"], snow: true },
    ground: { base: "#84896a", detail: "#666b4f" },
    motifs: [["tarn", {}], ["firs", { n: 3 }], ["boulders", { x: 0.72 }]]
  },
  {
    name: "Northern Yosemite", mile: 985, region: "Yosemite",
    blurb: "The park's wild attic — steep, remote, and famously hard on the knees.",
    sky: ["#79b0d6", "#a4c8d8", "#cad2ba"],
    far: { kind: "jagged", colors: ["#8f948e", "#747a76", "#585f5c"] },
    ground: { base: "#7b8360", detail: "#5f6647" },
    motifs: [["firs", { n: 4 }], ["snowpatch", {}]]
  },
  {
    name: "Sonora Pass", mile: 1035, region: "Emigrant Wilderness",
    blurb: "Ten thousand feet of wind-scoured volcanic ridgeline the color of rust.",
    sky: ["#82b4da", "#b0cdd8", "#d8d4ae"],
    far: { kind: "ridge", colors: ["#a08063", "#84684f"], snow: true },
    ground: { base: "#a78d64", detail: "#846d49" },
    motifs: [["snowpatch", {}], ["rocks", {}], ["sign", { x: 0.68, text: "9624" }]]
  },
  {
    name: "Lake Tahoe", mile: 1095, region: "Tahoe Basin",
    blurb: "The big blue — Desolation Wilderness granite with Tahoe glittering to the horizon.",
    sky: ["#6faedb", "#9ecade", "#c8dac8"],
    far: { kind: "mountains", colors: ["#6d7f74", "#57685f"], snow: true },
    ground: { base: "#7e8866", detail: "#616a4b" },
    motifs: [["lake", { color: "#2f6fae", y: 0.62, big: true }], ["firs", { n: 3 }]]
  },
  {
    name: "Donner Pass", mile: 1155, region: "Northern Sierra",
    blurb: "Train tunnels, granite slabs, and history — the wagon-train pass of legend.",
    sky: ["#7bb2d8", "#a8cbd8", "#d0d6ba"],
    far: { kind: "mountains", colors: ["#7c8478", "#636b61"] },
    ground: { base: "#87875f", detail: "#696942" },
    motifs: [["tunnel", { x: 0.62 }], ["firs", { n: 3 }], ["boulders", { x: 0.15 }]]
  },
  {
    name: "Sierra City", mile: 1200, region: "Northern Sierra",
    blurb: "A tiny town under the sawtooth Sierra Buttes, famous for giant deli sandwiches.",
    sky: ["#84b8d6", "#b2d0d0", "#dcd8b0"],
    far: { kind: "spires", colors: ["#7f8288", "#65686f"] },
    ground: { base: "#8b8d5e", detail: "#6c6e42" },
    motifs: [["cabin", { x: 0.3, w: 34, color: "#8a5a3c" }], ["firs", { n: 2 }], ["river", { color: "#6ba2b8" }]]
  },
  {
    name: "Lassen Volcanic", mile: 1345, region: "Southern Cascades",
    blurb: "Boiling mud pots and a young volcano — the Cascades introduce themselves.",
    sky: ["#87b8d8", "#b4d0d4", "#dcd8ae"],
    far: { kind: "volcano", colors: ["#8a7f78", "#6e645f"], snow: true },
    ground: { base: "#9a8c60", detail: "#7a6e45" },
    motifs: [["steam", { x: 0.28 }], ["pines", { n: 3 }], ["rocks", {}]]
  },
  {
    name: "Burney Falls", mile: 1420, region: "Cascade Foothills",
    blurb: "A hundred-foot curtain of spring water pouring straight out of the cliff face.",
    sky: ["#8abcd8", "#b8d4d4", "#d8dcb6"],
    far: { kind: "ridge", colors: ["#5f7458", "#4c5f47"] },
    ground: { base: "#6f7e52", detail: "#55633c" },
    motifs: [["falls", {}], ["firs", { n: 2 }]]
  },
  {
    name: "Mt. Shasta", mile: 1495, region: "Southern Cascades",
    blurb: "A 14,000-foot white pyramid that owns the horizon for weeks of walking.",
    sky: ["#7db4dc", "#accede", "#d6dcc2"],
    far: { kind: "volcano", colors: ["#9aa0b0", "#7e8494"], snow: true, huge: true },
    ground: { base: "#8b9160", detail: "#6d7245" },
    motifs: [["meadow", {}], ["firs", { n: 3 }]]
  },
  {
    name: "Castle Crags", mile: 1520, region: "Trinity Divide",
    blurb: "Granite spires like a dropped crown, rising straight from deep green forest.",
    sky: ["#83b6d8", "#b0ceda", "#d4d8bc"],
    far: { kind: "spires", colors: ["#a3a49c", "#878881"] },
    ground: { base: "#5f7a4e", detail: "#48603a" },
    motifs: [["firs", { n: 5 }]]
  },
  {
    name: "Etna Summit", mile: 1600, region: "Marble Mountains",
    blurb: "Quiet ridgelines over the Marble Mountains, and a town nap in Etna below.",
    sky: ["#88bad6", "#b6d2d2", "#dcd9b2"],
    far: { kind: "mountains", colors: ["#6f8168", "#596b54"] },
    ground: { base: "#84895c", detail: "#676c43" },
    motifs: [["meadow", {}], ["firs", { n: 3 }], ["rocks", {}]]
  },
  {
    name: "Seiad Valley", mile: 1655, region: "Klamath River",
    blurb: "Home of the 5-pound pancake challenge, deep in the Klamath river canyon.",
    sky: ["#8fc0d6", "#c0d8ce", "#e6dcac"],
    far: { kind: "mountains", colors: ["#71825e", "#5b6b4b"] },
    ground: { base: "#9a9560", detail: "#7a7644" },
    motifs: [["river", { color: "#5f97ad" }], ["bridge", { low: true }], ["cabin", { x: 0.72, w: 30, color: "#96604a" }]]
  },
  {
    name: "CA / OR Border", mile: 1695, region: "State Line!",
    blurb: "1,695 miles to walk out of California. The trail register here is pure joy.",
    sky: ["#84b8d4", "#b2d0d0", "#d8d8b4"],
    far: { kind: "mountains", colors: ["#66795c", "#516349"] },
    ground: { base: "#7d8656", detail: "#61693e" },
    motifs: [["firs", { n: 3 }], ["borderSign", { a: "CA", b: "OR" }]]
  },
  {
    name: "Crater Lake", mile: 1805, region: "Oregon Cascades",
    blurb: "The bluest blue on Earth, held in a volcano's broken rim 2,000 feet above the water.",
    sky: ["#79b2dc", "#a8cce0", "#d0d8c6"],
    far: { kind: "craterRim", colors: ["#8a8478", "#6e6960"] },
    ground: { base: "#8f8a66", detail: "#716c4b" },
    motifs: [["craterLake", {}]]
  },
  {
    name: "Diamond Lake", mile: 1855, region: "Oregon Cascades",
    blurb: "Calm water under Mt. Thielsen — 'the lightning rod of the Cascades.'",
    sky: ["#80b6da", "#aeceda", "#d4d8be"],
    far: { kind: "peak", colors: ["#7e8894", "#646e7c"], sharp: true },
    ground: { base: "#77855c", detail: "#5c6a43" },
    motifs: [["lake", { color: "#4381b2", y: 0.64 }], ["firs", { n: 3 }]]
  },
  {
    name: "Three Sisters", mile: 1955, region: "Oregon Cascades",
    blurb: "Three volcanic siblings in a row, wading through obsidian fields and lava flows.",
    sky: ["#7fb4da", "#accede", "#d6d9be"],
    far: { kind: "cones3", colors: ["#8d8a94", "#71707c"], snow: true },
    ground: { base: "#8f7f62", detail: "#716247" },
    motifs: [["rocks", { dark: true }], ["pines", { n: 2 }], ["meadow", {}]]
  },
  {
    name: "Mt. Jefferson", mile: 2000, region: "Oregon Cascades",
    blurb: "Mile 2,000 under a jagged glacier-hung tooth of a mountain.",
    sky: ["#7ab0d8", "#a8cadc", "#d2d6c0"],
    far: { kind: "peak", colors: ["#868a98", "#6b7080"], snow: true, sharp: true },
    ground: { base: "#75835e", detail: "#5b6845" },
    motifs: [["firs", { n: 4 }], ["snowpatch", {}], ["sign", { x: 0.3, text: "2000" }]]
  },
  {
    name: "Timberline / Mt. Hood", mile: 2075, region: "Oregon Cascades",
    blurb: "The famous Timberline Lodge breakfast buffet, parked on Mt. Hood's sandy shoulder.",
    sky: ["#7cb2dc", "#aacce0", "#d4dac4"],
    far: { kind: "volcano", colors: ["#949aa8", "#787e8e"], snow: true, huge: true },
    ground: { base: "#9a8a6a", detail: "#7a6c4e" },
    motifs: [["lodge", {}], ["firs", { n: 2 }]]
  },
  {
    name: "Cascade Locks", mile: 2145, region: "Columbia River Gorge",
    blurb: "The lowest point on the whole PCT — a mighty river slicing between green walls.",
    sky: ["#88bcd8", "#b8d4d6", "#dcdcba"],
    far: { kind: "gorge", colors: ["#4f6b50", "#3d573f"] },
    ground: { base: "#6f7e54", detail: "#57633e" },
    motifs: [["riverWide", {}], ["firs", { n: 2 }]]
  },
  {
    name: "Washington Border", mile: 2150, region: "Bridge of the Gods",
    blurb: "Walk the Bridge of the Gods over the Columbia — Oregon done, one state to go.",
    sky: ["#84badc", "#b2d2da", "#d8dabe"],
    far: { kind: "gorge", colors: ["#516d52", "#405a42"] },
    ground: { base: "#6d7c52", detail: "#55613c" },
    motifs: [["riverWide", {}], ["bridge", { grand: true }]]
  },
  {
    name: "Goat Rocks", mile: 2225, region: "Washington Cascades",
    blurb: "The Knife's Edge — a sky-high catwalk with Rainier, Adams, and actual goats.",
    sky: ["#75aeda", "#a2c8dc", "#ccd4c4"],
    far: { kind: "jagged", colors: ["#8d9096", "#71757e", "#555a64"], snow: true },
    ground: { base: "#7d8464", detail: "#61684a" },
    motifs: [["snowpatch", {}], ["goats", {}], ["rocks", {}]]
  },
  {
    name: "White Pass / Rainier View", mile: 2280, region: "Washington Cascades",
    blurb: "Mt. Rainier fills half the sky — 14,000 feet of glacier hanging over the trail.",
    sky: ["#7ab2dc", "#a8ccde", "#d2d8c4"],
    far: { kind: "volcano", colors: ["#9ba2b2", "#7f8696"], snow: true, huge: true },
    ground: { base: "#74825e", detail: "#5a6745" },
    motifs: [["firs", { n: 3 }], ["meadow", {}], ["tarn", {}]]
  },
  {
    name: "Snoqualmie Pass", mile: 2390, region: "Washington Cascades",
    blurb: "Ski lifts and espresso, then straight back into granite and huckleberries.",
    sky: ["#7fb4d8", "#accada", "#d2d6c2"],
    far: { kind: "mountains", colors: ["#6e7f72", "#586a5e"], snow: true },
    ground: { base: "#6f7e58", detail: "#576341" },
    motifs: [["firs", { n: 4 }], ["cabin", { x: 0.68, w: 32, color: "#7a5238" }]]
  },
  {
    name: "Stevens Pass", mile: 2465, region: "Washington Cascades",
    blurb: "The last easy resupply — everything north of here is deep wilderness.",
    sky: ["#7cb2d8", "#a8cada", "#d0d6c2"],
    far: { kind: "mountains", colors: ["#68796e", "#53645b"], snow: true },
    ground: { base: "#6b7a56", detail: "#535f3f" },
    motifs: [["firs", { n: 5 }], ["sign", { x: 0.5, text: "PCT" }]]
  },
  {
    name: "Glacier Peak", mile: 2520, region: "Glacier Peak Wilderness",
    blurb: "The wildest stretch of the whole trail — brutal climbs, hanging glaciers, zero roads.",
    sky: ["#74acd8", "#a0c6dc", "#c8d2c6"],
    far: { kind: "volcano", colors: ["#8f96a6", "#737a8c"], snow: true },
    ground: { base: "#657650", detail: "#4e5c3b" },
    motifs: [["firs", { n: 4 }], ["river", { color: "#6ba0b6" }], ["snowpatch", {}]]
  },
  {
    name: "Stehekin / Lake Chelan", mile: 2560, region: "North Cascades",
    blurb: "A town with no roads in — arrive by trail or boat, leave with legendary bakery goods.",
    sky: ["#7fb6da", "#accedc", "#d4d8c2"],
    far: { kind: "mountains", colors: ["#66786c", "#516358"], snow: true },
    ground: { base: "#6d7c54", detail: "#55613e" },
    motifs: [["lake", { color: "#3a76a8", y: 0.64, big: true }], ["boat", {}], ["firs", { n: 2 }]]
  },
  {
    name: "North Cascades", mile: 2605, region: "American Alps",
    blurb: "Jagged black towers and blue glaciers — the trail saves its sharpest scenery for last.",
    sky: ["#6fa8d6", "#9cc2da", "#c6d0c6"],
    far: { kind: "jagged", colors: ["#7c8290", "#5f6674", "#454b58"], snow: true },
    ground: { base: "#68764e", detail: "#505c39" },
    motifs: [["firs", { n: 3 }], ["snowpatch", {}], ["rocks", {}]]
  },
  {
    name: "Northern Terminus", mile: 2650, region: "Canada / Manning Park",
    blurb: "Monument 78 in a quiet forest clearing on the Canadian border. 2,650 miles. Good hamster.",
    sky: ["#7db4d8", "#aaccda", "#d2d8c4"],
    far: { kind: "mountains", colors: ["#5d7264", "#485c50"], snow: true },
    ground: { base: "#647448", detail: "#4d5a35" },
    motifs: [["firs", { n: 4 }], ["monument", { x: 0.55, north: true }], ["borderCut", {}]]
  }
];
