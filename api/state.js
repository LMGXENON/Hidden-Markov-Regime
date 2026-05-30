const { buildSimDataset } = require("./_lib/hmm");

const CACHE_TTL_MS = 5 * 60 * 1000;

function getCache() {
  if (!globalThis.__hmmCache) {
    globalThis.__hmmCache = { dataset: null, updatedAt: 0 };
  }
  return globalThis.__hmmCache;
}

module.exports = async (req, res) => {
  const intervalMs = Number(process.env.TICK_INTERVAL_MS || 120);
  const cache = getCache();
  const now = Date.now();
  if (!cache.dataset || now - cache.updatedAt > CACHE_TTL_MS) {
    cache.dataset = buildSimDataset("5y");
    cache.updatedAt = now;
  }

  const dataset = cache.dataset;
  const index = Math.floor(now / intervalMs) % dataset.t.length;

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ ok: true, index, dataset, symbol: dataset.symbol, period: dataset.period });
};
