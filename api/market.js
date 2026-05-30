const { DEFAULT_PERIODS, SYMBOLS, buildSimDataset } = require("./_lib/hmm");

module.exports = async (req, res) => {
  const symbol = String(req.query.symbol || "SIM").toUpperCase();
  const period = String(req.query.period || "5y");

  if (!SYMBOLS.includes(symbol)) {
    res.status(400).json({ ok: false, error: "Only SIM is supported on Vercel" });
    return;
  }

  const usedPeriod = DEFAULT_PERIODS.includes(period) ? period : DEFAULT_PERIODS[DEFAULT_PERIODS.length - 1];
  const dataset = buildSimDataset(usedPeriod);

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ ok: true, symbol, period: usedPeriod, dataset });
};
