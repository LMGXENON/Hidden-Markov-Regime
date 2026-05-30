const { DEFAULT_PERIODS, buildSimDataset } = require("./_lib/hmm");

const CACHE_TTL_MS = 5 * 60 * 1000;

function getCache() {
  if (!globalThis.__hmmCache) {
    globalThis.__hmmCache = { datasets: {} };
  }
  return globalThis.__hmmCache;
}

module.exports = async (req, res) => {
  const intervalMs = Number(process.env.TICK_INTERVAL_MS || 120);
  const cache = getCache();
  const now = Date.now();
  const requestedPeriod = String(req.query.period || "5y");
  const period = DEFAULT_PERIODS.includes(requestedPeriod)
    ? requestedPeriod
    : DEFAULT_PERIODS[DEFAULT_PERIODS.length - 1];
  const entry = cache.datasets[period];
  if (!entry || now - entry.updatedAt > CACHE_TTL_MS) {
    cache.datasets[period] = { dataset: buildSimDataset(period), updatedAt: now };
  }

  const dataset = cache.datasets[period].dataset;
  const index = Math.floor(now / intervalMs) % dataset.t.length;

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ ok: true, index, dataset, symbol: dataset.symbol, period: dataset.period });
};
