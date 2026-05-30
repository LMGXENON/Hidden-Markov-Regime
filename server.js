const path = require("path");
const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");
const { spawn } = require("child_process");

const PORT = Number(process.env.PORT || 8050);
const INTERVAL_MS = Number(process.env.TICK_INTERVAL_MS || 120);
const PYTHON_BIN = process.env.PYTHON_BIN || "python3";
const YF_PERIOD = process.env.YF_PERIOD || "5y";
const YF_INTERVAL = process.env.YF_INTERVAL || "1d";
const DEFAULT_PERIODS = ["1y", "3y", "5y"];
const PERIODS = (process.env.YF_PERIODS ? process.env.YF_PERIODS.split(",") : DEFAULT_PERIODS)
  .map((period) => period.trim())
  .filter(Boolean);
if (!PERIODS.includes(YF_PERIOD)) PERIODS.push(YF_PERIOD);

const SYMBOLS = ["SIM", "SPY", "QQQ", "BTC-USD"];

const HMM = {
  n_states: 3,
  names: ["Bull", "Bear", "Crisis"],
  means: [0.0009, -0.0006, -0.0020],
  stds: [0.0080, 0.0145, 0.0310],
  trans: [
    [0.97, 0.025, 0.005],
    [0.04, 0.945, 0.015],
    [0.02, 0.08, 0.9],
  ],
  init: [0.7, 0.2, 0.1],
  S0: 100.0,
  T: 1000,
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randn(rng) {
  const u = Math.max(rng(), 1e-12);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function sampleCategorical(rng, probs) {
  const r = rng();
  let acc = 0;
  for (let i = 0; i < probs.length; i++) {
    acc += probs[i];
    if (r <= acc) return i;
  }
  return probs.length - 1;
}

function logsumexp(values) {
  const maxVal = Math.max(...values);
  let sum = 0;
  for (const v of values) sum += Math.exp(v - maxVal);
  return maxVal + Math.log(sum);
}

function forwardBackward(returns) {
  const { n_states, means, stds, trans, init } = HMM;
  const T = returns.length;
  const logEmit = Array.from({ length: T }, () => new Array(n_states).fill(0));

  for (let t = 0; t < T; t++) {
    for (let k = 0; k < n_states; k++) {
      const variance = stds[k] * stds[k];
      const diff = returns[t] - means[k];
      logEmit[t][k] = -0.5 * Math.log(2 * Math.PI * variance) - (diff * diff) / (2 * variance);
    }
  }

  const logTrans = trans.map((row) => row.map((v) => Math.log(v + 1e-15)));
  const logInit = init.map((v) => Math.log(v + 1e-15));

  const logAlpha = Array.from({ length: T }, () => new Array(n_states).fill(-Infinity));
  for (let k = 0; k < n_states; k++) logAlpha[0][k] = logInit[k] + logEmit[0][k];

  for (let t = 1; t < T; t++) {
    for (let j = 0; j < n_states; j++) {
      const vals = [];
      for (let i = 0; i < n_states; i++) vals.push(logAlpha[t - 1][i] + logTrans[i][j]);
      logAlpha[t][j] = logsumexp(vals) + logEmit[t][j];
    }
  }

  const logBeta = Array.from({ length: T }, () => new Array(n_states).fill(0));
  for (let t = T - 2; t >= 0; t--) {
    for (let i = 0; i < n_states; i++) {
      const vals = [];
      for (let j = 0; j < n_states; j++) vals.push(logTrans[i][j] + logEmit[t + 1][j] + logBeta[t + 1][j]);
      logBeta[t][i] = logsumexp(vals);
    }
  }

  const gamma = Array.from({ length: T }, () => new Array(n_states).fill(0));
  for (let t = 0; t < T; t++) {
    const logVals = [];
    for (let k = 0; k < n_states; k++) logVals.push(logAlpha[t][k] + logBeta[t][k]);
    const logNorm = logsumexp(logVals);
    for (let k = 0; k < n_states; k++) gamma[t][k] = Math.exp(logVals[k] - logNorm);
  }
  return gamma;
}

function argmaxRow(row) {
  let best = 0;
  for (let i = 1; i < row.length; i++) {
    if (row[i] > row[best]) best = i;
  }
  return best;
}

function simulateHMM(seed) {
  const rng = mulberry32(seed);
  const { T, n_states, means, stds, init, trans, S0 } = HMM;
  const states = new Array(T).fill(0);
  const returns = new Array(T).fill(0);
  const prices = new Array(T).fill(0);

  states[0] = sampleCategorical(rng, init);
  returns[0] = means[states[0]] + stds[states[0]] * randn(rng);
  prices[0] = S0;

  for (let t = 1; t < T; t++) {
    states[t] = sampleCategorical(rng, trans[states[t - 1]]);
    returns[t] = means[states[t]] + stds[states[t]] * randn(rng);
    prices[t] = prices[t - 1] * Math.exp(returns[t]);
  }

  return { states, returns, prices };
}

function buildSimDataset(period) {
  const sim = simulateHMM(Math.floor(Date.now() / 1000) % 100000);
  const gamma = forwardBackward(sim.returns);
  const states = gamma.map(argmaxRow);
  return {
    symbol: "SIM",
    period,
    t: Array.from({ length: HMM.T }, (_, i) => i),
    dates: Array.from({ length: HMM.T }, (_, i) => `t=${i}`),
    returns: sim.returns,
    prices: sim.prices,
    gamma,
    states,
    names: HMM.names,
    trans: HMM.trans,
    S0: HMM.S0,
  };
}

function fetchMarket(symbol, period) {
  return new Promise((resolve, reject) => {
    const script = path.join(__dirname, "backend", "fetch_yfinance.py");
    const args = [script, "--symbol", symbol, "--period", period, "--interval", YF_INTERVAL];
    const proc = spawn(PYTHON_BIN, args, { cwd: __dirname });

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || stdout || `yfinance failed (${code})`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        if (parsed.error) {
          reject(new Error(parsed.error));
          return;
        }
        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    });
  });
}

