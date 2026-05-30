const stateColors = ["#00ff41", "#ff9800", "#ff0055"];
const stateNames = ["Bull", "Bear", "Crisis"];

let dataset = null;
let currentIndex = 0;
let leftReady = false;
let rightReady = false;
let lastRegimeIdx = null;
let lastRightRenderIndex = -1;
let wsFailures = 0;
let pollIntervalId = null;

const hud = document.getElementById("hud");
const marketSelect = document.getElementById("marketSelect");
const periodSelect = document.getElementById("periodSelect");
const snapshotBtn = document.getElementById("snapshotBtn");
const marketStatus = document.getElementById("marketStatus");
const urlParams = new URLSearchParams(window.location.search);
const wsDisabledByQuery = urlParams.get("ws") === "0" || urlParams.get("ws") === "false";
const wsDisabledByHost = window.location.hostname.endsWith("vercel.app");
const WS_DISABLED = wsDisabledByQuery || wsDisabledByHost;
const UI_REVISION = "static-ui-v4";
const DEFAULT_PERIODS = ["1y", "3y", "5y"];
const DEFAULT_CAMERA = {
  eye: { x: 2.0, y: 1.05, z: 1.25 },
  center: { x: 0, y: 0, z: 0.08 },
  up: { x: 0, y: 0, z: 1 },
};
const DEFAULT_SCENE = {
  domain: { x: [0.04, 0.98], y: [0.1, 0.99] },
  aspectmode: "manual",
  aspectratio: { x: 1, y: 1, z: 0.85 },
};
const leftZoomInBtn = document.getElementById("leftZoomIn");
const leftZoomOutBtn = document.getElementById("leftZoomOut");
const leftFitBtn = document.getElementById("leftFit");
const leftResetBtn = document.getElementById("leftReset");

marketSelect.disabled = true;
periodSelect.disabled = true;
if (snapshotBtn) snapshotBtn.disabled = true;
const plotConfigLeft = {
  displayModeBar: false,
  responsive: true,
  doubleClick: false,
  scrollZoom: false,
};
// interactivity is blocked by an overlay element; leave Plotly interactive so WebGL renders correctly
const plotConfigRight = {
  displayModeBar: false,
  responsive: true,
  doubleClick: "reset+autosize",
  scrollZoom: true,
};

function axisCommon() {
  return {
    showgrid: true,
    gridcolor: "#1f1f1f",
    zeroline: true,
    zerolinecolor: "#303030",
    color: "#d7d7d7",
    ticks: "outside",
    tickfont: { size: 10, color: "#c9c9c9" },
    linecolor: "#2a2a2a",
    mirror: true,
  };
}

function cubeTrace(xc, yc, h, color, opacity) {
  const s = 0.36;
  const x0 = xc - s, x1 = xc + s, y0 = yc - s, y1 = yc + s;
  const X = [x0, x1, x1, x0, x0, x1, x1, x0];
  const Y = [y0, y0, y1, y1, y0, y0, y1, y1];
  const Z = [0, 0, 0, 0, h, h, h, h];
  const i = [0, 0, 4, 4, 0, 0, 1, 1, 2, 2, 3, 3];
  const j = [1, 2, 5, 6, 1, 5, 2, 6, 3, 7, 0, 4];
  const k = [2, 3, 6, 7, 5, 4, 6, 5, 7, 6, 4, 7];
  return { type: "mesh3d", x: X, y: Y, z: Z, i, j, k, color, opacity, flatshading: true, showscale: false, hoverinfo: "skip" };
}

