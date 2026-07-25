const { model, Schema } = require("mongoose");

/**
 * ProjectMember — the link table that makes everyone builder-centric.
 *
 * Replaces the old separate-silo model (buyer / seller / masonry each with
 * their own auth + home). Now: a builder owns projects and every other party
 * exists on a project through a row here.
 *
 *   client       → the owner paying for the build (1 per project)
 *   field_staff  → site engineer / supervisor / mason / contractor (N)
 *   vendor       → material supplier from the builder's roster (N)
 *
 * A user may hold rows on many projects, and may be a different role on each.
 */

const projectMemberSchema = new Schema(
    {
        project_id: { type: Schema.Types.ObjectId, ref: "project", required: true, index: true },
        user_id:    { type: Schema.Types.ObjectId, ref: "user",    required: true, index: true },

        role: {
            type: String,
            enum: ["client", "field_staff", "vendor"],
            required: true,
        },

        // Only meaningful when role === "field_staff". Drives UI labels and
        // which trades this person is expected to log against.
        staff_type: {
            type: String,
            enum: ["site_engineer", "supervisor", "mason", "contractor", null],
            default: null,
        },

        // Free-text trade tag for masons/contractors, e.g. "plastering".
        // Mirrors Masonry.specializations so migrated masons keep their skill.
        trade: { type: String, default: "" },

        // ── Capability flags ─────────────────────────────────────────────────
        // Deliberately explicit rather than derived, so a builder can loosen or
        // tighten one person without a code change.
        can_log_progress:  { type: Boolean, default: false },  // post site updates / daily logs
        can_view_finance:  { type: Boolean, default: false },  // see budget, spent, payments
        can_approve:       { type: Boolean, default: false },  // decide approvals

        status: {
            type: String,
            enum: ["invited", "active", "removed"],
            default: "invited",
            index: true,
        },

        invited_by:  { type: Schema.Types.ObjectId, ref: "user" },
        invited_at:  { type: Date, default: Date.now },
        accepted_at: { type: Date },
        removed_at:  { type: Date },
    },
    { timestamps: true }
);

// One row per (project, user, role). Same person can be client on their own
// house and field_staff on another builder's site.
projectMemberSchema.index({ project_id: 1, user_id: 1, role: 1 }, { unique: true });

/** Sensible capability defaults per role — applied at invite time. */
projectMemberSchema.statics.defaultCapabilities = function (role, staffType) {
    if (role === "client") {
        return { can_log_progress: false, can_view_finance: true,  can_approve: true  };
    }
    if (role === "vendor") {
        return { can_log_progress: false, can_view_finance: false, can_approve: false };
    }
    // field_staff
    const senior = staffType === "site_engineer" || staffType === "supervisor";
    return { can_log_progress: true, can_view_finance: false, can_approve: senior };
};

module.exports = model("projectmember", projectMemberSchema);
