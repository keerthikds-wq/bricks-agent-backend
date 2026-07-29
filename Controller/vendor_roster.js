const VendorLink = require("../Model/VendorLink");
const RFQ = require("../Model/RFQ");
const User = require("../Model/User");

const { callerId } = require("../Middleware/projectAccess");

const ok = (res, data, s = 200) => res.status(s).json({ success: true, data });
const fail = (res, s, message) => res.status(s).json({ success: false, message });

/**
 * Supplier address book, owned by the builder.
 *
 * Suppliers do not use the app. The builder keeps their contacts here, creates
 * a material request, and sends it to the right suppliers over WhatsApp. When
 * they reply — on WhatsApp, or by phone — the builder records what each of them
 * quoted so the prices can be compared side by side.
 *
 * There is deliberately no vendor login, no invite/accept, and no supplier
 * inbox. See Model/VendorLink.js.
 */

/* ────────────────────────────── Contacts ────────────────────────────── */

// GET /api/vendors
exports.listVendors = async (req, res) => {
    try {
        const q = { builder_id: callerId(req), is_delete: 0 };
        if (req.query.supplies) q.supplies = req.query.supplies;

        const items = await VendorLink.find(q)
            .sort({ preferred: -1, name: 1 })
            .lean();
        return ok(res, items);
    } catch (err) {
        console.error("listVendors error:", err);
        return fail(res, 500, "Server error");
    }
};

// POST /api/vendors   { name, phone, company?, supplies[], notes? }
exports.addVendor = async (req, res) => {
    try {
        const { name, phone, company = "", supplies = [], notes = "" } = req.body;
        if (!name || !phone) return fail(res, 400, "Name and phone number are required");

        const builderId = callerId(req);

        const existing = await VendorLink.findOne({
            builder_id: builderId, phone, is_delete: 0,
        });
        if (existing) return fail(res, 409, `${existing.name} is already on your list with this number.`);

        // If they happen to have an account, note it — nothing depends on it,
        // but it lets us show a verified badge later.
        const account = await User.findOne({ phone, is_delete: 0 }).select("_id").lean();

        const v = await VendorLink.create({
            builder_id: builderId,
            name, phone, company, supplies, notes,
            user_id: account ? account._id : null,
        });
        return ok(res, v, 201);
    } catch (err) {
        if (err.code === 11000) return fail(res, 409, "That number is already on your supplier list.");
        console.error("addVendor error:", err);
        return fail(res, 500, "Server error");
    }
};

// PATCH /api/vendors/:id
exports.updateVendor = async (req, res) => {
    try {
        const allowed = ["name", "phone", "company", "supplies", "notes", "preferred", "rating"];
        const updates = {};
        for (const k of allowed) if (req.body[k] !== undefined) updates[k] = req.body[k];

        const v = await VendorLink.findOneAndUpdate(
            { _id: req.params.id, builder_id: callerId(req), is_delete: 0 },
            { $set: updates },
            { new: true }
        );
        if (!v) return fail(res, 404, "Supplier not found on your list");
        return ok(res, v);
    } catch (err) {
        console.error("updateVendor error:", err);
        return fail(res, 500, "Server error");
    }
};

// DELETE /api/vendors/:id
exports.removeVendor = async (req, res) => {
    try {
        const v = await VendorLink.findOneAndUpdate(
            { _id: req.params.id, builder_id: callerId(req) },
            { $set: { is_delete: 1 } },
            { new: true }
        );
        if (!v) return fail(res, 404, "Supplier not found on your list");
        return ok(res, { removed: true });
    } catch (err) {
        console.error("removeVendor error:", err);
        return fail(res, 500, "Server error");
    }
};

/* ─────────────────────── WhatsApp dispatch ──────────────────────────── */

/** The message a supplier actually receives. Plain text, no links to install. */
function buildRfqMessage(rfq, builderName) {
    const lines = [
        `*Material request*${rfq.rfq_number ? ` — ${rfq.rfq_number}` : ""}`,
        ``,
        `*Item:* ${rfq.material_name}`,
        `*Quantity:* ${rfq.quantity} ${rfq.unit}`,
    ];
    if (rfq.specifications) lines.push(`*Spec:* ${rfq.specifications}`);
    if (rfq.brand_preference) lines.push(`*Brand:* ${rfq.brand_preference}`);
    if (rfq.delivery_location) lines.push(`*Deliver to:* ${rfq.delivery_location}`);
    if (rfq.required_by) {
        lines.push(`*Needed by:* ${new Date(rfq.required_by).toLocaleDateString("en-IN")}`);
    }
    lines.push(``, `Please send your best rate and delivery time.`);
    if (builderName) lines.push(``, `— ${builderName}`);
    return lines.join("\n");
}