function cubeWireframe(xc, yc, h, color) {
  const s = 0.36;
  const x0 = xc - s, x1 = xc + s, y0 = yc - s, y1 = yc + s;
  const z0 = 0, z1 = h;
  const xs = [x0, x1, x1, x0, x0, x1, x1, x0];
  const ys = [y0, y0, y1, y1, y0, y0, y1, y1];
  const zs = [z0, z0, z0, z0, z1, z1, z1, z1];
  const segments = [
    // bottom square
    [0, 1], [1, 2], [2, 3], [3, 0],
    // top square
    [4, 5], [5, 6], [6, 7], [7, 4],
    // vertical edges
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const X = [];
  const Y = [];
  const Z = [];
  for (const [a, b] of segments) {
    X.push(xs[a], xs[b], null);
    Y.push(ys[a], ys[b], null);
    Z.push(zs[a], zs[b], null);
  }
  return {
    type: "scatter3d",
    mode: "lines",
    x: X,
    y: Y,
    z: Z,
    line: { color, width: 2 },
    hoverinfo: "skip",
    showlegend: false,
  };
}

function renderLeft(currentRegimeIdx) {
  if (!document.getElementById("left3d")) return;
  if (!dataset) return;
  if (leftReady && currentRegimeIdx === lastRegimeIdx) return;
  lastRegimeIdx = currentRegimeIdx;
  const traces = [];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      traces.push(cubeTrace(i, j, dataset.trans[i][j], stateColors[i], i === currentRegimeIdx ? 0.55 : 0.32));
      traces.push(cubeWireframe(i, j, dataset.trans[i][j], "#00f2ff"));
      // place numeric labels slightly lower to avoid clipping above the scene
      const zText = Math.max(0.02, dataset.trans[i][j] - 0.04);
      traces.push({
        type: "scatter3d",
        mode: "text",
        x: [i],
        y: [j],
        z: [zText],
        text: [dataset.trans[i][j].toFixed(2)],
        textfont: { color: "#ffffff", size: 11 },
        hoverinfo: "skip",
        showlegend: false,
      });
    }
  }

  const sceneLayout = {
    uirevision: UI_REVISION,
    bgcolor: "#0b0b0b",
    dragmode: "orbit",
    domain: DEFAULT_SCENE.domain,
    aspectmode: DEFAULT_SCENE.aspectmode,
    aspectratio: DEFAULT_SCENE.aspectratio,
    xaxis: { title: "From s_t", tickvals: [0, 1, 2], ticktext: stateNames, color: "#888888", gridcolor: "#1f1f1f", zerolinecolor: "#303030", range: [-0.6, 2.6] },
    yaxis: { title: "To s_{t+1}", tickvals: [0, 1, 2], ticktext: stateNames, color: "#888888", gridcolor: "#1f1f1f", zerolinecolor: "#303030", range: [-0.6, 2.6] },
    zaxis: { title: "P(s_{t+1}|s_t)", range: [0, 1.15], color: "#888888", gridcolor: "#1f1f1f" },
  };
  // Only set an explicit camera for the initial render; subsequent renders should not overwrite user camera
  if (!leftReady) sceneLayout.camera = DEFAULT_CAMERA;
  // center the title and the scene like the reference image
  const titleX = 0.5;

  Plotly.react(
    "left3d",
    traces,
    {
      // increase top margin so labels don't get clipped
        margin: { l: 0, r: 0, t: 32, b: 10 },
        title: { text: "Transition Matrix", font: { size: 16, color: "#d7d7d7" }, x: 0.5, xanchor: "center" },
      paper_bgcolor: "#0b0b0b",
      dragmode: false,
      uirevision: UI_REVISION,
      scene: { ...sceneLayout, camera: DEFAULT_CAMERA, dragmode: false },
      transition: { duration: 0 },
    },
    plotConfigLeft,
  );
  // If WebGL/mesh3d fails in this browser, fall back to a 2D heatmap so the user still sees the transition matrix
  try {
    // no-op: Plotly.react above will throw synchronously in some failures
  } catch (err) {
    console.warn("3D render failed, falling back to heatmap:", err);
    const z = dataset.trans.map((row) => row.slice());
    const heat = [
      {
        type: "heatmap",
        z,
        x: stateNames,
        y: stateNames,
        colorscale: [[0, "#0b0b0b"], [0.2, "#111111"], [0.6, "#00f2ff"], [1, "#00ff41"]],
        zmin: 0,
        zmax: 1,
        showscale: false,
        hoverinfo: "text",
        text: z.map((r) => r.map((v) => v.toFixed(2))),
      },
    ];
    Plotly.react(
      "left3d",
      heat,
      {
        margin: { l: 0, r: 0, t: 24, b: 10 },
        paper_bgcolor: "#0b0b0b",
      },
      { displayModeBar: false, responsive: true },
    );
  }
  leftReady = true;
}

