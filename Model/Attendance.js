const { model, Schema } = require("mongoose");

/**
 * Attendance — who was on which site, on which day.
 *
 * One document per worker per project per day. Marking a day twice updates
 * rather than duplicating: the unique index below makes a double-submit — a
 * supervisor with bad signal tapping Save again — impossible to turn into two
 * days of wages for one day of work.
 */
const attendanceSchema = new Schema(
    {
        project_id: { type: Schema.Types.ObjectId, ref: "project", required: true, index: true },
        builder_id: { type: Schema.Types.ObjectId, ref: "user", required: true, index: true },
        worker_id:  { type: Schema.Types.ObjectId, ref: "worker", required: true, index: true },

        /** Normalised to midnight local by the pre-save hook. */
        date: { type: Date, required: true },

        /**
         * present  — a full day
         * half_day — paid pro-rata at half the standard day
         * absent   — recorded deliberately, and paid nothing
         *
         * `absent` exists on purpose. "No record" and "did not turn up" are
         * different facts: the first is a gap in reporting, the second is
         * information about the person. Collapsing them would make an
         * unreported site look identical to an empty one, which is exactly the
         * confusion the health engine's `unknown` state exists to avoid.
         */
        status: {
            type: String,
            enum: ["present", "half_day", "absent"],
            default: "present",
        },

        /** Hours actually worked. Defaults to the trade's standard day. */
        hours: { type: Number, default: null, min: 0 },

        /** Hours beyond the standard day, paid at the overtime multiplier. */
        overtime_hours: { type: Number, default: 0, min: 0 },

        /**
         * What this person's day cost, in paise, frozen at the moment it was
         * marked.
         *
         * Stored rather than recomputed on read, because the rate in force can
         * change: re-pricing masons next month must not silently rewrite what
         * last month's attendance cost. The ledger entry it feeds is derived
         * from the sum of these, so both agree by construction.
         */
        amount_paise: { type: Number, default: 0, min: 0 },

        marked_by: { type: Schema.Types.ObjectId, ref: "user", default: null },
        notes:     { type: String, default: "" },
        is_delete: { type: Number, enum: [0, 1], default: 0 },
    },
    { timestamps: true }
);

/**
 * One record per worker, per project, per day.
 *
 * Partial on is_delete so a deleted record does not block re-marking the same
 * day — otherwise correcting a mistake would permanently poison that date.
 */
attendanceSchema.index(
    { project_id: 1, worker_id: 1, date: 1 },
    { unique: true, partialFilterExpression: { is_delete: 0 } }
);

// Reading a day's sheet, and a worker's month.
attendanceSchema.index({ project_id: 1, date: -1 });
attendanceSchema.index({ worker_id: 1, date: -1 });

/**
 * Dates are days, not instants.
 *
 * Attendance marked at 18:30 and again at 19:10 is the same day and must
 * collide on the unique index. Without this they differ by 40 minutes, the
 * index does not catch them, and the worker is paid twice — the same class of
 * bug that made wage rates silently fail to price the day they were created.
 */
attendanceSchema.pre("save", function (next) {
    if (this.date) {
        const d = new Date(this.date);
        d.setHours(0, 0, 0, 0);
        this.date = d;
    }
    next();
});

module.exports = model("attendance", attendanceSchema);
