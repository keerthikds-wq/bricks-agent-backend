const { model, Schema } = require("mongoose");

/**
 * DailyLog — the field staff's end-of-day site report.
 *
 * Posting one also drops a ProjectUpdate onto the feed so the client sees
 * activity without being shown the raw labour/cost detail. Ported from v2
 * collab.py add_daily_log.
 */

const LabourSchema = new Schema(
    {
        trade: { type: String, required: true },   // "mason", "helper", "carpenter"
        count: { type: Number, required: true, min: 0 },
        hours: { type: Number, default: 8 },

        // Optional override for the day. Left at 0, the log is valued against
        // the builder's configured WageRate for the trade, which is the normal
        // path — supervisors count heads, builders set rates. Set it only when
        // someone was genuinely paid differently that day.
        rate: { type: Number, default: 0, min: 0 },
    },
    { _id: false }
);

const MaterialSchema = new Schema(
    {
        name:     { type: String, required: true },
        quantity: { type: String, default: "" },   // free text: "20 bags", "2 trips"
        note:     { type: String, default: "" },
    },
    { _id: false }
);

const dailyLogSchema = new Schema(
    {
        project_id: { type: Schema.Types.ObjectId, ref: "project", required: true, index: true },

        log_date: { type: Date, required: true, index: true },

        weather: {
            type: String,
            enum: ["clear", "cloudy", "rain", "storm", "extreme_heat"],
            default: "clear",
        },

        labour:        { type: [LabourSchema], default: [] },
        total_workers: { type: Number, default: 0 },   // derived on save

        materials: { type: [MaterialSchema], default: [] },

        work_done: { type: String, default: "" },
        issues:    { type: String, default: "" },   // non-empty ⇒ feed entry flagged as "delay"

        images: { type: [String], default: [] },    // Cloudinary secure_urls

        author_id:         { type: Schema.Types.ObjectId, ref: "user" },
        author_name:       { type: String, default: "" },
        author_staff_type: { type: String, default: "" },

        is_delete: { type: Number, enum: [0, 1], default: 0 },
    },
    { timestamps: true }
);

// One log per person per day per project — prevents accidental double posts.
dailyLogSchema.index({ project_id: 1, log_date: 1, author_id: 1 }, { unique: true });

dailyLogSchema.pre("save", function (next) {
    this.total_workers = (this.labour || []).reduce((sum, l) => sum + (Number(l.count) || 0), 0);
    next();
});

module.exports = model("dailylog", dailyLogSchema);