function applyLeftDefaults() {
  Plotly.relayout("left3d", {
    "scene.camera": DEFAULT_CAMERA,
    "scene.domain": DEFAULT_SCENE.domain,
    "scene.aspectmode": DEFAULT_SCENE.aspectmode,
    "scene.aspectratio": DEFAULT_SCENE.aspectratio,
  });
}

function getLeftCamera() {
  const gd = document.getElementById("left3d");
  if (gd && gd.layout && gd.layout.scene && gd.layout.scene.camera) {
    return JSON.parse(JSON.stringify(gd.layout.scene.camera));
  }
  return JSON.parse(JSON.stringify(DEFAULT_CAMERA));
}

function scaleCamera(cam, factor) {
  return {
    ...cam,
    eye: {
      x: cam.eye.x * factor,
      y: cam.eye.y * factor,
      z: cam.eye.z * factor,
    },
  };
}

// Fit/Reset buttons removed from UI; leave programmatic reset available if needed

function regimeSegments(states, upto) {
  const segments = [];
  let start = 0;
  let current = states[0];
  for (let i = 1; i < upto; i++) {
    if (states[i] !== current) {
      segments.push({ start, end: i, state: current });
      start = i;
      current = states[i];
    }
  }
  segments.push({ start, end: upto - 1, state: current });
  return segments;
}

