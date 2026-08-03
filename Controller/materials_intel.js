const PriceTrend = require("../Model/PriceTrend");
const LedgerEntry = require("../Model/LedgerEntry");
const Project = require("../Model/Project");
const { visibleProjectFilter, callerId } = require("../Middleware/projectAccess");
const money = require("../Utils/money");

const ok = (res, data, s = 200) => res.status(s).json({ success: true, data });
const fail = (res, s, message) => res.status(s).json({ success: false, message });

/**
 * Material market intelligence — what the builder pays, against what things
 * cost.
 *
 * ── Why a price ticker on its own is close to useless ────────────────────────
 *
 * "Cement ₹390/bag, up 4%" is a fact about the country. It does not tell a
 * builder whether they are being overcharged, or what the rise costs them. Two
 * builders reading the same ticker should act differently — one buying at ₹360
 * and one at ₹425 are in completely different positions — and the ticker cannot
 * distinguish them.
 *
 * So every figure here is joined to the caller's own purchasing, taken from the
 * line items on their material bills. The output answers three questions the
 * ticker cannot: what am I paying, is that above or below the market, and what
 * does the recent movement cost me at my consumption.
 *
 * ── Where the data is not there ──────────────────────────────────────────────
 *
 * A builder who has never itemised a bill has no "what I pay". That is reported
 * as null with a reason, never filled in with the market price — quoting the
 * market back as though it were their own rate would be inventing the one
 * number this endpoint exists to provide.
 */

/**
 * Free-text bill lines to tracked materials.
 *
 * Builders type "OPC 53 grade", "TMT 12mm", "River sand". Matching is by
 * keyword and deliberately conservative: an unmatched line is left out rather
 * than forced into the nearest bucket, because a wrong match silently corrupts
 * the average rate this whole endpoint turns on.
 */
const KEYWORDS = {
    cement: ["cement", "opc", "ppc"],
    steel: ["steel"],
    tmt_bars: ["tmt", "rebar", "reinforcement"],
    bricks: ["brick", "block"],
    sand: ["sand"],
    aggregate: ["aggregate", "jelly", "metal", "gravel"],
    tiles: ["tile", "vitrified", "granite"],
    paint: ["paint", "emulsion", "primer"],
    plywood: ["plywood", "ply", "board"],
};

function classify(name) {
    const s = String(name || "").toLowerCase();
    if (!s) return null;
    // Longest keyword first, so "tmt bars" is not swallowed by "steel" and
    // "plywood" is not matched as "ply" in a different product.
    let best = null, bestLen = 0;
    for (const [material, words] of Object.entries(KEYWORDS)) {
        for (const w of words) {
            if (s.includes(w) && w.length > bestLen) {
                best = material;
                bestLen = w.length;
            }
        }
    }
    return best;
}

function pct(from, to) {
    if (!from) return null;
    return Math.round(((to - from) / from) * 1000) / 10;
}

/**
 * Are two unit strings measuring the same thing?
 *
 * This guard exists because the first run without it reported the builder as
 * paying 7882% over market on steel. Nothing was wrong with the arithmetic: the
 * market price was ₹52 per KG and the bill line was ₹4,150 per BUNDLE. Dividing
 * one by the other is meaningless, and it was being shown as the headline
 * "you are overpaying" figure — a number that would destroy trust in the whole
 * screen on first sight.
 *
 * Comparison is by normalised keyword rather than exact string, because "bag",
 * "per 50kg bag" and "bags" are the same unit written three ways. When the
 * units genuinely differ the variance is withheld, not guessed at: converting
 * bundles to kilos needs a weight this app does not hold.
 */
const UNIT_ALIASES = [
    ["bag", ["bag", "bags", "sack"]],
    ["kg", ["kg", "kgs", "kilogram"]],
    ["ton", ["ton", "tonne", "mt", "quintal"]],
    ["piece", ["pc", "pcs", "piece", "nos", "no.", "unit"]],
    ["litre", ["litre", "liter", "ltr", "l"]],
    ["sqft", ["sqft", "sq ft", "square feet", "sft"]],
    ["cft", ["cft", "cu ft", "cubic feet"]],
    ["bundle", ["bundle", "coil", "roll"]],
    ["load", ["load", "trip", "tractor", "lorry"]],
];

function normaliseUnit(u) {
    let s = String(u || "").toLowerCase().replace(/[^a-z0-9 .]/g, " ").trim();
    if (!s) return null;

    // Market prices are written "per 50kg bag"; bill lines say "bag". Strip the
    // leading "per" and any pack qualifier so the two forms of the same unit
    // compare equal — otherwise the guard above rejects every real comparison
    // and the feature silently reports nothing at all, which is a quieter way
    // of being broken than showing a wrong number but broken all the same.
    s = s.replace(/^per\s+/, "");
    s = s.replace(/\b\d+\s*(kg|g|ml|l|ltr|litre|mm|cm|ft|inch)\b/g, " ");
    s = s.replace(/\s+/g, " ").trim();
    if (!s) return null;
    for (const [canonical, words] of UNIT_ALIASES) {
        for (const w of words) {
            // Word-boundary match, so "l" does not match inside "load".
            if (new RegExp(`(^|[^a-z])${w.replace(".", "\\.")}([^a-z]|$)`).test(s)) {
                return canonical;
            }
        }
    }
    return s;
}

function unitsComparable(a, b) {
    const x = normaliseUnit(a);
    const y = normaliseUnit(b);
    if (!x || !y) return false;
    return x === y;
}

/**
 * GET /api/materials/intelligence?days=90
 *
 * Per material: the market price and its movement, what this builder pays, the
 * gap between them, and what the movement is worth at their consumption.
 */
