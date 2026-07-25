const { model, Schema } = require("mongoose");

/**
 * Project — the spine of the builder-centric model.
 *
 * A builder owns the project. Everyone else (client/owner, field staff,
 * vendors) is LINKED to it through ProjectMember. Access is resolved by
 * Middleware/projectAccess.js — never check ownership inline in a controller.
 *
 * Ported from Bricks_agent_v2 (backend/routers/projects.py) and merged with
 * the phase list already used by ProjectTimeline so existing Construction
 * Tracking data maps across cleanly.
 */

const PhaseSchema = new Schema(
    {
        name:         { type: String, required: true },
        status:       { type: String, enum: ["pending", "in_progress", "completed"], default: "pending" },
        notes:        { type: String, default: "" },
        completed_at: { type: Date },
    },
    { _id: false }
);

const DEFAULT_PHASES = () => [
    { name: "Planning & Design",     status: "pending" },
    { name: "Foundation",            status: "pending" },
    { name: "Structure",             status: "pending" },
    { name: "Brickwork & Walls",     status: "pending" },
    { name: "Roofing",               status: "pending" },
    { name: "Electrical & Plumbing", status: "pending" },
    { name: "Plastering",            status: "pending" },
    { name: "Flooring & Tiling",     status: "pending" },
    { name: "Painting & Finishing",  status: "pending" },
    { name: "Handover",              status: "pending" },
];

const projectSchema = new Schema(
    {
        // ── Ownership ────────────────────────────────────────────────────────
        builder_id: { type: Schema.Types.ObjectId, ref: "user", required: true, index: true },

        // Client (owner) may be linked before they ever sign up — we match on
        // phone at registration time and backfill client_id. Same trick v2 used
        // with email, adapted to phone because auth here is OTP-based.
        client_id:    { type: Schema.Types.ObjectId, ref: "user", default: null, index: true },
        client_phone: { type: String, default: "" },
        client_name:  { type: String, default: "" },

        // ── Identity ─────────────────────────────────────────────────────────
        name:        { type: String, required: true, trim: true },
        description: { type: String, default: "" },
        address:     { type: String, default: "" },
        pincode:     { type: String, default: "" },
        cover_image: { type: String, default: "" },   // Cloudinary secure_url

        project_type: {
            type: String,
            enum: ["residential", "commercial", "industrial", "renovation", "infrastructure"],
            default: "residential",
        },

        // ── Geo (reuses the [lng, lat] convention from Builder/Masonry) ──────
        location: {
            type:        { type: String, default: "Point" },
            coordinates: { type: [Number], default: [0, 0] },
        },

        // ── Scope ────────────────────────────────────────────────────────────
        area_sqft: { type: Number, default: 0 },
        floors:    { type: Number, default: 1 },

        // ── Money (all INR) ──────────────────────────────────────────────────
        budget: { type: Number, default: 0 },
        spent:  { type: Number, default: 0 },   // maintained by payment mark-paid

        // ── Schedule ─────────────────────────────────────────────────────────
        start_date:        { type: Date },
        expected_end_date: { type: Date },

        // ── Progress ─────────────────────────────────────────────────────────
        // Recomputed from milestone completion; see project_collab.recomputeProgress
        progress: { type: Number, default: 0, min: 0, max: 100 },
        phases:   { type: [PhaseSchema], default: DEFAULT_PHASES },

        status: {
            type: String,
            enum: ["planning", "active", "on_hold", "completed", "archived"],
            default: "planning",
            index: true,
        },

        // ── Provenance ───────────────────────────────────────────────────────
        // Set when a legacy ProjectTimeline row was migrated into this project.
        migrated_from_timeline: { type: Schema.Types.ObjectId, ref: "ProjectTimeline", default: null },

        is_delete: { type: Number, enum: [0, 1], default: 0 },
    },
    { timestamps: true }
);

projectSchema.index({ builder_id: 1, status: 1 });
projectSchema.index({ location: "2dsphere" });

// Counts toward a builder's plan limit only while genuinely live.
projectSchema.statics.activeCountForBuilder = function (builderId) {
    return this.countDocuments({
        builder_id: builderId,
        is_delete:  0,
        status:     { $nin: ["archived", "completed"] },
    });
};

module.exports = model("project", projectSchema);
module.exports.DEFAULT_PHASES = DEFAULT_PHASES;
