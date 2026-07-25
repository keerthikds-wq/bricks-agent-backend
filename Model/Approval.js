const { model, Schema } = require("mongoose");

/**
 * Approval — a two-party decision gate.
 *
 * Rule (ported from v2 collab.py, kept exactly): whoever raises it cannot
 * decide it. The counterparty decides.
 *
 *   builder raises  → client decides
 *   client  raises  → builder decides
 *
 * Field staff with can_approve may also decide builder-raised items — that is
 * the supervisor case, which v2 did not have.
 */
const approvalSchema = new Schema(
    {
        project_id: { type: Schema.Types.ObjectId, ref: "project", required: true, index: true },

        title:       { type: String, required: true, trim: true },
        description: { type: String, default: "" },

        category: {
            type: String,
            enum: ["change", "design", "material", "cost", "schedule", "other"],
            default: "change",
        },

        // Positive = costs more, negative = saving. Drives the "this will add
        // ₹X to your budget" line the client sees before deciding.
        cost_delta: { type: Number, default: 0 },

        attachments: { type: [String], default: [] },   // Cloudinary secure_urls

        status: {
            type: String,
            enum: ["pending", "approved", "rejected", "withdrawn"],
            default: "pending",
            index: true,
        },

        raised_by:      { type: Schema.Types.ObjectId, ref: "user", required: true },
        raised_by_name: { type: String, default: "" },
        raised_by_role: { type: String, required: true },   // builder | client | field_staff

        decided_by:   { type: Schema.Types.ObjectId, ref: "user", default: null },
        decided_at:   { type: Date },
        decision_note: { type: String, default: "" },

        is_delete: { type: Number, enum: [0, 1], default: 0 },
    },
    { timestamps: true }
);

approvalSchema.index({ project_id: 1, status: 1 });

module.exports = model("approval", approvalSchema);
