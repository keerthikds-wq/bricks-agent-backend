const PriceTrend = require('../Model/PriceTrend');
const axios      = require('axios');

// Seasonal/market context used to enrich alert tips (no API cost)
const SEASONAL_CONTEXT = {
    cement:    'Cement prices spike before monsoon (Jun–Sep) and Diwali season',
    steel:     'Steel tracks global iron ore prices and domestic infrastructure demand',
    tmt_bars:  'TMT bar prices follow steel scrap rates and power tariffs',
    bricks:    'Brick prices peak in pre-monsoon construction season (Feb–May)',
    sand:      'River sand prices rise after monsoon due to mining restrictions',
    aggregate: 'Aggregate is relatively stable; rises with diesel/transport costs',
    tiles:     'Tile prices move with import duties and ceramic fuel costs',
    paint:     'Paint prices track crude oil derivatives and titanium dioxide',
    plywood:   'Plywood prices depend on timber imports and overseas supply chains',
};

function alertSignal(pctChange) {
    if (pctChange >= 5)  return { signal: 'buy_now', urgency: 'high' };
    if (pctChange >= 2)  return { signal: 'buy_now', urgency: 'medium' };
    if (pctChange <= -5) return { signal: 'wait',    urgency: 'high' };
    if (pctChange <= -2) return { signal: 'wait',    urgency: 'medium' };
    return                      { signal: 'neutral',  urgency: 'low' };
}

function buildTip(material, label, pctChange, signal, urgency, currentPrice, unit) {
    const abs = Math.abs(pctChange).toFixed(1);
    const ctx = SEASONAL_CONTEXT[material];
    const fmt = (n) => '₹' + Number(n).toLocaleString('en-IN');

    if (signal === 'buy_now' && urgency === 'high') {
        return `${label} is up ${abs}% in 3 months — strong upward momentum. ${ctx}. Procure now at ${fmt(currentPrice)} ${unit} before prices climb further.`;
    }
    if (signal === 'buy_now') {
        return `${label} rising ${abs}% over 3 months. ${ctx}. Consider buying 1–2 months of stock now to lock current rates.`;
    }
    if (signal === 'wait' && urgency === 'high') {
        return `${label} has fallen ${abs}% in 3 months and is still declining. Wait 2–3 weeks before bulk procurement for better rates.`;
    }
    if (signal === 'wait') {
        return `${label} easing (−${abs}% in 3 months). No urgency — buy closer to your requirement date.`;
    }
    return `${label} prices are stable (${abs}% change in 3 months). Buy as per your project schedule at ${fmt(currentPrice)} ${unit}.`;
}

// ─── Material metadata ─────────────────────────────────────────────────────────
const MATERIAL_META = {
  cement:    { unit: 'per 50kg bag',  label: 'Cement',        icon: 'local_fire_department' },
  steel:     { unit: 'per kg',        label: 'Steel (Fe500)',  icon: 'construction' },
  tmt_bars:  { unit: 'per kg',        label: 'TMT Bars',       icon: 'hardware' },
  bricks:    { unit: 'per 1000 pcs',  label: 'Bricks',         icon: 'cabin' },
  sand:      { unit: 'per brass',     label: 'River Sand',     icon: 'waves' },
  aggregate: { unit: 'per brass',     label: 'Aggregate 20mm', icon: 'terrain' },
  tiles:     { unit: 'per sq.ft',     label: 'Vitrified Tiles',icon: 'grid_view' },
  paint:     { unit: 'per litre',     label: 'Exterior Paint', icon: 'format_paint' },
  plywood:   { unit: 'per sheet',     label: 'Plywood 18mm',   icon: 'layers' },
};

