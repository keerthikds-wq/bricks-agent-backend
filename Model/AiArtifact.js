const { model, Schema } = require("mongoose");

/**
 * AiArtifact — one home for every AI output produced against a project.
 *
 * Bricks_agent_v2 created a separate Mongo collection per feature
 * (site_plans, floorplans, vastu, site_analyses, inspections, estimates,
 * reports) with near-identical shapes, and stored generated images as base64
 * inside the document. This collapses all of them into one collection keyed by
 * `kind`, and keeps images in Cloudinary like the rest of this codebase.
 *
 * Deterministic outputs (BOQ) deliberately stay in their own model — they are
 * real business records, not AI artifacts.
 */
const aiArtifactSchema = new Schema(
    {
        project_id: { type: Schema.Types.ObjectId, ref: "project", index: true },
        user_id:    { type: Schema.Types.ObjectId, ref: "user", required: true, index: true },

        kind: {
            type: String,
            required: true,
            index: true,
            enum: [
                "site_plan",      // generated 2D plot plan (image)
                "floor_plan",     // generated floor plan (image)
                "site_analysis",  // JSON: orientation, drainage, access
                "inspection",     // JSON: safety/quality findings + risk score
                "vastu",          // JSON: score, positives, remedies
                "cost_estimate",  // JSON: 3-tier estimate
                "quotation",      // JSON: line-item quote
                "report",         // markdown progress report
            ],
        },

        // Inputs that produced this, kept so the UI can show "generated for
        // 40×30, north facing" and so we can rebuild the cache key.
        input: { type: Schema.Types.Mixed, default: {} },

        // Structured outputs land here; narrative ones in `text`.
        result: { type: Schema.Types.Mixed, default: {} },
        text:   { type: String, default: "" },

        // Image outputs (site plan / floor plan) — Cloudinary, never base64.
        image_url:       { type: String, default: "" },
        image_public_id: { type: String, default: "" },

        // True when generated without a site visit / with partial inputs, so
        // the UI can badge it honestly rather than implying certainty.
        is_preliminary: { type: Boolean, default: false },

        cached:    { type: Boolean, default: false },
        is_delete: { type: Number, enum: [0, 1], default: 0 },
    },
    { timestamps: true }
);

aiArtifactSchema.index({ project_id: 1, kind: 1, createdAt: -1 });

module.exports = model("aiartifact", aiArtifactSchema);