/**
 * POST /api/vendors/dispatch-rfq/:rfqId
 *
 * Does not send anything itself. Returns one ready-to-open wa.me link per
 * matching supplier — the builder taps through them. Sending server-side would
 * need a WhatsApp Business account and template approval; opening the app with
 * the message prefilled is what actually works today.
 */
exports.dispatchRfq = async (req, res) => {
    try {
        const builderId = callerId(req);
        const rfq = await RFQ.findOne({ _id: req.params.rfqId, is_delete: 0 });
        if (!rfq) return fail(res, 404, "Request not found");
        if (rfq.owner.toString() !== builderId.toString()) {
            return fail(res, 403, "This request is not yours");
        }

        const q = { builder_id: builderId, is_delete: 0 };
        if (rfq.category) q.supplies = rfq.category.toLowerCase();

        // Fall back to the whole list when nobody is tagged for this category —
        // better to offer every supplier than to silently send to none.
        let vendors = await VendorLink.find(q).lean();
        let matchedByCategory = vendors.length > 0;
        if (!vendors.length) {
            vendors = await VendorLink.find({ builder_id: builderId, is_delete: 0 }).lean();
        }
        if (!vendors.length) {
            return fail(res, 400, "Add suppliers to your list before sending a request.");
        }

        const builder = await User.findById(builderId).select("name").lean();
        const message = buildRfqMessage(rfq, builder?.name || "");

        const targets = vendors.map((v) => ({
            id: v._id,
            name: v.name,
            phone: v.phone,
            company: v.company,
            preferred: v.preferred,
            // wa.me wants a bare international number.
            whatsapp_url: `https://wa.me/${String(v.phone).replace(/\D/g, "").replace(/^0+/, "").padStart(12, "91")}?text=${encodeURIComponent(message)}`,
        }));

        await VendorLink.updateMany(
            { _id: { $in: vendors.map((v) => v._id) } },
            { $inc: { rfqs_sent: 1 } }
        );

        rfq.dispatch_mode = "roster";
        rfq.sent_to_contacts = vendors.map((v) => v._id);
        rfq.status = "open";
        await rfq.save();

        return ok(res, {
            message,
            matched_by_category: matchedByCategory,
            targets,
        });
    } catch (err) {
        console.error("dispatchRfq error:", err);
        return fail(res, 500, "Server error");
    }
};

/**
 * POST /api/vendors/:id/record-quote/:rfqId
 *
 * The builder types in what a supplier quoted back over WhatsApp, so the
 * prices can be compared in one place. This replaces the supplier submitting
 * a quote themselves — they are not in the app.
 */
exports.recordQuote = async (req, res) => {
    try {
        const builderId = callerId(req);
        const { unit_price, delivery_days, brand, note } = req.body;
        if (unit_price === undefined || Number(unit_price) <= 0) {
            return fail(res, 400, "Enter the rate they quoted");
        }

        const vendor = await VendorLink.findOne({
            _id: req.params.id, builder_id: builderId, is_delete: 0,
        });
        if (!vendor) return fail(res, 404, "Supplier not found on your list");

        const rfq = await RFQ.findOne({ _id: req.params.rfqId, is_delete: 0 });
        if (!rfq) return fail(res, 404, "Request not found");
        if (rfq.owner.toString() !== builderId.toString()) {
            return fail(res, 403, "This request is not yours");
        }

        const price = Number(unit_price);
        const entry = {
            vendor_contact: vendor._id,
            vendor_name: vendor.name,
            unit_price: price,
            total_price: price * (rfq.quantity || 0),
            delivery_days: Number(delivery_days) || 7,
            brand: brand || "",
            note: note || "",
            recorded_by_builder: true,
            quoted_at: new Date(),
        };

        // One quote per supplier per request — re-recording replaces it, since
        // a supplier revising their price over WhatsApp is normal.
        const idx = (rfq.quotes || []).findIndex(
            (q) => q.vendor_contact && q.vendor_contact.toString() === vendor._id.toString()
        );
        if (idx >= 0) rfq.quotes[idx] = { ...rfq.quotes[idx].toObject?.() ?? {}, ...entry };
        else rfq.quotes.push(entry);

        if (rfq.status === "open") rfq.status = "quoted";
        await rfq.save();

        await VendorLink.updateOne({ _id: vendor._id }, { $inc: { quotes_given: 1 } });

        return ok(res, rfq, 201);
    } catch (err) {
        console.error("recordQuote error:", err);
        return fail(res, 500, "Server error");
    }
};
