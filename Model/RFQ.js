const { model, Schema } = require("mongoose");

/**
 * RFQ — Request for Quotation
 * A buyer / builder / mason requests price quotes from sellers for specific materials.
 */
const rfqQuoteSchema = new Schema(
    {
        seller:         { type: Schema.Types.ObjectId, ref: "seller", required: true },
        unit_price:     { type: Number, required: true },
        total_price:    { type: Number, required: true },
        delivery_days:  { type: Number, default: 7 },          // days from acceptance
        validity_days:  { type: Number, default: 3 },          // quote valid for N days
        brand:          { type: String, default: "" },
        note:           { type: String, default: "" },
        status: {
            type: String,
            enum: ["pending", "accepted", "rejected"],
            default: "pending",
        },
        quoted_at:      { type: Date, default: Date.now },
    },
    { _id: true }
);

const rfqSchema = new Schema(
    {
        // ── Owner ────────────────────────────────────────────────────────────────
        owner:          { type: Schema.Types.ObjectId, required: true, refPath: "ownerModel" },
        ownerModel:     { type: String, required: true, enum: ["user", "masonry", "builder"] },

        // ── Project link (builder-centric merge) ─────────────────────────────────
        project_id:     { type: Schema.Types.ObjectId, ref: "project", default: null, index: true },

        // ── Dispatch scope ───────────────────────────────────────────────────────
        // "roster" is now the only production path: the RFQ goes to the
        // builder's own VendorLink list. "open" is retained purely so historical
        // marketplace RFQs still read correctly — nothing creates them anymore.
        // See MERGE_PLAN.md §Retired.
        dispatch_mode:  { type: String, enum: ["roster", "open"], default: "roster" },
        // Vendors this RFQ was actually sent to (snapshot at send time).
        sent_to:        [{ type: Schema.Types.ObjectId, ref: "user" }],

        // ── RFQ reference number (auto-generated) ────────────────────────────────
        rfq_number:     { type: String, unique: true },

        // ── Material details ─────────────────────────────────────────────────────
        material_name:  { type: String, required: true, trim: true },
        category:       { type: String, default: "" },       // "Structural Materials", etc.
        quantity:       { type: Number, required: true },
        unit:           { type: String, required: true },    // "Bags", "kg", "CFT", "Sqft"
        specifications: { type: String, default: "" },       // "OPC 53 grade, branded"
        brand_preference:{ type: String, default: "" },      // "Ultratech / Any ISI marked"

        // ── Delivery & budget ────────────────────────────────────────────────────
        delivery_location:  { type: String, required: true },
        delivery_pincode:   { type: String, default: "" },
        required_by:        { type: Date },                  // deadline
        budget_min:         { type: Number, default: 0 },
        budget_max:         { type: Number, default: 0 },    // 0 = open budget

        // ── Source (optional — linked from BOQ export) ────────────────────────────
        boq_id:         { type: Schema.Types.ObjectId, ref: "boq", default: null },
        boq_item_name:  { type: String, default: "" },

        // ── Geo (for nearby seller matching) ─────────────────────────────────────
        lat:            { type: Number, default: 0 },
        lng:            { type: Number, default: 0 },

        // ── Quotes from sellers ───────────────────────────────────────────────────
        quotes:         [rfqQuoteSchema],

        // ── Status ───────────────────────────────────────────────────────────────
        status: {
            type: String,
            enum: ["open", "quoted", "accepted", "closed", "cancelled"],
            default: "open",
        },
        accepted_quote: { type: Schema.Types.ObjectId, default: null },
        is_delete:      { type: Number, enum: [0, 1], default: 0 },
    },
    { timestamps: true }
);

// Auto-generate RFQ number before saving
rfqSchema.pre("save", async function (next) {
    if (!this.rfq_number) {
        const count = await this.constructor.countDocuments();
        const pad   = String(count + 1).padStart(5, "0");
        const year  = new Date().getFullYear();
        this.rfq_number = `RFQ-${year}-${pad}`;
    }
    next();
});

module.exports = model("rfq", rfqSchema);