function renderRight() {
  if (!dataset) return;
  const upto = currentIndex + 1;
  const t = dataset.t.slice(0, upto);
  const prices = dataset.prices.slice(0, upto);
  const returns = dataset.returns.slice(0, upto);
  const gamma = dataset.gamma.slice(0, upto);
  const states = dataset.states.slice(0, upto);

  // filter out non-finite values and keep arrays aligned
  const ft = [];
  const fPrices = [];
  const fReturns = [];
  const fGamma = [];
  const fStates = [];
  for (let i = 0; i < t.length; i++) {
    const p = Number(prices[i]);
    const r = Number(returns[i]);
    if (!Number.isFinite(p) || !Number.isFinite(r)) continue;
    ft.push(t[i]);
    fPrices.push(p);
    fReturns.push(r);
    fGamma.push(gamma[i]);
    fStates.push(states[i]);
  }
  if (!fPrices.length || !fGamma.length) return;

  const bull = fGamma.map((g) => g[0]);
  const bear = fGamma.map((g) => g[1]);
  const crisis = fGamma.map((g) => g[2]);

  const eq = fPrices.map((p) => (p / dataset.S0) * 100);
  const eqBase = new Array(fPrices.length).fill(100);

  const retColors = fStates.map((s) => stateColors[s]);

  const finiteMinMax = (arr, fallbackMin, fallbackMax) => {
    const finite = arr.filter((v) => Number.isFinite(v));
    if (!finite.length) return { min: fallbackMin, max: fallbackMax };
    const min = Math.min(...finite);
    const max = Math.max(...finite);
    if (min === max) {
      const pad = Math.abs(min * 0.02) + 1;
      return { min: min - pad, max: max + pad };
    }
    return { min, max };
  };

  const niceTick = (range, targetTicks = 5) => {
    if (!Number.isFinite(range) || range <= 0) return 1;
    const rough = range / targetTicks;
    const pow10 = Math.pow(10, Math.floor(Math.log10(rough)));
    const candidates = [1, 2, 5, 10].map((v) => v * pow10);
    return candidates.find((c) => rough <= c) || candidates[candidates.length - 1];
  };

  const { min: pmin, max: pmax } = finiteMinMax(fPrices, 0, 1);
  const ppad = (pmax - pmin) * 0.08;
  const pRawMin = pmin - ppad;
  const pRawMax = pmax + ppad;
  const priceMin = Math.floor(pRawMin / 20) * 20;
  const priceMax = Math.ceil(pRawMax / 20) * 20;
  const priceRange = [priceMin, priceMax];
  const priceDtick = niceTick(priceRange[1] - priceRange[0], 5);

  const { min: rmin, max: rmax } = finiteMinMax(fReturns, -0.01, 0.01);
  const rpad = (rmax - rmin) * 0.12 || 0.005;
  const returnRange = [rmin - rpad, rmax + rpad];

  const { min: eqMin, max: eqMax } = finiteMinMax(eq, 80, 120);
  const eqPad = (eqMax - eqMin) * 0.08 || 2;
  const equityRange = [eqMin - eqPad, eqMax + eqPad];

  const { min: gmin, max: gmax } = finiteMinMax([...bull, ...bear, ...crisis], 0, 1);
  const gpad = (gmax - gmin) * 0.08 || 0.02;
  const probRange = [Math.max(0, gmin - gpad), Math.min(1, gmax + gpad)];

  const shapes = [];
  for (const seg of regimeSegments(fStates, fStates.length)) {
    shapes.push({
      type: "rect",
      xref: "x",
      yref: "y",
      x0: seg.start,
      x1: seg.end,
      y0: priceRange[0],
      y1: priceRange[1],
      fillcolor: stateColors[seg.state],
      opacity: 0.13,
      line: { width: 0 },
    });
  }

  const panelBoxes = [
    { y0: 0.73, y1: 0.91 },
    { y0: 0.51, y1: 0.69 },
    { y0: 0.29, y1: 0.47 },
    { y0: 0.07, y1: 0.25 },
  ].map((box) => ({
    type: "rect",
    xref: "paper",
    yref: "paper",
    x0: 0.08,
    x1: 0.995,
    y0: box.y0,
    y1: box.y1,
    line: { color: "#2b2b2b", width: 0.5 },
    fillcolor: "rgba(0,0,0,0)",
  }));

  const legendBox = {
    type: "rect",
    xref: "paper",
    yref: "paper",
    x0: 0.085,
    x1: 0.29,
    y0: 0.874,
    y1: 0.902,
    line: { color: "#2b2b2b", width: 1 },
    fillcolor: "rgba(15,15,15,0.85)",
    layer: "above",
  };

  Plotly.react(
    "right4",
    [
      { x: ft, y: fPrices, type: "scattergl", mode: "lines", line: { color: "#ffffff", width: 1.0 }, xaxis: "x", yaxis: "y" },
      { x: ft, y: fReturns, type: "bar", marker: { color: retColors }, xaxis: "x2", yaxis: "y2" },
      { x: ft, y: bull, type: "scatter", mode: "lines", line: { color: stateColors[0], width: 1.2 }, stackgroup: "p", xaxis: "x3", yaxis: "y3" },
      { x: ft, y: bear, type: "scatter", mode: "lines", line: { color: stateColors[1], width: 1.2 }, stackgroup: "p", xaxis: "x3", yaxis: "y3" },
      { x: ft, y: crisis, type: "scatter", mode: "lines", line: { color: stateColors[2], width: 1.2 }, stackgroup: "p", xaxis: "x3", yaxis: "y3" },
      { x: ft, y: eqBase, type: "scatter", mode: "lines", line: { color: "rgba(0,0,0,0)" }, xaxis: "x4", yaxis: "y4", showlegend: false },
      { x: ft, y: eq.map((v) => Math.max(v, 100)), type: "scatter", mode: "lines", line: { color: "rgba(0,0,0,0)" }, fill: "tonexty", fillcolor: "rgba(0,242,255,0.12)", xaxis: "x4", yaxis: "y4", showlegend: false },
      { x: ft, y: eqBase, type: "scatter", mode: "lines", line: { color: "rgba(0,0,0,0)" }, xaxis: "x4", yaxis: "y4", showlegend: false },
      { x: ft, y: eq.map((v) => Math.min(v, 100)), type: "scatter", mode: "lines", line: { color: "rgba(0,0,0,0)" }, fill: "tonexty", fillcolor: "rgba(255,0,85,0.12)", xaxis: "x4", yaxis: "y4", showlegend: false },
      { x: ft, y: eq, type: "scatter", mode: "lines", line: { color: "#00f2ff", width: 1.1 }, xaxis: "x4", yaxis: "y4" },
    ],
    {
      paper_bgcolor: "#0b0b0b",
      plot_bgcolor: "#0e0e0e",
      margin: { l: 96, r: 20, t: 24, b: 46 },
      legend: { orientation: "h", y: 1.03, xanchor: "left", x: 0.02, font: { size: 11 } },
      showlegend: false,
      shapes: shapes.concat(panelBoxes).concat([legendBox]),
      dragmode: "zoom",
      uirevision: UI_REVISION,
      font: { color: "#c9c9c9" },
      annotations: [
        { x: 0.08, y: 0.92, xref: "paper", yref: "paper", text: "Price  +  HMM Regime", showarrow: false, xanchor: "left", yanchor: "bottom", font: { size: 12, color: "#d7d7d7" } },
        // boxed legend inside the first panel
        { x: 0.10, y: 0.887, xref: "paper", yref: "paper", text: "●", showarrow: false, xanchor: "left", yanchor: "middle", font: { size: 9, color: stateColors[0] } },
        { x: 0.112, y: 0.887, xref: "paper", yref: "paper", text: "Bull", showarrow: false, xanchor: "left", yanchor: "middle", font: { size: 8, color: "#cfcfcf" } },
        { x: 0.154, y: 0.887, xref: "paper", yref: "paper", text: "●", showarrow: false, xanchor: "left", yanchor: "middle", font: { size: 9, color: stateColors[1] } },
        { x: 0.166, y: 0.887, xref: "paper", yref: "paper", text: "Bear", showarrow: false, xanchor: "left", yanchor: "middle", font: { size: 8, color: "#cfcfcf" } },
        { x: 0.208, y: 0.887, xref: "paper", yref: "paper", text: "●", showarrow: false, xanchor: "left", yanchor: "middle", font: { size: 9, color: stateColors[2] } },
        { x: 0.220, y: 0.887, xref: "paper", yref: "paper", text: "Crisis", showarrow: false, xanchor: "left", yanchor: "middle", font: { size: 8, color: "#cfcfcf" } },
        { x: 0.08, y: 0.69, xref: "paper", yref: "paper", text: "Daily Returns", showarrow: false, xanchor: "left", yanchor: "bottom", font: { size: 12, color: "#d7d7d7" } },
        { x: 0.08, y: 0.47, xref: "paper", yref: "paper", text: "Smoothed State Probabilities P(s_t | y)", showarrow: false, xanchor: "left", yanchor: "bottom", font: { size: 12, color: "#d7d7d7" } },
        { x: 0.08, y: 0.25, xref: "paper", yref: "paper", text: "Equity (base 100)", showarrow: false, xanchor: "left", yanchor: "bottom", font: { size: 12, color: "#d7d7d7" } },
      ],
      xaxis: { ...axisCommon(), domain: [0.08, 0.995], anchor: "y", showticklabels: false },
      yaxis: { ...axisCommon(), domain: [0.73, 0.91], title: "", range: priceRange, dtick: priceDtick },

      xaxis2: { ...axisCommon(), domain: [0.08, 0.995], anchor: "y2", showticklabels: false },
      yaxis2: { ...axisCommon(), domain: [0.51, 0.69], title: "", range: returnRange, tickformat: ".1%" },

      xaxis3: { ...axisCommon(), domain: [0.08, 0.995], anchor: "y3", showticklabels: false },
      yaxis3: { ...axisCommon(), domain: [0.29, 0.47], title: "", range: probRange, dtick: 0.2, tickformat: ".1f" },

      xaxis4: { ...axisCommon(), domain: [0.08, 0.995], anchor: "y4", title: "Time [days]" },
      yaxis4: { ...axisCommon(), domain: [0.07, 0.25], title: "", range: equityRange },
    },
    plotConfigRight,
  );
  rightReady = true;
}

