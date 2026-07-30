const { model, Schema } = require("mongoose");

/**
 * WageRate — a builder's daily rate per trade.
 *
 * The daily log already recorded trade and headcount ("mason × 4"), but with no
 * rate attached there was nothing to multiply, so labour cost could not be
 * derived at all. Asking the site supervisor to type a rate into every log is
 * both slow and wrong — rates are a commercial decision the builder makes once,
 * not something a supervisor should be setting daily.
 *
 * So rates live here, per builder, and a log values itself against them. A log
 * may still carry an explicit per-row rate for the day someone is paid
 * differently; that always wins over the default.
 *
 * Rates change. Entries are versioned by `effective_from` and the log is valued
 * against the rate in force on the day the work happened — so re-pricing labour
 * next month does not silently rewrite last month's wage bill.
 */
const wageRateSchema = new Schema(
    {
        builder_id: { type: Schema.Types.ObjectId, ref: "user", required: true, index: true },

        /** Lowercased on save — logs arrive with "Mason", "mason", "MASON". */
        trade: { type: String, required: true, trim: true, lowercase: true },

        /** Rupees for a standard day (see standard_hours). */
        daily_rate: { type: Number, required: true, min: 0 },

        standard_hours: { type: Number, default: 8, min: 1 },

        /**
         * Overtime beyond standard_hours is paid pro-rata at this multiple.
         * 1 means no premium.
         */
        overtime_multiplier: { type: Number, default: 1, min: 1 },

        effective_from: { type: Date, required: true, default: () => new Date(0) },

        notes:     { type: String, default: "" },
        is_delete: { type: Number, enum: [0, 1], default: 0 },
    },
    { timestamps: true }
);

// Look up "this builder's rate for this trade, newest first".
wageRateSchema.index({ builder_id: 1, trade: 1, effective_from: -1 });

/**
 * The rate in force for a trade on a given date.
 *
 * Returns null rather than guessing when no rate is configured — a wage of zero
 * silently under-reports the cost of a build, which is worse than the app
 * saying plainly that a rate is missing.
 */
wageRateSchema.statics.rateFor = async function (builderId, trade, onDate) {
    if (!trade) return null;
    return this.findOne({
        builder_id: builderId,
        trade: String(trade).toLowerCase().trim(),
        is_delete: 0,
        effective_from: { $lte: onDate || new Date() },
    })
        .sort({ effective_from: -1 })
        .lean();
};

module.exports = model("wagerate", wageRateSchema);
