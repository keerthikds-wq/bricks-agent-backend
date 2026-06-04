const BOQ        = require("../Model/BOQ");
const cloudinary = require("cloudinary").v2;
const { sendWhatsAppOtp } = require('../Utils/whatsapp'); // reuse WhatsApp sender

// ─────────────────────────────────────────────────────────────────────────────
// INDIAN CONSTRUCTION THUMB RULES
// Based on standard PWD / CPWD estimates, IS codes, and market practice.
// Quantities are per SQFT of total built-up area.
// ─────────────────────────────────────────────────────────────────────────────

const THUMB_RULES_PER_SQFT = {
    // qty per sqft (economy | standard | premium)
    structural: [
        {
            material: "OPC Cement 53 Grade",
            category: "Structural",
            unit: "Bags (50 kg)",
            qty: { economy: 0.38, standard: 0.44, premium: 0.52 },
            rate: { economy: 390, standard: 410, premium: 430 },  // ₹ per bag
            note: "Includes foundation, columns, beams, slab, plastering",
        },
        {
            material: "TMT Steel Bars Fe-500D",
            category: "Structural",
            unit: "kg",
            qty: { economy: 3.8, standard: 4.5, premium: 5.5 },
            rate: { economy: 65, standard: 70, premium: 75 },
            note: "Includes all RCC members — foundation to roof slab",
        },
        {
            material: "River Sand (Fine Aggregate)",
            category: "Structural",
            unit: "CFT",
            qty: { economy: 1.4, standard: 1.7, premium: 2.0 },
            rate: { economy: 48, standard: 52, premium: 55 },
            note: "For concrete, mortar and plastering",
        },
        {
            material: "M-Sand (Manufactured Sand)",
            category: "Structural",
            unit: "CFT",
            qty: { economy: 0.6, standard: 0.8, premium: 1.0 },
            rate: { economy: 38, standard: 42, premium: 45 },
            note: "Used in plastering and masonry mortar",
        },
        {
            material: "Coarse Aggregate 20mm (Jelly)",
            category: "Structural",
            unit: "CFT",
            qty: { economy: 2.2, standard: 2.6, premium: 3.0 },
            rate: { economy: 45, standard: 50, premium: 55 },
            note: "For all RCC concrete work",
        },
        {
            material: "Red Clay Bricks (Modular)",
            category: "Structural",
            unit: "Nos",
            qty: { economy: 7.5, standard: 8.5, premium: 9.5 },
            rate: { economy: 9, standard: 11, premium: 13 },
            note: "For wall masonry — 9\" and 4.5\" thick walls",
        },
        {
            material: "Binding Wire (18-gauge)",
            category: "Structural",
            unit: "kg",
            qty: { economy: 0.06, standard: 0.08, premium: 0.10 },
            rate: { economy: 85, standard: 90, premium: 95 },
            note: "For tying steel rebar",
        },
        {
            material: "Nails & Screws (assorted)",
            category: "Structural",
            unit: "kg",
            qty: { economy: 0.03, standard: 0.04, premium: 0.06 },
            rate: { economy: 110, standard: 120, premium: 130 },
            note: "For shuttering and carpentry work",
        },
    ],
    finishing: [
        {
            material: "Ceramic Floor Tiles",
            category: "Finishing & Flooring",
            unit: "Sqft",
            qty: { economy: 1.10, standard: 1.15, premium: 1.20 },
            rate: { economy: 40, standard: 60, premium: 95 },
            note: "Includes 10–20% wastage for cutting",
        },
        {
            material: "Wall Tiles (Bathroom & Kitchen)",
            category: "Finishing & Flooring",
            unit: "Sqft",
            qty: { economy: 0.28, standard: 0.35, premium: 0.45 },
            rate: { economy: 50, standard: 70, premium: 110 },
            note: "Approx 30–45% of wall area in wet areas",
        },
        {
            material: "Tile Adhesive / White Cement",
            category: "Finishing & Flooring",
            unit: "Bags (20 kg)",
            qty: { economy: 0.04, standard: 0.05, premium: 0.06 },
            rate: { economy: 240, standard: 270, premium: 300 },
            note: "For fixing tiles (coverage ~40 sqft per bag)",
        },
        {
            material: "Gypsum Plaster / POP",
            category: "Finishing & Flooring",
            unit: "kg",
            qty: { economy: 0.8, standard: 1.1, premium: 1.5 },
            rate: { economy: 12, standard: 14, premium: 16 },
            note: "Ceiling and wall putty base coat",
        },
        {
            material: "Interior Emulsion Paint",
            category: "Finishing & Flooring",
            unit: "Litres",
            qty: { economy: 0.28, standard: 0.35, premium: 0.45 },
            rate: { economy: 260, standard: 340, premium: 480 },
            note: "Two coats on plastered surface; includes primer",
        },
        {
            material: "Exterior Weather-Proof Paint",
            category: "Finishing & Flooring",
            unit: "Litres",
            qty: { economy: 0.10, standard: 0.14, premium: 0.18 },
            rate: { economy: 300, standard: 400, premium: 560 },
            note: "Two coats — outer facade only",
        },
        {
            material: "Wall Putty",
            category: "Finishing & Flooring",
            unit: "kg",
            qty: { economy: 0.5, standard: 0.7, premium: 0.9 },
            rate: { economy: 22, standard: 26, premium: 30 },
            note: "Surface finishing before paint",
        },
    ],
    plumbing: [
        {
            material: "CPVC Pipe & Fittings (hot/cold supply)",
            category: "Plumbing & Electrical",
            unit: "Metres",
            qty: { economy: 0.9, standard: 1.2, premium: 1.6 },
            rate: { economy: 110, standard: 140, premium: 180 },
            note: "Water supply lines — bathrooms + kitchen",
        },
        {
            material: "PVC Drainage Pipe & Fittings",
            category: "Plumbing & Electrical",
            unit: "Metres",
            qty: { economy: 0.7, standard: 1.0, premium: 1.3 },
            rate: { economy: 75, standard: 95, premium: 120 },
            note: "Sewage and drainage lines",
        },
        {
            material: "Water Tank (Sintex / HDPE)",
            category: "Plumbing & Electrical",
            unit: "Litres",
            qty: { economy: 0.8, standard: 1.0, premium: 1.2 },
            rate: { economy: 4.5, standard: 5.5, premium: 7.0 },
            note: "Overhead + sump capacity based on floor area",
        },
        {
            material: "Electrical Wire (Copper, FR-LSH)",
            category: "Plumbing & Electrical",
            unit: "Metres",
            qty: { economy: 3.5, standard: 4.5, premium: 6.0 },
            rate: { economy: 35, standard: 42, premium: 55 },
            note: "1.5mm² + 2.5mm² combined — all rooms",
        },
        {
            material: "Conduit Pipe (PVC)",
            category: "Plumbing & Electrical",
            unit: "Metres",
            qty: { economy: 2.0, standard: 2.5, premium: 3.2 },
            rate: { economy: 18, standard: 22, premium: 28 },
            note: "Surface / concealed electrical conduit",
        },
        {
            material: "MCB & Distribution Board",
            category: "Plumbing & Electrical",
            unit: "Nos",
            qty: { economy: 0.004, standard: 0.005, premium: 0.007 },
            rate: { economy: 3200, standard: 4500, premium: 7000 },
            note: "One DB per floor typically; MCBs included",
        },
        {
            material: "Switch Sockets & Modular Plates",
            category: "Plumbing & Electrical",
            unit: "Nos",
            qty: { economy: 0.05, standard: 0.07, premium: 0.10 },
            rate: { economy: 200, standard: 350, premium: 700 },
            note: "All switch boards across rooms",
        },
    ],
    doors_windows: [
        {
            material: "Main Door (Teak / Steel)",
            category: "Doors, Windows & Wood",
            unit: "Nos",
            qty: { economy: 0.001, standard: 0.0012, premium: 0.0015 },
            rate: { economy: 22000, standard: 35000, premium: 65000 },
            note: "One main door per dwelling unit",
        },
        {
            material: "Internal Doors (Flush / HDF)",
            category: "Doors, Windows & Wood",
            unit: "Nos",
            qty: { economy: 0.007, standard: 0.009, premium: 0.011 },
            rate: { economy: 7000, standard: 11000, premium: 18000 },
            note: "Bedroom, bathroom, kitchen doors",
        },
        {
            material: "UPVC Windows with Glass",
            category: "Doors, Windows & Wood",
            unit: "Sqft",
            qty: { economy: 0.08, standard: 0.10, premium: 0.14 },
            rate: { economy: 380, standard: 480, premium: 650 },
            note: "Includes sliding / casement windows",
        },
        {
            material: "Plywood (18mm, BWR Grade)",
            category: "Doors, Windows & Wood",
            unit: "Sheets (8×4 ft)",
            qty: { economy: 0.003, standard: 0.005, premium: 0.008 },
            rate: { economy: 1600, standard: 2200, premium: 3200 },
            note: "Formwork shuttering, door frames, misc carpentry",
        },
    ],
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPER — run the calculation
// ─────────────────────────────────────────────────────────────────────────────
function calculateBOQ({ area_sqft, floors = 1, construction_type = "standard", structure_type = "rcc" }) {
    const totalArea = area_sqft * floors;
    const ct = construction_type;
    const items = [];

    const allGroups = [
        ...THUMB_RULES_PER_SQFT.structural,
        ...THUMB_RULES_PER_SQFT.finishing,
        ...THUMB_RULES_PER_SQFT.plumbing,
        ...THUMB_RULES_PER_SQFT.doors_windows,
    ];

    // If load-bearing structure, skip steel and use more bricks
    const skipMaterials = structure_type === "load_bearing" ? ["TMT Steel Bars Fe-500D"] : [];

    for (const rule of allGroups) {
        if (skipMaterials.includes(rule.material)) continue;

        let qty  = rule.qty[ct]  * totalArea;
        let rate = rule.rate[ct];

        // Load bearing: +20% bricks, −15% cement
        if (structure_type === "load_bearing") {
            if (rule.material.includes("Brick"))  qty *= 1.20;
            if (rule.material.includes("Cement")) qty *= 0.85;
        }

        // Round quantities sensibly
        qty = Math.ceil(qty * 100) / 100;
        const total = Math.round(qty * rate);

        items.push({
            material: rule.material,
            category: rule.category,
            quantity: qty,
            unit:     rule.unit,
            rate,
            total,
            note:     rule.note,
        });
    }

    const grand_total   = items.reduce((s, i) => s + i.total, 0);
    const contingency   = Math.round(grand_total * 0.05);
    const final_estimate = grand_total + contingency;

    return { items, grand_total, contingency_pct: 5, final_estimate };
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTROLLERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/boq/calculate
 * Stateless — returns the BOQ without saving.
 */
exports.calculateBOQ = async (req, res) => {
    try {
        const { area_sqft, floors, construction_type, structure_type } = req.body;
        if (!area_sqft || area_sqft < 100) {
            return res.status(400).json({ status: 400, message: "area_sqft must be at least 100", error: true });
        }
        const result = calculateBOQ({ area_sqft, floors, construction_type, structure_type });
        res.json({ status: 200, message: "BOQ calculated", data: result });
    } catch (err) {
        res.status(500).json({ status: 500, message: err.message, error: true });
    }
};

/**
 * POST /api/boq/save
 * Calculates and persists a BOQ to the database.
 */
exports.saveBOQ = async (req, res) => {
    try {
        const { area_sqft, floors, construction_type, structure_type, project_name, location } = req.body;
        if (!area_sqft || area_sqft < 100) {
            return res.status(400).json({ status: 400, message: "area_sqft must be at least 100", error: true });
        }

        const { items, grand_total, contingency_pct, final_estimate } = calculateBOQ({
            area_sqft, floors, construction_type, structure_type,
        });

        // Determine owner model from JWT
        const ownerModel = req.user.isUser ? "user" : req.user.isMasonry ? "masonry" : "builder";

        const boq = await BOQ.create({
            owner:       req.user.id,
            ownerModel,
            project_name: project_name || "My Project",
            location:    location || "",
            area_sqft,
            floors:      floors || 1,
            construction_type: construction_type || "standard",
            structure_type:    structure_type || "rcc",
            items,
            grand_total,
            contingency_pct,
            final_estimate,
        });

        res.status(201).json({ status: 201, message: "BOQ saved", data: boq });
    } catch (err) {
        res.status(500).json({ status: 500, message: err.message, error: true });
    }
};

/**
 * GET /api/boq/my
 * List all BOQs for the authenticated user.
 */
exports.myBOQs = async (req, res) => {
    try {
        const ownerModel = req.user.isUser ? "user" : req.user.isMasonry ? "masonry" : "builder";
        const boqs = await BOQ.find({ owner: req.user.id, ownerModel, is_delete: 0 })
            .sort({ createdAt: -1 })
            .select("-items"); // omit heavy items array in list view
        res.json({ status: 200, message: "success", data: boqs });
    } catch (err) {
        res.status(500).json({ status: 500, message: err.message, error: true });
    }
};

/**
 * GET /api/boq/:id
 * Get a single BOQ with all items.
 */
exports.getBOQ = async (req, res) => {
    try {
        const boq = await BOQ.findOne({ _id: req.params.id, is_delete: 0 });
        if (!boq) return res.status(404).json({ status: 404, message: "BOQ not found", error: true });
        res.json({ status: 200, message: "success", data: boq });
    } catch (err) {
        res.status(500).json({ status: 500, message: err.message, error: true });
    }
};

/**
 * DELETE /api/boq/:id
 * Soft-delete a BOQ.
 */
exports.deleteBOQ = async (req, res) => {
    try {
        await BOQ.findByIdAndUpdate(req.params.id, { is_delete: 1 });
        res.json({ status: 200, message: "BOQ deleted", data: {} });
    } catch (err) {
        res.status(500).json({ status: 500, message: err.message, error: true });
    }
};

/**
 * POST /api/boq/upload-plan
 * Uploads a floor plan image to Cloudinary.
 * Returns the secure_url so the client can display it.
 * (AI dimension extraction is a separate optional call that can
 *  use the returned URL with a vision model.)
 */
exports.uploadPlan = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ status: 400, message: "No file uploaded", error: true });
        }
        // Upload buffer to Cloudinary
        const result = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                { folder: "bricks_agent/plans", resource_type: "image" },
                (err, r) => (err ? reject(err) : resolve(r))
            );
            stream.end(req.file.buffer);
        });
        res.json({
            status: 200,
            message: "Plan uploaded",
            data: { secure_url: result.secure_url, public_id: result.public_id },
        });
    } catch (err) {
        res.status(500).json({ status: 500, message: err.message, error: true });
    }
};