function updateHUD(idx) {
  const regime = dataset.names[dataset.states[idx]];
  const eq = (dataset.prices[idx] / dataset.S0) * 100;
  hud.textContent = `${dataset.symbol}  |  day ${String(idx).padStart(4, " ")}    regime: ${regime.toUpperCase()}    eq = ${eq.toFixed(1)}`;
  hud.style.color = stateColors[dataset.states[idx]] || "#00ff41";
}

function onTick(idx) {
  currentIndex = idx;
  renderLeft(dataset.states[idx]);
  // throttle right-side reflow to reduce UI lag
  if (idx - lastRightRenderIndex >= 3 || idx === 0) {
    renderRight();
    lastRightRenderIndex = idx;
  }
  updateHUD(idx);
}

function connectWs() {
  if (WS_DISABLED) {
    startPolling();
    return;
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

  ws.onopen = () => {
    wsFailures = 0;
    if (pollIntervalId) stopPolling();
    hud.textContent = "LIVE | CONNECTED";
    hud.style.color = "#00ff41";
  };

  ws.onclose = () => {
    // If we already have a dataset rendered, keep HUD showing current info
    if (dataset) {
      // indicate offline but keep current regime color
      const regime = dataset.names && dataset.states ? dataset.names[dataset.states[currentIndex]] : "OFFLINE";
      hud.textContent = `OFFLINE | ${regime}`;
      hud.style.color = stateColors[dataset.states[currentIndex]] || "#ff9800";
    } else {
      hud.textContent = "RECONNECTING...";
      hud.style.color = "#ff9800";
    }
    // try reconnecting a few times, then fall back to HTTP polling
    wsFailures += 1;
    if (wsFailures >= 3) {
      startPolling();
    } else {
      setTimeout(connectWs, 1000);
    }
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "meta") {
      dataset = msg.payload;
      leftReady = false;
      rightReady = false;
      lastRegimeIdx = null;
      dataset.names = msg.payload.names;
      dataset.trans = msg.payload.trans;
      dataset.t = msg.payload.t;
      dataset.symbol = msg.payload.symbol || dataset.symbol || "MARKET";
      dataset.symbols = msg.payload.symbols || dataset.symbols || [];
      dataset.period = msg.payload.period || dataset.period || "5y";
      dataset.periods = msg.payload.periods || dataset.periods || [];
      dataset.states = msg.payload.states;
      dataset.returns = msg.payload.returns;
      dataset.prices = msg.payload.prices;
      dataset.gamma = msg.payload.gamma;
      dataset.S0 = msg.payload.S0;

      const pmin = Math.min(...dataset.prices);
      const pmax = Math.max(...dataset.prices);
      const ppad = (pmax - pmin) * 0.06;
      dataset.priceRange = [pmin - ppad, pmax + ppad];

      const rmin = Math.min(...dataset.returns);
      const rmax = Math.max(...dataset.returns);
      const rpad = (rmax - rmin) * 0.1;
      dataset.returnRange = [rmin - rpad, rmax + rpad];

      const eq = dataset.prices.map((p) => (p / dataset.S0) * 100);
      const emin = Math.min(...eq);
      const emax = Math.max(...eq);
      const epad = (emax - emin) * 0.06;
      dataset.equityRange = [emin - epad, emax + epad];

      if (dataset.symbols.length) {
        populateMarkets(dataset.symbols, dataset.symbol);
      }
      if (dataset.periods.length) {
        populatePeriods(dataset.periods, dataset.period);
      } else if (periodSelect.options.length === 0) {
        populatePeriods(DEFAULT_PERIODS, dataset.period || DEFAULT_PERIODS[DEFAULT_PERIODS.length - 1]);
      }
      const activePeriod = dataset.period || periodSelect.value || DEFAULT_PERIODS[DEFAULT_PERIODS.length - 1];
      marketStatus.textContent = `Live (${activePeriod})`;
      if (snapshotBtn) snapshotBtn.disabled = false;
      return;
    }
    if (msg.type === "tick") {
      onTick(msg.payload.index);
    }
  };
}

