const PriceTrend = require("../Model/PriceTrend");
const Product = require("../Model/Product");

const ok = (res, data) => res.status(200).json({ success: true, data });
const fail = (res, s, message) => res.status(s).json({ success: false, message });

/**
 * Materials & rates — the reference desk.
 *
 * This replaces the seller marketplace. Content is admin-published, common to
 * every builder, and read-only: nobody buys in-app, they buy from their own
 * WhatsApp suppliers. Its job is to answer "am I being overcharged?", which is
 * the one thing a builder cannot easily get elsewhere.
 *
 * A rate is only ever returned WITH the date it was recorded. An undated price
 * in this trade is a liability — cement and steel move weekly, and a builder
 * who quotes off a stale number loses money and blames us. Where there is no
 * recent rate we return none rather than an old one.
 */

/// Beyond this, a rate is too old to show as "current".
const STALE_AFTER_DAYS = 45;

function shapeRate(doc) {
    if (!doc) return null;
    const ageDays = Math.floor((Date.now() - new Date(doc.recorded_at).getTime()) / 86400000);
    return {
        material: doc.material,
        price: doc.price,
        unit: doc.unit,
        region: doc.region || "national",
        recorded_at: doc.recorded_at,
        age_days: ageDays,
        // The client shows this verbatim — never render a bare number.
        as_of: new Date(doc.recorded_at).toLocaleDateString("en-IN", {
            day: "numeric", month: "short", year: "numeric",
        }),
        source: doc.source || "admin",
    };
}

/**
 * GET /api/materials/rates?region=
 * Latest price per material, plus a 30-day-ago comparison so the direction of
 * travel is visible. Materials with no fresh rate are omitted entirely.
 */
exports.rates = async (req, res) => {
    try {
        const region = req.query.region || "national";
        const cutoff = new Date(Date.now() - STALE_AFTER_DAYS * 86400000);

        const latest = await PriceTrend.aggregate([
            { $match: { region, recorded_at: { $gte: cutoff } } },
            { $sort: { recorded_at: -1 } },
            { $group: { _id: "$material", doc: { $first: "$$ROOT" } } },
            { $replaceRoot: { newRoot: "$doc" } },
        ]);

        // Previous point ~30 days back, for the trend arrow.
        const monthAgo = new Date(Date.now() - 30 * 86400000);
        const previous = await PriceTrend.aggregate([
            { $match: { region, recorded_at: { $lte: monthAgo } } },
            { $sort: { recorded_at: -1 } },
            { $group: { _id: "$material", doc: { $first: "$$ROOT" } } },
            { $replaceRoot: { newRoot: "$doc" } },
        ]);
        const prevByMaterial = Object.fromEntries(
            previous.map((p) => [p.material, p.price])
        );

        const items = latest.map((d) => {
            const shaped = shapeRate(d);
            const before = prevByMaterial[d.material];
            if (before && before > 0) {
                shaped.change_pct = Math.round(((d.price - before) / before) * 1000) / 10;
            } else {
                // No comparison point — say nothing rather than imply "flat".
                shaped.change_pct = null;
            }
            return shaped;
        });

        return ok(res, { region, stale_after_days: STALE_AFTER_DAYS, items });
    } catch (err) {
        console.error("materials.rates error:", err);
        return fail(res, 500, "Server error");
    }
};

/**
 * GET /api/materials/products?material=&limit=
 * Admin-published catalogue. Sponsored items float to the top but are flagged
 * so the client can label them — an unlabelled paid placement is deceptive.
 */
exports.products = async (req, res) => {
    try {
        const q = { is_published: true, is_delete: { $ne: 1 } };
        if (req.query.material) q.material_key = req.query.material;

        const now = new Date();
        const items = await Product.find(q)
            .sort({ sponsored: -1, createdAt: -1 })
            .limit(Math.min(Number(req.query.limit) || 40, 100))
            .lean();

        // An expired sponsorship stops being paid placement immediately.
        const shaped = items.map((p) => {
            const live = p.sponsored && (!p.sponsor_until || new Date(p.sponsor_until) > now);
            return { ...p, sponsored: live, sponsor_name: live ? p.sponsor_name : "" };
        });
        shaped.sort((a, b) => (b.sponsored ? 1 : 0) - (a.sponsored ? 1 : 0));

        return ok(res, shaped);
    } catch (err) {
        console.error("materials.products error:", err);
        return fail(res, 500, "Server error");
    }
};

/**
 * GET /api/materials/benchmark?material=&region=
 *
 * The contextual hook: what a material should cost, for showing beside a BOQ
 * line or next to a supplier's quote. Returns null rather than a guess when
 * there is no fresh data.
 */
exports.benchmark = async (req, res) => {
    try {
        const { material } = req.query;
        if (!material) return fail(res, 400, "material is required");

        const cutoff = new Date(Date.now() - STALE_AFTER_DAYS * 86400000);
        const doc = await PriceTrend.findOne({
            material,
            region: req.query.region || "national",
            recorded_at: { $gte: cutoff },
        }).sort({ recorded_at: -1 }).lean();

        return ok(res, { material, rate: shapeRate(doc) });
    } catch (err) {
        console.error("materials.benchmark error:", err);
        return fail(res, 500, "Server error");
    }
};
