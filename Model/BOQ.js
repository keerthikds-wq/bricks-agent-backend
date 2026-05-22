const { model, Schema } = require("mongoose");

/**
 * BOQ — Bill of Quantities
 * Stores a saved BOQ calculation for a project.
 * Items contain per-material quantity + estimated cost.
 */
const boqItemSchema = new Schema(
    {
        material:   { type: String, required: true },   // "OPC Cement 53 Grade"
        category:   { type: String, required: true },   // "Structural", "Finishing", etc.
        quantity:   { type: Number, required: true },
        unit:       { type: String, required: true },   // "Bags", "kg", "CFT", "Nos", "Sqft"
        rate:       { type: Number, required: true },   // ₹ per unit (Indian market rate)
        total:      { type: Number, required: true },   // quantity × rate
        note:       { type: String, default: "" },
    },
    { _id: false }
);

const boqSchema = new Schema(
    {
        // ── Owner (any authenticated role) ─────────────────────────────────────
        owner:          { type: Schema.Types.ObjectId, required: true, refPath: "ownerModel" },
        ownerModel:     { type: String, required: true, enum: ["user", "masonry", "builder"] },

        // ── Project details ─────────────────────────────────────────────────────
        project_name:   { type: String, default: "My Project" },
        location:       { type: String, default: "" },
        area_sqft:      { type: Number, required: true },   // total built-up area
        floors:         { type: Number, default: 1 },       // G+0 = 1, G+1 = 2 ...
        construction_type: {
            type: String,
            enum: ["economy", "standard", "premium"],
            default: "standard",
        },
        structure_type: {
            type: String,
            enum: ["rcc", "load_bearing", "steel"],
            default: "rcc",
        },

        // ── Optional plan upload (Cloudinary) ──────────────────────────────────
        plan_image:     { type: String, default: "" },   // secure_url
        plan_public_id: { type: String, default: "" },

        // ── Calculated items ────────────────────────────────────────────────────
        items:          [boqItemSchema],
        grand_total:    { type: Number, default: 0 },    // sum of all item totals
        contingency_pct:{ type: Number, default: 5 },    // % contingency buffer
        final_estimate: { type: Number, default: 0 },    // grand_total + contingency

        // ── Status ──────────────────────────────────────────────────────────────
        is_delete:      { type: Number, enum: [0, 1], default: 0 },
        rfq_generated:  { type: Boolean, default: false },
    },
    { timestamps: true }
);

module.exports = model("boq", boqSchema);
