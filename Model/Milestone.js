const { model, Schema } = require("mongoose");

/**
 * Milestone — a dated deliverable on a project.
 * Toggling one recomputes Project.progress (see project_collab.recomputeProgress).
 */
const milestoneSchema = new Schema(
    {
        project_id: { type: Schema.Types.ObjectId, ref: "project", required: true, index: true },

        title:       { type: String, required: true, trim: true },
        description: { type: String, default: "" },
        due_date:    { type: Date },

        completed:    { type: Boolean, default: false },
        completed_at: { type: Date },
        completed_by: { type: Schema.Types.ObjectId, ref: "user" },

        // Optional link to a phase name on the project, so completing a
        // milestone can advance the phase strip on the client's view.
        phase_name: { type: String, default: "" },

        created_by: { type: Schema.Types.ObjectId, ref: "user" },
        is_delete:  { type: Number, enum: [0, 1], default: 0 },
    },
    { timestamps: true }
);

milestoneSchema.index({ project_id: 1, due_date: 1 });

module.exports = model("milestone", milestoneSchema);
