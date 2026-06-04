const RFQ    = require("../Model/RFQ");
const BOQ    = require("../Model/BOQ");
const Seller = require("../Model/Seller");
const { sendToMany } = require('../Utils/fcm');

// Haversine distance in km between two lat/lng points
function haversineKm(lat1, lng1, lat2, lng2) {
    const R   = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a   = Math.sin(dLat / 2) ** 2
              + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Fire-and-forget: push FCM alerts to sellers near the RFQ delivery point
async function notifyNearbySellers(rfq) {
    try {
        const sellers = await Seller.find(
            { is_delete: { $ne: 1 }, fcm_token: { $exists: true, $nin: [null, '', 'user_logged_out'] } },
            'fcm_token latitude longitude pincode'
        ).lean();

        const DEFAULT_RADIUS_KM = 150;
        const nearby = sellers.filter(s => {
            if (rfq.lat && rfq.lat !== 0) {
                const sLat = parseFloat(s.latitude);
                const sLng = parseFloat(s.longitude);
                if (!isNaN(sLat) && sLat !== 0) {
                    return haversineKm(rfq.lat, rfq.lng, sLat, sLng) <= DEFAULT_RADIUS_KM;
                }
            }
            // Pincode-district fallback: first 3 digits = same district
            if (rfq.delivery_pincode && s.pincode) {
                return rfq.delivery_pincode.slice(0, 3) === s.pincode.slice(0, 3);
            }
            return true; // no location on either side → notify all
        });

        const tokens = nearby.map(s => s.fcm_token);
        if (!tokens.length) return;

        await sendToMany(
            tokens,
            '🆕 New Lead Near You',
            `${rfq.material_name} needed in ${rfq.delivery_location}. Tap to quote.`,
            { rfq_id: String(rfq._id), rfq_number: rfq.rfq_number || '', type: 'new_rfq' }
        );
    } catch (e) {
        console.error('[RFQ] notifyNearbySellers error (non-fatal):', e.message);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// BUYER / BUILDER / MASON — Create & Manage RFQs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/rfq
 * Create a new RFQ.
 */
exports.createRFQ = async (req, res) => {
    try {
        const {
            material_name, category, quantity, unit, specifications,
            brand_preference, delivery_location, delivery_pincode,
            required_by, budget_min, budget_max, lat, lng,
            boq_id, boq_item_name,
        } = req.body;

        if (!material_name || !quantity || !unit || !delivery_location) {
            return res.status(400).json({
                status: 400,
                message: "material_name, quantity, unit and delivery_location are required",
                error: true,
            });
        }

        const ownerModel = req.user.isUser ? "user" : req.user.isMasonry ? "masonry" : "builder";

        const rfq = await RFQ.create({
            owner: req.user.id,
            ownerModel,
            material_name, category, quantity, unit,
            specifications:   specifications   || "",
            brand_preference: brand_preference || "",
            delivery_location, delivery_pincode: delivery_pincode || "",
            required_by: required_by ? new Date(required_by) : undefined,
            budget_min: budget_min || 0,
            budget_max: budget_max || 0,
            lat: lat || 0,
            lng: lng || 0,
            boq_id:       boq_id        || null,
            boq_item_name: boq_item_name || "",
        });

        // Notify nearby sellers — fire and forget, never blocks the response
        notifyNearbySellers(rfq).catch(() => {});

        res.status(201).json({ status: 201, message: "RFQ created successfully", data: rfq });
    } catch (err) {
        res.status(500).json({ status: 500, message: err.message, error: true });
    }
};

/**
 * POST /api/rfq/from-boq/:boqId
 * Generate one RFQ per material category from a saved BOQ.
 * Groups items by category so sellers receive category-level RFQs.
 */
exports.createFromBOQ = async (req, res) => {
    try {
        const { delivery_location, delivery_pincode, required_by, lat, lng } = req.body;
        if (!delivery_location) {
            return res.status(400).json({ status: 400, message: "delivery_location required", error: true });
        }

        const boq = await BOQ.findById(req.params.boqId);
        if (!boq) return res.status(404).json({ status: 404, message: "BOQ not found", error: true });

        const ownerModel = req.user.isUser ? "user" : req.user.isMasonry ? "masonry" : "builder";

        // Group BOQ items by category
        const groups = {};
        for (const item of boq.items) {
            if (!groups[item.category]) groups[item.category] = [];
            groups[item.category].push(item);
        }

        const created = [];
        for (const [category, items] of Object.entries(groups)) {
            // Build a description from item names + quantities
            const desc = items.map(i => `${i.material}: ${i.quantity} ${i.unit}`).join("; ");
            const totalBudget = items.reduce((s, i) => s + i.total, 0);

            // One RFQ per category, primary material = first item
            const rfq = await RFQ.create({
                owner: req.user.id,
                ownerModel,
                material_name:  `${category} — BOQ Bundle`,
                category,
                quantity:       1,
                unit:           "Bundle",
                specifications: desc,
                delivery_location, delivery_pincode: delivery_pincode || "",
                required_by: required_by ? new Date(required_by) : undefined,
                budget_max:  totalBudget,
                lat: lat || 0,
                lng: lng || 0,
                boq_id:       boq._id,
                boq_item_name: category,
            });
            created.push(rfq);
        }

        // Mark BOQ as having an RFQ generated
        await BOQ.findByIdAndUpdate(req.params.boqId, { rfq_generated: true });

        res.status(201).json({
            status: 201,
            message: `${created.length} RFQs generated from BOQ`,
            data: created,
        });
    } catch (err) {
        res.status(500).json({ status: 500, message: err.message, error: true });
    }
};

/**
 * GET /api/rfq/my
 * Get all RFQs created by the authenticated user (buyer / builder / mason).
 */
exports.myRFQs = async (req, res) => {
    try {
        const ownerModel = req.user.isUser ? "user" : req.user.isMasonry ? "masonry" : "builder";
        const rfqs = await RFQ.find({ owner: req.user.id, ownerModel, is_delete: 0 })
            .sort({ createdAt: -1 })
            .populate("quotes.seller", "shop_name name phone city");
        res.json({ status: 200, message: "success", data: rfqs });
    } catch (err) {
        res.status(500).json({ status: 500, message: err.message, error: true });
    }
};

/**
 * GET /api/rfq/:id
 * Get a single RFQ with all quotes.
 */
exports.getRFQ = async (req, res) => {
    try {
        const rfq = await RFQ.findOne({ _id: req.params.id, is_delete: 0 })
            .populate("quotes.seller", "shop_name name phone city profile_image");
        if (!rfq) return res.status(404).json({ status: 404, message: "RFQ not found", error: true });
        res.json({ status: 200, message: "success", data: rfq });
    } catch (err) {
        res.status(500).json({ status: 500, message: err.message, error: true });
    }
};

/**
 * PATCH /api/rfq/:id/cancel
 * Cancel an open RFQ.
 */
exports.cancelRFQ = async (req, res) => {
    try {
        const rfq = await RFQ.findOneAndUpdate(
            { _id: req.params.id, owner: req.user.id },
            { status: "cancelled" },
            { new: true }
        );
        if (!rfq) return res.status(404).json({ status: 404, message: "RFQ not found", error: true });
        res.json({ status: 200, message: "RFQ cancelled", data: rfq });
    } catch (err) {
        res.status(500).json({ status: 500, message: err.message, error: true });
    }
};

/**
 * PATCH /api/rfq/:rfqId/accept/:quoteId
 * Buyer accepts a specific seller's quote.
 * Sets accepted_quote, marks RFQ as accepted, rejects other quotes.
 */
exports.acceptQuote = async (req, res) => {
    try {
        const rfq = await RFQ.findOne({ _id: req.params.rfqId, owner: req.user.id, is_delete: 0 });
        if (!rfq) return res.status(404).json({ status: 404, message: "RFQ not found", error: true });

        const quote = rfq.quotes.id(req.params.quoteId);
        if (!quote) return res.status(404).json({ status: 404, message: "Quote not found", error: true });

        // Accept this quote, reject others
        rfq.quotes.forEach(q => {
            q.status = q._id.toString() === req.params.quoteId ? "accepted" : "rejected";
        });
        rfq.status         = "accepted";
        rfq.accepted_quote = quote._id;
        await rfq.save();

        res.json({ status: 200, message: "Quote accepted", data: rfq });
    } catch (err) {
        res.status(500).json({ status: 500, message: err.message, error: true });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// SELLER — View & Quote on Open RFQs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/rfq/open
 * Geo-matched seller lead feed.
 * - If seller has lat/lng: RFQs within radius_km (default 150) shown first, sorted by distance.
 * - If seller has pincode only: same-district (first-3-digit prefix) RFQs shown first.
 * - National RFQs (no location on either side) always included at the end.
 * ?category=Structural&radius_km=200&page=1&limit=20
 */
exports.openRFQs = async (req, res) => {
    try {
        const { category, page = 1, limit = 20, radius_km = 150 } = req.query;
        const maxRadius = Math.min(Number(radius_km), 500); // cap at 500 km

        // Load seller's location profile
        const seller = await Seller.findById(req.user.id)
            .select('latitude longitude pincode')
            .lean();

        const sellerLat = parseFloat(seller?.latitude);
        const sellerLng = parseFloat(seller?.longitude);
        const hasGeo    = !isNaN(sellerLat) && sellerLat !== 0 && !isNaN(sellerLng);
        const sellerPin = seller?.pincode || '';

        const filter = { status: { $in: ['open', 'quoted'] }, is_delete: 0 };
        if (category) filter.category = { $regex: category, $options: 'i' };

        const allRFQs = await RFQ.find(filter)
            .sort({ createdAt: -1 })
            .select('-quotes')
            .lean();

        // Annotate each RFQ with distance / match type
        const MATCH_RANK = { exact_pincode: 0, nearby: 1, nearby_district: 2, national: 3 };

        for (const rfq of allRFQs) {
            const rfqLat = rfq.lat;
            const rfqLng = rfq.lng;
            const rfqPin = rfq.delivery_pincode || '';

            if (hasGeo && rfqLat && rfqLat !== 0) {
                const dist = haversineKm(sellerLat, sellerLng, rfqLat, rfqLng);
                rfq.distance_km  = Math.round(dist);
                rfq.match_type   = dist <= maxRadius ? 'nearby' : 'national';
            } else if (sellerPin && rfqPin) {
                if (rfqPin === sellerPin) {
                    rfq.distance_km = null;
                    rfq.match_type  = 'exact_pincode';
                } else if (rfqPin.slice(0, 3) === sellerPin.slice(0, 3)) {
                    rfq.distance_km = null;
                    rfq.match_type  = 'nearby_district';
                } else {
                    rfq.match_type = 'national';
                }
            } else {
                rfq.match_type = 'national';
            }
        }

        // Sort: nearest / best match first; within same tier, newest first
        allRFQs.sort((a, b) => {
            const rankDiff = MATCH_RANK[a.match_type] - MATCH_RANK[b.match_type];
            if (rankDiff !== 0) return rankDiff;
            if (a.distance_km != null && b.distance_km != null) return a.distance_km - b.distance_km;
            return new Date(b.createdAt) - new Date(a.createdAt);
        });

        const start     = (page - 1) * limit;
        const paginated = allRFQs.slice(start, start + Number(limit));
        const nearbyCount = allRFQs.filter(r => r.match_type !== 'national').length;

        res.json({
            status: 200,
            message: 'success',
            data: paginated,
            total: allRFQs.length,
            nearby_count: nearbyCount,
            page: Number(page),
            geo_matched: hasGeo || !!sellerPin,
        });
    } catch (err) {
        res.status(500).json({ status: 500, message: err.message, error: true });
    }
};

/**
 * POST /api/rfq/:id/quote
 * Seller submits a quotation for an open RFQ.
 */
exports.submitQuote = async (req, res) => {
    try {
        const { unit_price, delivery_days, validity_days, brand, note } = req.body;
        if (!unit_price) {
            return res.status(400).json({ status: 400, message: "unit_price is required", error: true });
        }

        const rfq = await RFQ.findOne({ _id: req.params.id, status: "open", is_delete: 0 });
        if (!rfq) return res.status(404).json({ status: 404, message: "RFQ not found or already closed", error: true });

        // Check if seller already quoted
        const already = rfq.quotes.find(q => q.seller.toString() === req.user.id);
        if (already) {
            return res.status(409).json({ status: 409, message: "You have already quoted for this RFQ", error: true });
        }

        const total_price = rfq.quantity * unit_price;

        rfq.quotes.push({
            seller:       req.user.id,
            unit_price,
            total_price,
            delivery_days: delivery_days || 7,
            validity_days: validity_days || 3,
            brand:         brand || "",
            note:          note  || "",
        });

        if (rfq.status === "open") rfq.status = "quoted";
        await rfq.save();

        res.status(201).json({ status: 201, message: "Quotation submitted successfully", data: rfq });
    } catch (err) {
        res.status(500).json({ status: 500, message: err.message, error: true });
    }
};

/**
 * GET /api/rfq/seller/my-quotes
 * Seller sees all RFQs they have quoted on.
 */
exports.sellerQuotes = async (req, res) => {
    try {
        const rfqs = await RFQ.find({ "quotes.seller": req.user.id, is_delete: 0 })
            .sort({ updatedAt: -1 });
        res.json({ status: 200, message: "success", data: rfqs });
    } catch (err) {
        res.status(500).json({ status: 500, message: err.message, error: true });
    }
};
