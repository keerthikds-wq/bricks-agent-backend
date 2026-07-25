const { model, Schema } = require("mongoose");

/**
 * ProjectPayment — the money ledger between builder and client.
 *
 * Distinct from Order (marketplace material purchases) and from
 * SubscriptionLog (what the builder pays US). This is stage-payment
 * tracking on a build: "Foundation complete — ₹2,00,000 due".
 *
 * Marking one paid increments Project.spent.
 */
const projectPaymentSchema = new Schema(
    {
        project_id: { type: Schema.Types.ObjectId, ref: "project", required: true, index: true },

        amount:  { type: Number, required: true, min: 0 },
        purpose: { type: String, required: true, trim: true },
        notes:   { type: String, default: "" },

        due_date: { type: Date },

        status: {
            type: String,
            enum: ["pending", "paid", "cancelled"],
            default: "pending",
            index: true,
        },

        // ── Razorpay (real, not mocked — reuses the live keys) ───────────────
        razorpay_order_id:   { type: String, default: "" },
        razorpay_payment_id: { type: String, default: "" },
        paid_at:             { type: Date },
        paid_offline:        { type: Boolean, default: false },   // builder marked it received in cash

        raised_by: { type: Schema.Types.ObjectId, ref: "user" },
        is_delete: { type: Number, enum: [0, 1], default: 0 },
    },
    { timestamps: true }
);

projectPaymentSchema.index({ project_id: 1, status: 1 });

module.exports = model("projectpayment", projectPaymentSchema);