function stopPolling() {
  if (pollIntervalId) {
    clearInterval(pollIntervalId);
    pollIntervalId = null;
  }
}

function startPolling() {
  if (pollIntervalId) return;
  if (!dataset) {
    hud.textContent = "LOADING...";
    hud.style.color = "#ff9800";
  }
  // poll /health for the current index and update UI
  pollIntervalId = setInterval(async () => {
    try {
      const activePeriod = periodSelect.value || dataset?.period || DEFAULT_PERIODS[DEFAULT_PERIODS.length - 1];
      const res = await fetch(`/api/state?period=${encodeURIComponent(activePeriod)}`);
      if (!res.ok) return;
      const json = await res.json();
      if (!json || !Number.isFinite(json.index)) return;
      // if server provided a dataset, apply it (keeps UI consistent without WS)
      if (json.dataset) {
        dataset = json.dataset;
        // compute derived ranges like WS handler
        const pmin = Math.min(...dataset.prices);
        const pmax = Math.max(...dataset.prices);
        const ppad = (pmax - pmin) * 0.06;
        dataset.priceRange = [pmin - ppad, pmax + ppad];
        const rmin = Math.min(...dataset.returns);
        const rmax = Math.max(...dataset.returns);
        const rpad = (rmax - rmin) * 0.1;
        dataset.returnRange = [rmin - rpad, rmax + rpad];
        const eq = dataset.prices.map((p) => (p / dataset.S0) * 100);
        const emin = Math.min(...eq);
        const emax = Math.max(...eq);
        const epad = (emax - emin) * 0.06;
        dataset.equityRange = [emin - epad, emax + epad];
        if (dataset.symbols && dataset.symbols.length) populateMarkets(dataset.symbols, dataset.symbol);
        if (dataset.periods && dataset.periods.length) populatePeriods(dataset.periods, dataset.period);
        // enable snapshot if available
        if (snapshotBtn) snapshotBtn.disabled = false;
        if (WS_DISABLED) {
          marketSelect.disabled = true;
          marketStatus.textContent = `SIM only (${dataset.period})`;
        }
      }
      onTick(json.index);
    } catch (err) {
      // ignore transient errors
    }
  }, 1000);
}

