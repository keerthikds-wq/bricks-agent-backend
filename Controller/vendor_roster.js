const VendorLink = require("../Model/VendorLink");
const RFQ        = require("../Model/RFQ");
const User       = require("../Model/User");
const Inventory  = require("../Model/Inventory");

const { callerId }   = require("../Middleware/projectAccess");
const { notifyUsers } = require("../Utils/projectNotify");
const invites = require("../Utils/projectInvite");

const ok   = (res, data, s = 200) => res.status(s).json({ success: true, data });
const fail = (res, s, message)    => res.status(s).json({ success: false, message });

/**
 * Vendor roster — a builder's private supplier list.
 *
 * This replaces the open marketplace: RFQs now go to vendors the builder has
 * onboarded, not broadcast to every seller within a geo radius. The retired
 * behaviour lived in lib/algorithms/send_notification_to_nearby_sellers.dart
 * and Controller/requirement.js — see MERGE_PLAN.md §Retired.
 */

// GET /api/vendors   (builder)
exports.listVendors = async (req, res) => {
    try {
        const builderId = callerId(req);
        const q = { builder_id: builderId, status: { $ne: "removed" } };
        if (req.query.supplies) q.supplies = req.query.supplies;

        const links = await VendorLink.find(q)
            .populate("vendor_id", "name phone profile role")
            .sort({ preferred: -1, createdAt: -1 })
            .lean();

        return ok(res, links);
    } catch (err) {
        console.error("listVendors error:", err);
        return fail(res, 500, "Server error");
    }
};

// POST /api/vendors/invite   (builder) — generate a WhatsApp invite link
exports.inviteVendor = async (req, res) => {
    try {
        const builderId = callerId(req);
        const { phone, display_name = "", supplies = [] } = req.body;
        if (!phone) return fail(res, 400, "Vendor phone number is required");

        const builder = await User.findById(builderId).select("name").lean();

        // If they already have an account, link immediately — no round-trip.
        const existing = await User.findOne({ phone, is_delete: 0 });
        if (existing) {
            const link = await VendorLink.findOneAndUpdate(
                { builder_id: builderId, vendor_id: existing._id },
                {
                    $set: {
                        supplies,
                        display_name: display_name || existing.name,
                        status: "active",
                        accepted_at: new Date(),
                    },
                },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );

            await notifyUsers([existing._id], {
                title: "You've been added as a supplier",
                body:  `${builder?.name || "A builder"} added you to their vendor list.`,
                kind:  "invite",
                route: "/vendor/requests",
            });

            return ok(res, { linked: true, vendor: link });
        }

        const token = invites.createVendorInvite({
            builderId,
            supplies,
            displayName: display_name,
            phone,
        });
        const msg = invites.buildInviteMessage({
            token,
            inviterName: builder?.name || "A builder",
            projectName: "",
            role: "vendor",
            isVendor: true,
        });

        return ok(res, { linked: false, token, ...msg });
    } catch (err) {
        console.error("inviteVendor error:", err);
        return fail(res, 500, "Server error");
    }
};

