const { model, Schema } = require("mongoose");

/**
 * VendorLink — a builder's private vendor roster.
 *
 * This is the "vendors are linked with builder" decision made concrete. RFQs
 * are dispatched to the builder's roster only; the old open-marketplace
 * broadcast to every nearby seller is retired (see MERGE_PLAN.md §Retired).
 *
 * The link is builder-scoped, not project-scoped: a builder onboards a cement
 * supplier once and can then use them on every project. Per-project vendor
 * involvement is still recorded in ProjectMember when they're actually
 * engaged on a specific build.
 */
const vendorLinkSchema = new Schema(
    {
        builder_id: { type: Schema.Types.ObjectId, ref: "user", required: true, index: true },
        vendor_id:  { type: Schema.Types.ObjectId, ref: "user", required: true, index: true },

        // What this vendor is on the roster for. Mirrors Inventory.category so
        // RFQ dispatch can target "who supplies cement" without a join.
        supplies: {
            type: [String],
            enum: ["cement", "steel", "bricks", "sand", "aggregate", "tiles",
                   "paint", "plywood", "pipes", "electrical", "other"],
            default: [],
        },

        // Builder's own label — "Ravi Cement Depot (Kukatpally)".
        display_name: { type: String, default: "" },
        notes:        { type: String, default: "" },

        // Builder's private rating, separate from the public Review model.
        preferred:  { type: Boolean, default: false },
        rating:     { type: Number, min: 0, max: 5, default: 0 },

        // Rolling stats so the builder can see who actually delivers.
        rfqs_sent:     { type: Number, default: 0 },
        quotes_given:  { type: Number, default: 0 },
        orders_won:    { type: Number, default: 0 },

        status: {
            type: String,
            enum: ["invited", "active", "paused", "removed"],
            default: "invited",
            index: true,
        },

        invited_at:  { type: Date, default: Date.now },
        accepted_at: { type: Date },
    },
    { timestamps: true }
);

vendorLinkSchema.index({ builder_id: 1, vendor_id: 1 }, { unique: true });
vendorLinkSchema.index({ builder_id: 1, supplies: 1, status: 1 });

module.exports = model("vendorlink", vendorLinkSchema);
