const { model, Schema } = require("mongoose");

/**
 * Worker — a named person on the builder's labour roster.
 *
 * Daily logs record "mason × 4". That is enough to cost a day and nothing else.
 * It cannot answer "was Ramesh on site on Tuesday", cannot tell you who to pay
 * how much, and cannot show a worker their own record — all of which are things
 * a builder and their crew ask constantly.
 *
 * ── Why a roster rather than a User ──────────────────────────────────────────
 *
 * These people mostly do not have the app. A daily-wage mason is not going to
 * install software and accept an invite so that his attendance can be marked;
 * the supervisor marks it for him. Forcing a User account per worker would mean
 * either fake accounts or no attendance at all.
 *
 * So a Worker is a record the builder owns, with no login. If that person later
 * does join the app, `user_id` links the two without duplicating the history.
 */
const workerSchema = new Schema(
    {
        builder_id: { type: Schema.Types.ObjectId, ref: "user", required: true, index: true },

        name:  { type: String, required: true, trim: true },
        phone: { type: String, default: "", trim: true },

        /** Matches WageRate.trade, and lowercased for the same reason. */
        trade: { type: String, required: true, trim: true, lowercase: true },

        /**
         * Overrides the trade's rate for this person only.
         *
         * Null, not zero. Zero is a real rate a builder could legitimately set
         * (an owner's relative working unpaid), and it must be distinguishable
         * from "no override, use the trade rate".
         */
        daily_rate: { type: Number, default: null, min: 0 },

        /**
         * Sites this worker is normally on. Not a hard restriction — attendance
         * validates against the project it is posted to — it only decides who
         * appears first when marking a day.
         */
        project_ids: [{ type: Schema.Types.ObjectId, ref: "project" }],

        /** Set when the person later signs up, so history stays in one place. */
        user_id: { type: Schema.Types.ObjectId, ref: "user", default: null },

        active:    { type: Boolean, default: true },
        notes:     { type: String, default: "" },
        is_delete: { type: Number, enum: [0, 1], default: 0 },
    },
    { timestamps: true }
);

// The roster picker: this builder's active people, by trade.
workerSchema.index({ builder_id: 1, active: 1, trade: 1 });

module.exports = model("worker", workerSchema);