// ─── Seed realistic 12-month price history ──────────────────────────────────────
exports.seedPriceTrends = async (req, res) => {
  try {
    const count = await PriceTrend.countDocuments();
    if (count > 0) {
      return res.status(200).json({ message: `Already seeded (${count} records). No action taken.` });
    }

    const now = new Date();
    const records = [];

    // Base prices (realistic INR values as of 2024-25)
    const basePrices = {
      cement:    370,   // per 50kg bag
      steel:     72,    // per kg
      tmt_bars:  68,    // per kg
      bricks:    7800,  // per 1000 pcs
      sand:      2200,  // per brass (100 cft)
      aggregate: 1800,  // per brass
      tiles:     42,    // per sq.ft
      paint:     185,   // per litre
      plywood:   1650,  // per 18mm sheet (8x4)
    };

    // Volatility factors (% max swing per month)
    const volatility = {
      cement: 0.04, steel: 0.06, tmt_bars: 0.06, bricks: 0.03,
      sand: 0.05, aggregate: 0.04, tiles: 0.03, paint: 0.02, plywood: 0.04,
    };

    // Generate 2 data points per month for past 12 months
    for (const [material, basePrice] of Object.entries(basePrices)) {
      const meta = MATERIAL_META[material];
      let price = basePrice;
      const vol = volatility[material];

      for (let monthsAgo = 12; monthsAgo >= 0; monthsAgo--) {
        for (let half = 1; half >= 0; half--) {
          const date = new Date(now);
          date.setMonth(date.getMonth() - monthsAgo);
          date.setDate(half === 1 ? 1 : 15);

          // Random walk with slight upward bias (construction inflation)
          const change = (Math.random() * 2 - 0.85) * vol;
          price = Math.round(price * (1 + change));

          records.push({
            material,
            price,
            unit: meta.unit,
            region: 'national',
            recorded_at: date,
            source: 'seed',
          });
        }
      }
    }

    await PriceTrend.insertMany(records);
    res.status(201).json({ message: `Seeded ${records.length} price trend records.`, count: records.length });
  } catch (err) {
    console.error('seedPriceTrends:', err);
    res.status(500).json({ message: 'Seed failed', error: err.message });
  }
};