exports.intelligence = async (req, res) => {
    try {
        const days = Math.min(Math.max(parseInt(req.query.days, 10) || 90, 7), 365);
        const since = new Date(Date.now() - days * 864e5);

        const userId = callerId(req);
        const filter = await visibleProjectFilter(userId, req.user);
        const projects = await Project.find(filter).select("_id").lean();
        const ids = projects.map((p) => p._id);

        const [points, bills] = await Promise.all([
            PriceTrend.find({ recorded_at: { $gte: since } })
                .sort({ material: 1, recorded_at: 1 })
                .lean(),
            ids.length
                ? LedgerEntry.find({
                      project_id: { $in: ids },
                      is_delete: 0,
                      direction: "out",
                      category: "material_bill",
                      status: { $in: ["pending", "settled"] },
                      occurred_on: { $gte: since },
                  })
                      .select("line_items occurred_on")
                      .lean()
                : [],
        ]);

        // ── What the market did ────────────────────────────────────────────
        const byMaterial = new Map();
        for (const p of points) {
            const arr = byMaterial.get(p.material) || [];
            arr.push(p);
            byMaterial.set(p.material, arr);
        }

        // ── What this builder actually paid ────────────────────────────────
        //
        // Weighted by quantity, not a mean of the rates. Averaging rates treats
        // a 5-bag top-up and a 500-bag delivery as equally informative, which is
        // how a builder's "average" ends up nothing like what they really pay.
        const mine = new Map();
        let unmatchedLines = 0;
        for (const b of bills) {
            for (const li of b.line_items || []) {
                const material = classify(li.name);
                if (!material) { unmatchedLines++; continue; }
                const qty = Number(li.qty) || 0;
                const amountPaise = li.amount_paise || 0;
                if (qty <= 0 || amountPaise <= 0) continue;

                const cur = mine.get(material) || { qty: 0, paise: 0, unit: li.unit || "", lines: 0 };
                cur.qty += qty;
                cur.paise += amountPaise;
                cur.lines++;
                if (!cur.unit && li.unit) cur.unit = li.unit;
                mine.set(material, cur);
            }
        }

        const materials = [];
        const names = new Set([...byMaterial.keys(), ...mine.keys()]);

        for (const material of names) {
            const series = byMaterial.get(material) || [];
            const latest = series.length ? series[series.length - 1] : null;
            const earliest = series.length ? series[0] : null;

            const marketPaise = latest ? money.toPaise(latest.price) : null;
            const changePct = latest && earliest && series.length > 1
                ? pct(earliest.price, latest.price)
                : null;

            const own = mine.get(material);
            // Rounded once, at the end — the running total is exact paise.
            const myRatePaise = own && own.qty > 0
                ? Math.round(own.paise / own.qty)
                : null;

            // Both sides must exist AND be measured in the same unit. See
            // unitsComparable: without that check, ₹4,150 per bundle against
            // ₹52 per kg reported the builder as 7882% over market.
            const comparable =
                myRatePaise !== null &&
                marketPaise &&
                unitsComparable(own?.unit, latest?.unit);

            const variancePct = comparable
                ? Math.round(((myRatePaise - marketPaise) / marketPaise) * 1000) / 10
                : null;

            // What the market move costs at THIS builder's consumption over the
            // window. The number that turns a percentage into a decision.
            // Priced at the builder's own rate, since that is what they will
            // actually pay, and only when the units line up.
            const exposurePaise =
                changePct !== null && comparable && own.qty > 0
                    ? Math.round(own.qty * myRatePaise * (changePct / 100))
                    : null;

            materials.push({
                material,
                unit: latest?.unit || own?.unit || "",
                market: marketPaise === null ? null : money.toRupees(marketPaise),
                market_paise: marketPaise,
                market_recorded_at: latest?.recorded_at || null,
                change_pct: changePct,
                my_rate: myRatePaise === null ? null : money.toRupees(myRatePaise),
                my_rate_paise: myRatePaise,
                my_qty: own ? own.qty : 0,
                my_spend: own ? money.toRupees(own.paise) : 0,
                my_spend_paise: own ? own.paise : 0,
                bill_lines: own ? own.lines : 0,
                variance_pct: variancePct,
                exposure: exposurePaise === null ? null : money.toRupees(exposurePaise),
                exposure_paise: exposurePaise,
                // Said explicitly so the app never has to guess why a field is
                // null, and never fills the gap with the market rate.
                my_unit: own?.unit || "",
                note: myRatePaise === null
                    ? "No itemised purchases in this window"
                    : marketPaise === null
                        ? "No market price tracked for this material"
                        : !comparable
                            // Named plainly. "We can't compare these" is a
                            // useful thing to be told; a fabricated percentage
                            // is not.
                            ? `Priced per ${own?.unit || "unit"} against a market rate ${latest?.unit || ""} — not comparable`
                            : "",
            });
        }

        // Worst first: the biggest overpayment at the top, since that is the
        // one worth acting on. Materials with no comparison sink below those
        // that have one rather than being scattered through the list.
        materials.sort((a, b) => {
            if (a.variance_pct === null && b.variance_pct === null) return 0;
            if (a.variance_pct === null) return 1;
            if (b.variance_pct === null) return -1;
            return b.variance_pct - a.variance_pct;
        });

        const overpaying = materials.filter(
            (m) => m.variance_pct !== null && m.variance_pct > 5);

        return ok(res, {
            days,
            materials,
            // The headline: where this builder is paying over the odds.
            overpaying: overpaying.map((m) => ({
                material: m.material,
                variance_pct: m.variance_pct,
                my_rate: m.my_rate,
                market: m.market,
            })),
            unmatched_lines: unmatchedLines,
            tracked: [...byMaterial.keys()],
        });
    } catch (err) {
        console.error("materials intelligence error:", err);
        return fail(res, 500, "Server error");
    }
};