/**
 * GET /api/boq/:id/share
 * Returns a formatted WhatsApp-ready summary of a saved BOQ plus a wa.me
 * deep-link the app opens so the user can forward it to their contractor
 * or family without any backend WhatsApp API call.
 *
 * Optional body / query: { phone }  — if provided, also sends a WhatsApp
 * message directly to that number via the Meta Cloud API (requires an
 * approved boq_summary template; falls back to console log in dev).
 */
exports.shareBOQ = async (req, res) => {
    try {
        const boq = await BOQ.findOne({ _id: req.params.id, is_delete: 0 });
        if (!boq) return res.status(404).json({ status: 404, message: 'BOQ not found', error: true });

        const fmt = (n) => '₹' + Number(Math.round(n)).toLocaleString('en-IN');

        // Group items by category for a clean breakdown
        const grouped = {};
        for (const item of boq.items) {
            if (!grouped[item.category]) grouped[item.category] = [];
            grouped[item.category].push(item);
        }

        // Build the WhatsApp message (uses *bold* and _italic_ markdown supported by WA)
        const lines = [];
        lines.push('🏗️ *Bricks Agent — Construction Estimate*');
        lines.push('');
        lines.push(`📌 *Project:* ${boq.project_name}`);
        if (boq.location) lines.push(`📍 *Location:* ${boq.location}`);
        lines.push(`📐 *Area:* ${boq.area_sqft} sqft | ${boq.floors} floor${boq.floors > 1 ? 's' : ''} | ${boq.construction_type.charAt(0).toUpperCase() + boq.construction_type.slice(1)} finish`);
        lines.push('');

        for (const [category, items] of Object.entries(grouped)) {
            lines.push(`*${category}*`);
            // Show only top 4 items per category to keep message readable
            const top = items.slice(0, 4);
            for (const item of top) {
                lines.push(`  • ${item.material}: ${fmt(item.total)}`);
            }
            if (items.length > 4) lines.push(`  _...and ${items.length - 4} more items_`);
            lines.push('');
        }

        lines.push('─────────────────────');
        lines.push(`*Sub-Total:*       ${fmt(boq.grand_total)}`);
        lines.push(`*Contingency (${boq.contingency_pct}%):* ${fmt(boq.grand_total * boq.contingency_pct / 100)}`);
        lines.push(`*✅ Final Estimate: ${fmt(boq.final_estimate)}*`);
        lines.push('');
        lines.push('_Generated by Bricks Agent — India\'s Construction Marketplace_');

        const text = lines.join('\n');

        // wa.me deep-link — mobile app opens this, user picks the recipient
        const waDeepLink = `https://wa.me/?text=${encodeURIComponent(text)}`;

        // If caller supplies a phone number, also push via Meta Cloud API
        const phone = req.query.phone || req.body.phone;
        if (phone) {
            try {
                // Reuse the WhatsApp utility — send the estimate as a text message
                // (works within 24-hour customer-service window; otherwise requires template)
                await sendBoqWhatsApp(phone, boq.project_name, fmt(boq.final_estimate), waDeepLink);
            } catch (waErr) {
                // Non-fatal — deep link still works even if direct send fails
                console.error('BOQ WhatsApp direct send failed:', waErr?.response?.data || waErr.message);
            }
        }

        return res.json({
            status: 200,
            message: 'BOQ share ready',
            data: {
                text,
                wa_deep_link: waDeepLink,
                summary: {
                    project_name:  boq.project_name,
                    area_sqft:     boq.area_sqft,
                    floors:        boq.floors,
                    finish:        boq.construction_type,
                    final_estimate: boq.final_estimate,
                },
            },
            error: false,
        });
    } catch (err) {
        res.status(500).json({ status: 500, message: err.message, error: true });
    }
};