// ─── GET /api/price-trends?material=cement&period=6m ────────────────────────────
// Returns: metadata + data points for chart + current price + % change
exports.getTrend = async (req, res) => {
  try {
    const { material, period = '6m', region = 'national' } = req.query;

    if (!material || !MATERIAL_META[material]) {
      return res.status(400).json({ message: 'Invalid or missing material' });
    }

    const periodDays = { '1m': 30, '3m': 90, '6m': 180, '1y': 365 };
    const days = periodDays[period] || 180;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const points = await PriceTrend.find({
      material,
      region,
      recorded_at: { $gte: since },
    })
      .sort({ recorded_at: 1 })
      .select('price recorded_at -_id')
      .lean();

    if (points.length === 0) {
      return res.status(404).json({ message: 'No data for this material/period.' });
    }

    const currentPrice = points[points.length - 1].price;
    const oldestPrice  = points[0].price;
    const pctChange    = (((currentPrice - oldestPrice) / oldestPrice) * 100).toFixed(1);
    const meta         = MATERIAL_META[material];

    res.status(200).json({
      material,
      label:        meta.label,
      unit:         meta.unit,
      current_price: currentPrice,
      pct_change:   parseFloat(pctChange),
      direction:    parseFloat(pctChange) >= 0 ? 'up' : 'down',
      period,
      data: points.map(p => ({
        price: p.price,
        date: p.recorded_at,
      })),
    });
  } catch (err) {
    console.error('getTrend:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── GET /api/price-trends/all-current — summary cards for home screen ──────────
exports.getAllCurrent = async (req, res) => {
  try {
    const materials = Object.keys(MATERIAL_META);
    const results = [];

    for (const material of materials) {
      // Get latest 2 points for % change calc
      const latest = await PriceTrend.find({ material })
        .sort({ recorded_at: -1 })
        .limit(2)
        .select('price recorded_at -_id')
        .lean();

      if (latest.length === 0) continue;

      const current = latest[0].price;
      const prev    = latest.length > 1 ? latest[1].price : current;
      const pct     = prev !== 0 ? (((current - prev) / prev) * 100).toFixed(1) : '0.0';
      const meta    = MATERIAL_META[material];

      results.push({
        material,
        label:        meta.label,
        unit:         meta.unit,
        current_price: current,
        pct_change:   parseFloat(pct),
        direction:    parseFloat(pct) >= 0 ? 'up' : 'down',
      });
    }

    res.status(200).json({ data: results });
  } catch (err) {
    console.error('getAllCurrent:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── POST /api/price-trends — admin adds a new price point ───────────────────────
exports.addPricePoint = async (req, res) => {
  try {
    const { material, price, region } = req.body;
    if (!material || !price) {
      return res.status(400).json({ message: 'material and price are required' });
    }
    if (!MATERIAL_META[material]) {
      return res.status(400).json({ message: `Unknown material: ${material}` });
    }
    const meta  = MATERIAL_META[material];
    const point = await PriceTrend.create({
      material,
      price: Number(price),
      unit: meta.unit,
      region: region || 'national',
      recorded_at: new Date(),
      source: 'admin',
    });
    res.status(201).json({ message: 'Price point added', data: point });
  } catch (err) {
    console.error('addPricePoint:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── GET /api/price-trends/materials — list all available materials ──────────────
exports.getMaterials = async (req, res) => {
  const list = Object.entries(MATERIAL_META).map(([key, val]) => ({
    key,
    label: val.label,
    unit:  val.unit,
    icon:  val.icon,
  }));
  res.status(200).json({ data: list });
};

// ─── GET /api/price-trends/alerts ────────────────────────────────────────────────
// Returns buy-now / wait / neutral signal for every tracked material based on
// the 3-month price trend. Fully computational — zero API cost.
// Optional: ?materials=cement,steel to filter (default: all)
exports.getPriceAlerts = async (req, res) => {
  try {
    const requested = req.query.materials
      ? req.query.materials.split(',').filter(m => MATERIAL_META[m])
      : Object.keys(MATERIAL_META);

    const since = new Date();
    since.setDate(since.getDate() - 90); // 3-month window

    const alerts = [];
    let buyCount  = 0;
    let waitCount = 0;

    for (const material of requested) {
      const meta   = MATERIAL_META[material];
      const points = await PriceTrend.find({ material, recorded_at: { $gte: since } })
        .sort({ recorded_at: 1 })
        .select('price recorded_at -_id')
        .lean();

      if (points.length < 2) continue;

      const currentPrice = points[points.length - 1].price;
      const oldestPrice  = points[0].price;
      const pctChange    = parseFloat((((currentPrice - oldestPrice) / oldestPrice) * 100).toFixed(1));
      const { signal, urgency } = alertSignal(pctChange);
      const tip = buildTip(material, meta.label, pctChange, signal, urgency, currentPrice, meta.unit);

      if (signal === 'buy_now') buyCount++;
      if (signal === 'wait')    waitCount++;

      alerts.push({
        material,
        label:         meta.label,
        unit:          meta.unit,
        icon:          meta.icon,
        current_price: currentPrice,
        change_3m_pct: pctChange,
        direction:     pctChange >= 0 ? 'up' : 'down',
        signal,         // 'buy_now' | 'wait' | 'neutral'
        urgency,        // 'high' | 'medium' | 'low'
        tip,
        chart_data: points.slice(-6).map(p => ({ price: p.price, date: p.recorded_at })),
      });
    }

    // Sort: high-urgency buy_now first, then high-urgency wait, then the rest
    alerts.sort((a, b) => {
      const rank = { buy_now: 0, wait: 1, neutral: 2 };
      const urg  = { high: 0, medium: 1, low: 2 };
      if (rank[a.signal] !== rank[b.signal]) return rank[a.signal] - rank[b.signal];
      return urg[a.urgency] - urg[b.urgency];
    });

    // One-line market summary
    const parts = [];
    if (buyCount)  parts.push(`${buyCount} material${buyCount > 1 ? 's' : ''} rising — procure soon`);
    if (waitCount) parts.push(`${waitCount} material${waitCount > 1 ? 's' : ''} falling — hold off`);
    const summary = parts.length ? parts.join('. ') + '.' : 'All material prices are stable this week.';

    return res.json({
      status: 200,
      generated_at: new Date(),
      summary,
      alerts,
      error: false,
    });
  } catch (err) {
    console.error('getPriceAlerts:', err);
    res.status(500).json({ status: 500, message: 'Server error', error: true });
  }
};