// POST /api/vendors/invite/:token/accept   (authenticated vendor)
exports.acceptVendorInvite = async (req, res) => {
    try {
        const userId  = callerId(req);
        const payload = invites.decodeInvite(req.params.token, "vendor_invite");

        if (payload.builder_id === String(userId)) {
            return fail(res, 400, "You cannot add yourself as your own vendor.");
        }

        const link = await VendorLink.findOneAndUpdate(
            { builder_id: payload.builder_id, vendor_id: userId },
            {
                $set: {
                    supplies:     payload.supplies || [],
                    display_name: payload.display_name || "",
                    status:       "active",
                    accepted_at:  new Date(),
                },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        // Promote the account to vendor if it was still on the default role.
        await User.updateOne(
            { _id: userId, role: { $in: ["client", null] } },
            { $set: { role: "vendor" } }
        );

        await notifyUsers([payload.builder_id], {
            title: "Vendor joined",
            body:  "A supplier accepted your invite.",
            kind:  "success",
            route: "/vendors",
        });

        return ok(res, { joined: true, vendor: link });
    } catch (err) {
        return fail(res, err.status || 500, err.message || "Server error");
    }
};

// PATCH /api/vendors/:linkId   (builder)
exports.updateVendor = async (req, res) => {
    try {
        const allowed = ["supplies", "display_name", "notes", "preferred", "rating", "status"];
        const updates = {};
        for (const k of allowed) if (req.body[k] !== undefined) updates[k] = req.body[k];

        const link = await VendorLink.findOneAndUpdate(
            { _id: req.params.linkId, builder_id: callerId(req) },
            { $set: updates },
            { new: true }
        );
        if (!link) return fail(res, 404, "Vendor not found on your roster");
        return ok(res, link);
    } catch (err) {
        console.error("updateVendor error:", err);
        return fail(res, 500, "Server error");
    }
};

// DELETE /api/vendors/:linkId   (builder)
exports.removeVendor = async (req, res) => {
    try {
        const link = await VendorLink.findOneAndUpdate(
            { _id: req.params.linkId, builder_id: callerId(req) },
            { $set: { status: "removed" } },
            { new: true }
        );
        if (!link) return fail(res, 404, "Vendor not found on your roster");
        return ok(res, { removed: true });
    } catch (err) {
        console.error("removeVendor error:", err);
        return fail(res, 500, "Server error");
    }
};

/**
 * POST /api/vendors/dispatch-rfq/:rfqId   (builder)
 * Send an existing RFQ to the roster vendors who supply that category.
 */
exports.dispatchRfq = async (req, res) => {
    try {
        const builderId = callerId(req);
        const rfq = await RFQ.findOne({ _id: req.params.rfqId, is_delete: 0 });
        if (!rfq) return fail(res, 404, "RFQ not found");
        if (rfq.owner.toString() !== builderId.toString()) {
            return fail(res, 403, "This RFQ is not yours");
        }

        const q = { builder_id: builderId, status: "active" };
        // Match on category when the RFQ has one; otherwise send to the roster.
        if (rfq.category) q.supplies = rfq.category.toLowerCase();

        let links = await VendorLink.find(q).select("vendor_id").lean();
        if (!links.length) {
            links = await VendorLink.find({ builder_id: builderId, status: "active" }).select("vendor_id").lean();
        }
        if (!links.length) {
            return fail(res, 400, "You have no active vendors yet. Add vendors before sending an RFQ.");
        }

        const vendorIds = links.map((l) => l.vendor_id);

        rfq.dispatch_mode = "roster";
        rfq.sent_to = vendorIds;
        rfq.status = "open";
        await rfq.save();

        await VendorLink.updateMany(
            { builder_id: builderId, vendor_id: { $in: vendorIds } },
            { $inc: { rfqs_sent: 1 } }
        );

        await notifyUsers(vendorIds, {
            projectId: rfq.project_id || null,
            title: "New material request",
            body:  `${rfq.material_name} — ${rfq.quantity} ${rfq.unit}`,
            kind:  "rfq",
            route: `/rfq/${rfq._id}`,
        });

        return ok(res, { sent_to: vendorIds.length, rfq });
    } catch (err) {
        console.error("dispatchRfq error:", err);
        return fail(res, 500, "Server error");
    }
};

/**
 * GET /api/vendors/my-requests   (vendor)
 * RFQs addressed to this vendor by the builders who onboarded them.
 */
exports.myRequests = async (req, res) => {
    try {
        const vendorId = callerId(req);
        const rfqs = await RFQ.find({
            sent_to: vendorId,
            is_delete: 0,
            status: { $in: ["open", "quoted"] },
        })
            .sort({ createdAt: -1 })
            .limit(100)
            .lean();

        // Hide competitors' pricing — a vendor sees only their own quote.
        const shaped = rfqs.map((r) => ({
            ...r,
            quotes: (r.quotes || []).filter((q) => q.seller?.toString() === vendorId.toString()),
            quote_count: (r.quotes || []).length,
        }));

        return ok(res, shaped);
    } catch (err) {
        console.error("myRequests error:", err);
        return fail(res, 500, "Server error");
    }
};

/** GET /api/vendors/:vendorId/catalogue  (builder) — what this vendor stocks */
exports.vendorCatalogue = async (req, res) => {
    try {
        const link = await VendorLink.findOne({
            builder_id: callerId(req),
            vendor_id:  req.params.vendorId,
            status:     { $ne: "removed" },
        });
        if (!link) return fail(res, 403, "That vendor is not on your roster");

        const items = await Inventory.find({ seller_id: req.params.vendorId, is_available: true })
            .sort({ category: 1, name: 1 })
            .lean();
        return ok(res, items);
    } catch (err) {
        console.error("vendorCatalogue error:", err);
        return fail(res, 500, "Server error");
    }
};
