const { model, Schema } = require("mongoose");

/**
 * ProjectUpdate — a site update on the project feed.
 *
 * This is what the client actually opens the app to see. Ported from v2's
 * `timeline` collection, with one deliberate change: images are Cloudinary
 * URLs, not base64. v2 stored raw base64 inside Mongo which does not survive
 * real photo volume.
 */
const projectUpdateSchema = new Schema(
    {
        project_id: { type: Schema.Types.ObjectId, ref: "project", required: true, index: true },

        title:       { type: String, required: true, trim: true },
        description: { type: String, default: "" },

        category: {
            type: String,
            enum: ["progress", "delay", "issue", "material", "inspection", "payment", "milestone", "ai"],
            default: "progress",
            index: true,
        },

        images: { type: [String], default: [] },   // Cloudinary secure_urls

        // ── Author snapshot ──────────────────────────────────────────────────
        // Denormalised so the feed renders without an extra populate, and so
        // history stays truthful if someone is later removed from the project.
        author_id:         { type: Schema.Types.ObjectId, ref: "user" },
        author_name:       { type: String, default: "" },
        author_role:       { type: String, default: "" },   // builder | client | field_staff | vendor
        author_staff_type: { type: String, default: "" },

        // Set when this update was auto-generated from a daily log.
        daily_log_id: { type: Schema.Types.ObjectId, ref: "dailylog", default: null },

        is_delete: { type: Number, enum: [0, 1], default: 0 },
    },
    { timestamps: true }
);

projectUpdateSchema.index({ project_id: 1, createdAt: -1 });

module.exports = model("projectupdate", projectUpdateSchema);