// Sends a concise BOQ summary card to a phone number via Meta Cloud API.
// Requires a 'boq_summary' template approved in WhatsApp Business Manager
// with body params: [1]=project_name [2]=final_estimate [3]=deep_link
async function sendBoqWhatsApp(phone, projectName, finalEstimate, deepLink) {
    const axios         = require('axios');
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken   = process.env.WHATSAPP_ACCESS_TOKEN;
    const template      = process.env.WHATSAPP_BOQ_TEMPLATE || 'boq_summary';
    const language      = process.env.WHATSAPP_LANGUAGE     || 'en';

    const to = String(phone).startsWith('91') ? String(phone) : `91${phone}`;

    if (!phoneNumberId || !accessToken) {
        console.log(`[DEV] BOQ WhatsApp to ${to}: "${projectName}" — ${finalEstimate}`);
        return;
    }

    await axios.post(
        `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
        {
            messaging_product: 'whatsapp',
            to,
            type: 'template',
            template: {
                name: template,
                language: { code: language },
                components: [{
                    type: 'body',
                    parameters: [
                        { type: 'text', text: projectName },
                        { type: 'text', text: finalEstimate },
                    ],
                }],
            },
        },
        { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, timeout: 8000 }
    );
}

/**
 * POST /api/boq/:id/link-plan
 * Links an already-uploaded plan URL to a saved BOQ.
 */
exports.linkPlan = async (req, res) => {
    try {
        const { plan_image, plan_public_id } = req.body;
        const boq = await BOQ.findByIdAndUpdate(
            req.params.id,
            { plan_image, plan_public_id },
            { new: true }
        );
        res.json({ status: 200, message: "Plan linked", data: boq });
    } catch (err) {
        res.status(500).json({ status: 500, message: err.message, error: true });
    }
};
