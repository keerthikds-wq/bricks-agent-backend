const { model, Schema } = require("mongoose");

/**
 * VendorLink — a builder's private supplier CONTACT.
 *
 * Vendors do not use this app. They have no account and no login: the builder
 * creates a material request, sends it to his suppliers over WhatsApp, and
 * records whatever they quote back. So this is an address-book entry owned by
 * one builder, not a link between two user accounts.
 *
 * (An earlier version modelled vendors as app users with an invite/accept flow
 * and an in-app RFQ inbox. That was wrong — suppliers in this trade answer on
 * WhatsApp and will not install a builder's software. `user_id` below is the
 * vestige of that model, kept only so historical rows still resolve.)
 */
const vendorLinkSchema = new Schema(
    {
        builder_id: { type: Schema.Types.ObjectId, ref: "user", required: true, index: true },

        // ── The contact ──────────────────────────────────────────────────────
        name:  { type: String, required: true, trim: true },
        phone: { type: String, required: true, trim: true },
        company: { type: String, default: "" },
        notes:   { type: String, default: "" },

        /// What this supplier is on the roster for — drives which requests get
        /// sent to them.
        supplies: {
            type: [String],
            enum: ["cement", "steel", "bricks", "sand", "aggregate", "tiles",
                   "paint", "plywood", "pipes", "electrical", "other"],
            default: [],
        },

        // Builder's private opinion — separate from the public Review model.
        preferred: { type: Boolean, default: false },
        rating:    { type: Number, min: 0, max: 5, default: 0 },

        // Rolling stats so the builder can see who actually responds.
        rfqs_sent:    { type: Number, default: 0 },
        quotes_given: { type: Number, default: 0 },
        orders_won:   { type: Number, default: 0 },

        // Optional: set only if this supplier ALSO happens to have an account
        // (e.g. a migrated legacy seller). Nothing depends on it.
        user_id: { type: Schema.Types.ObjectId, ref: "user", default: null },

        is_delete: { type: Number, enum: [0, 1], default: 0 },
    },
    { timestamps: true }
);

// One entry per phone per builder — stops duplicate address-book rows.
vendorLinkSchema.index({ builder_id: 1, phone: 1 }, { unique: true });
vendorLinkSchema.index({ builder_id: 1, supplies: 1, is_delete: 1 });

module.exports = model("vendorlink", vendorLinkSchema);