function populateMarkets(symbols, current) {
  if (marketSelect.options.length === 0) {
    for (const sym of symbols) {
      const opt = document.createElement("option");
      opt.value = sym;
      opt.textContent = sym === "SIM" ? "SIM (synthetic)" : sym;
      marketSelect.appendChild(opt);
    }
  }
  marketSelect.value = current;
  marketSelect.disabled = WS_DISABLED || symbols.length <= 1;
}

function populatePeriods(periods, current) {
  const list = periods && periods.length ? periods : DEFAULT_PERIODS;
  periodSelect.innerHTML = "";
  for (const period of list) {
    const opt = document.createElement("option");
    opt.value = period;
    opt.textContent = period;
    periodSelect.appendChild(opt);
  }
  const fallback = current && list.includes(current) ? current : list[list.length - 1];
  periodSelect.value = fallback;
  periodSelect.disabled = false;
}

async function requestMarketUpdate(symbol, period) {
  marketSelect.disabled = true;
  periodSelect.disabled = true;
  if (snapshotBtn) snapshotBtn.disabled = true;
  marketStatus.textContent = "Loading…";
  try {
    const res = await fetch(
      `/api/market?symbol=${encodeURIComponent(symbol)}&period=${encodeURIComponent(period)}`,
    );
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "Market load failed");
    // if server returned a dataset (useful when WS isn't connected), apply it locally
    if (json.dataset) {
      dataset = json.dataset;
      // ensure derived ranges are computed the same way as WS handler
      const pmin = Math.min(...dataset.prices);
      const pmax = Math.max(...dataset.prices);
      const ppad = (pmax - pmin) * 0.06;
      dataset.priceRange = [pmin - ppad, pmax + ppad];

      const rmin = Math.min(...dataset.returns);
      const rmax = Math.max(...dataset.returns);
      const rpad = (rmax - rmin) * 0.1;
      dataset.returnRange = [rmin - rpad, rmax + rpad];

      const eq = dataset.prices.map((p) => (p / dataset.S0) * 100);
      const emin = Math.min(...eq);
      const emax = Math.max(...eq);
      const epad = (emax - emin) * 0.06;
      dataset.equityRange = [emin - epad, emax + epad];

      // populate selects and enable snapshot
      if (dataset.symbols && dataset.symbols.length) populateMarkets(dataset.symbols, dataset.symbol);
      if (dataset.periods && dataset.periods.length) populatePeriods(dataset.periods, dataset.period);
      marketStatus.textContent = WS_DISABLED ? `SIM only (${json.period})` : `Live (${json.period})`;
      if (snapshotBtn) snapshotBtn.disabled = false;
      // render first frame
      currentIndex = 0;
      onTick(0);
    }
  } catch (_err) {
    marketStatus.textContent = "Error";
  } finally {
    marketSelect.disabled = WS_DISABLED || marketSelect.options.length <= 1;
    periodSelect.disabled = false;
  }
}

