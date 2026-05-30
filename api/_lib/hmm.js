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

const DEFAULT_PERIODS = ["1y", "3y", "5y"];
const SYMBOLS = ["SIM"];

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
    symbols: SYMBOLS,
    periods: DEFAULT_PERIODS,
  };
}

module.exports = {
  HMM,
  DEFAULT_PERIODS,
  SYMBOLS,
  buildSimDataset,
};
