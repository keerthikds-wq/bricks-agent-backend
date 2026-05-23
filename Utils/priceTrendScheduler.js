/**
 * Price Trend Scheduler
 * ─────────────────────
 * Called once at server startup (after DB connects).
 *
 * What it does:
 *   1. SEED   — if the DB has NO price data at all, generate 12 months of
 *               realistic history for all 9 materials.
 *   2. DAILY TICK — for each material, check if a data point already exists
 *               for today's date. If not, take yesterday's price and apply a
 *               small market-movement calculation to generate today's price.
 *
 * Why this works on Render free tier:
 *   Render spins down after inactivity and wakes up on the next request.
 *   Every wake-up runs handler.js → connect() → this function.
 *   The "today already exists" guard makes it idempotent — calling it 100×
 *   in a day produces exactly 1 new data point per material per day.
 */

const PriceTrend = require('../Model/PriceTrend');

// ─── Material definitions ──────────────────────────────────────────────────────
const MATERIALS = {
  cement:    { unit: 'per 50kg bag',  basePrice: 370,  volatility: 0.04 },
  steel:     { unit: 'per kg',        basePrice: 72,   volatility: 0.06 },
  tmt_bars:  { unit: 'per kg',        basePrice: 68,   volatility: 0.06 },
  bricks:    { unit: 'per 1000 pcs',  basePrice: 7800, volatility: 0.03 },
  sand:      { unit: 'per brass',     basePrice: 2200, volatility: 0.05 },
  aggregate: { unit: 'per brass',     basePrice: 1800, volatility: 0.04 },
  tiles:     { unit: 'per sq.ft',     basePrice: 42,   volatility: 0.03 },
  paint:     { unit: 'per litre',     basePrice: 185,  volatility: 0.02 },
  plywood:   { unit: 'per sheet',     basePrice: 1650, volatility: 0.04 },
};

/**
 * Returns a midnight-normalised Date for today (avoids time-of-day duplication).
 */
function todayMidnight() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Returns tomorrow midnight — used as the upper bound when querying "today".
 */
function tomorrowMidnight() {
  const d = todayMidnight();
  d.setDate(d.getDate() + 1);
  return d;
}

/**
 * Generate a new price from a previous price using a clamped random walk.
 * - Small upward bias (~0.3%) to simulate construction material inflation.
 * - Volatility is material-specific.
 * - Price is clamped to ±40% of the material's base price to stay realistic.
 */
function nextPrice(prevPrice, basePrice, volatility) {
  const bias   = 0.003;                               // slight inflation bias
  const delta  = (Math.random() * 2 - (1 - bias)) * volatility;
  const raw    = Math.round(prevPrice * (1 + delta));
  const minP   = Math.round(basePrice * 0.60);
  const maxP   = Math.round(basePrice * 1.40);
  return Math.max(minP, Math.min(maxP, raw));
}

// ─── Main export ───────────────────────────────────────────────────────────────
module.exports = async function runPriceTrendScheduler() {
  try {
    const totalCount = await PriceTrend.countDocuments();

    // ── STEP 1: Initial seed if DB is completely empty ─────────────────────────
    if (totalCount === 0) {
      console.log('[PriceTrend] No data found — seeding 12 months of history…');
      const records = [];
      const now     = new Date();

      for (const [material, meta] of Object.entries(MATERIALS)) {
        let price = meta.basePrice;
        // Go back 12 months and generate 2 points per month (1st and 15th)
        for (let monthsAgo = 12; monthsAgo >= 1; monthsAgo--) {
          for (const dayOfMonth of [1, 15]) {
            const date = new Date(now);
            date.setMonth(date.getMonth() - monthsAgo);
            date.setDate(dayOfMonth);
            date.setHours(0, 0, 0, 0);
            price = nextPrice(price, meta.basePrice, meta.volatility);
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
      console.log(`[PriceTrend] Seeded ${records.length} historical records.`);
    }

    // ── STEP 2: Daily tick — add today's price if not already present ──────────
    const today    = todayMidnight();
    const tomorrow = tomorrowMidnight();
    const added    = [];

    for (const [material, meta] of Object.entries(MATERIALS)) {
      // Check if today's data point already exists
      const existing = await PriceTrend.findOne({
        material,
        recorded_at: { $gte: today, $lt: tomorrow },
      });

      if (existing) continue; // Already have today's price — skip

      // Get the most recent price for this material
      const latest = await PriceTrend.findOne({ material })
        .sort({ recorded_at: -1 })
        .select('price')
        .lean();

      const prevPrice = latest ? latest.price : meta.basePrice;
      const todayPrice = nextPrice(prevPrice, meta.basePrice, meta.volatility);

      await PriceTrend.create({
        material,
        price:       todayPrice,
        unit:        meta.unit,
        region:      'national',
        recorded_at: today,
        source:      'auto',
      });

      added.push(`${material}: ₹${todayPrice}`);
    }

    if (added.length > 0) {
      console.log(`[PriceTrend] Daily tick — added today's prices: ${added.join(' | ')}`);
    } else {
      console.log('[PriceTrend] Daily tick — today\'s prices already up to date.');
    }

  } catch (err) {
    // Non-fatal: log and continue. The app still works, trends just won't update today.
    console.error('[PriceTrend] Scheduler error (non-fatal):', err.message);
  }
};