marketSelect.addEventListener("change", async (e) => {
  const symbol = e.target.value;
  const period = periodSelect.value || dataset?.period || DEFAULT_PERIODS[DEFAULT_PERIODS.length - 1];
  await requestMarketUpdate(symbol, period);
});

periodSelect.addEventListener("change", async (e) => {
  const period = e.target.value;
  const symbol = marketSelect.value || dataset?.symbol || "SIM";
  await requestMarketUpdate(symbol, period);
});

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function sanitizeFilename(value) {
  return String(value).replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();
}

async function exportSnapshot() {
  if (!dataset) return;
  if (!snapshotBtn) return;
  const left = document.getElementById("left3d");
  const right = document.getElementById("right4");
  if (!left || !right) return;

  snapshotBtn.disabled = true;
  marketStatus.textContent = "Rendering…";

  try {
    const leftRect = left.getBoundingClientRect();
    const rightRect = right.getBoundingClientRect();
    const leftImgUrl = await Plotly.toImage("left3d", {
      format: "png",
      width: Math.max(1, Math.floor(leftRect.width)),
      height: Math.max(1, Math.floor(leftRect.height)),
    });
    const rightImgUrl = await Plotly.toImage("right4", {
      format: "png",
      width: Math.max(1, Math.floor(rightRect.width)),
      height: Math.max(1, Math.floor(rightRect.height)),
    });

    const leftImg = await loadImage(leftImgUrl);
    const rightImg = await loadImage(rightImgUrl);

    const gap = 10;
    const header = 70;
    const canvas = document.createElement("canvas");
    canvas.width = leftImg.width + rightImg.width + gap;
    canvas.height = Math.max(leftImg.height, rightImg.height) + header;

    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0b0b0b";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 20px 'DejaVu Sans', sans-serif";
    ctx.fillText("Hidden Markov Regime Dashboard", canvas.width / 2, 26);
    ctx.fillStyle = "#00f2ff";
    ctx.font = "12px 'DejaVu Sans', sans-serif";
    ctx.fillText("3-state HMM · Forward-Backward inference · Live WebSocket", canvas.width / 2, 46);
    ctx.fillStyle = "#777777";
    ctx.font = "11px 'DejaVu Sans', sans-serif";
    ctx.fillText(`Market: ${dataset.symbol}  ·  Range: ${dataset.period}`, canvas.width / 2, 62);

    ctx.drawImage(leftImg, 0, header);
    ctx.drawImage(rightImg, leftImg.width + gap, header);

    const link = document.createElement("a");
    link.download = `hmm-${sanitizeFilename(dataset.symbol)}-${sanitizeFilename(dataset.period)}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  } catch (_err) {
    marketStatus.textContent = "Snapshot failed";
  } finally {
    marketStatus.textContent = `Live (${dataset.period})`;
    snapshotBtn.disabled = false;
  }
}

if (snapshotBtn) {
  snapshotBtn.addEventListener("click", () => {
    exportSnapshot();
  });
}

if (periodSelect.options.length === 0) {
  populatePeriods(DEFAULT_PERIODS, DEFAULT_PERIODS[DEFAULT_PERIODS.length - 1]);
  periodSelect.disabled = true;
}

connectWs();

// double-click on the left 3D view resets the camera to defaults
(() => {
  const leftEl = document.getElementById("left3d");
  if (!leftEl) return;
  leftEl.addEventListener("dblclick", (e) => {
    // prefer our explicit reset so camera and aspect return to DEFAULT_CAMERA
    applyLeftDefaults();
    // stop propagation so Plotly doesn't also perform other dblclick actions
    e.stopPropagation();
  });
})();

// ensure we have data immediately (use synthetic SIM if WS not yet connected)
requestMarketUpdate("SIM", periodSelect.value || DEFAULT_PERIODS[DEFAULT_PERIODS.length - 1]);