async function buildDataset(symbol, period) {
  const usedPeriod = period || YF_PERIOD;
  if (symbol === "SIM") {
    return buildSimDataset(usedPeriod);
  }
  try {
    const market = await fetchMarket(symbol, usedPeriod);
    const returns = market.returns;
    const prices = market.prices;
    const dates = market.dates;

    const cleanReturns = [];
    const cleanPrices = [];
    const cleanDates = [];
    for (let i = 0; i < returns.length; i++) {
      const r = Number(returns[i]);
      const p = Number(prices[i]);
      if (!Number.isFinite(r) || !Number.isFinite(p) || p <= 0) continue;
      cleanReturns.push(r);
      cleanPrices.push(p);
      if (dates && dates[i]) cleanDates.push(dates[i]);
    }
    if (cleanReturns.length < 10) {
      throw new Error("Not enough clean market data");
    }

    const T = cleanReturns.length;
    const gamma = forwardBackward(cleanReturns);
    const states = gamma.map(argmaxRow);
    return {
      symbol,
      period: usedPeriod,
      t: Array.from({ length: T }, (_, i) => i),
      dates: cleanDates.length ? cleanDates : dates,
      returns: cleanReturns,
      prices: cleanPrices,
      gamma,
      states,
      names: HMM.names,
      trans: HMM.trans,
      S0: HMM.S0,
    };
  } catch (err) {
    console.error(`Market fetch failed for ${symbol}:`, err.message || err);
    // Fallback to a synthetic dataset when live fetch fails so the UI still shows data
    const sim = buildSimDataset(usedPeriod);
    // keep the requested symbol in the payload so the UI knows which symbol was requested
    sim.symbol = symbol;
    sim.note = `synthetic-fallback: ${String(err.message || err)}`;
    return sim;
  }
}

let dataset = null;
let currentSymbol = SYMBOLS[0];
let currentPeriod = YF_PERIOD;
let index = 0;
let loading = false;

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

function broadcast(payload) {
  const msg = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(msg);
  }
}

async function setSymbol(symbol, period) {
  if (!SYMBOLS.includes(symbol)) {
    throw new Error("Unsupported symbol");
  }
  if (period && !PERIODS.includes(period)) {
    throw new Error("Unsupported period");
  }
  if (loading) return;
  loading = true;
  const usedPeriod = period || currentPeriod;
  const next = await buildDataset(symbol, usedPeriod);
  dataset = next;
  currentSymbol = symbol;
  currentPeriod = usedPeriod;
  index = 0;
  loading = false;
  broadcast({ type: "meta", payload: { ...dataset, symbols: SYMBOLS, period: currentPeriod, periods: PERIODS } });
  broadcast({ type: "tick", payload: { index } });
}

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/market", async (req, res) => {
  try {
    const symbol = String(req.query.symbol || currentSymbol).toUpperCase();
    const period = String(req.query.period || currentPeriod);
    await setSymbol(symbol, period);
    // return the current dataset so clients without an active WS can render immediately
    res.json({ ok: true, symbol, period, dataset });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    mode: "node-web",
    interval_ms: INTERVAL_MS,
    index,
    symbol: currentSymbol,
    period: currentPeriod,
  });
});

// Return the current index and the latest dataset (if available).
// Useful for HTTP-polling clients and platforms without WebSocket support.
app.get("/api/state", (_req, res) => {
  res.json({ ok: true, index, dataset, symbol: currentSymbol, period: currentPeriod, symbols: SYMBOLS, periods: PERIODS });
});

wss.on("connection", (socket) => {
  if (dataset) {
    socket.send(JSON.stringify({ type: "meta", payload: { ...dataset, symbols: SYMBOLS, period: currentPeriod, periods: PERIODS } }));
    socket.send(JSON.stringify({ type: "tick", payload: { index } }));
  }
});

setInterval(() => {
  if (!dataset || loading) return;
  index += 1;
  if (index >= dataset.t.length) index = 0;
  broadcast({ type: "tick", payload: { index } });
}, INTERVAL_MS);

async function start() {
  try {
    dataset = await buildDataset(currentSymbol, currentPeriod);
  } catch (err) {
    console.error("Failed to load market data:", err.message);
    process.exit(1);
  }

  server.listen(PORT, () => {
    console.log(`PRISM Node server running: http://localhost:${PORT}`);
  });
}

start();
