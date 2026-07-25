const { model, Schema } = require("mongoose");

/**
 * SubscriptionLog — audit trail of subscription payments.
 *
 * NOTE: this file previously read `type: new Date` and `default: new Date.now()`.
 * `Date.now` is a function, not a constructor, so `new Date.now()` throws a
 * TypeError at require time — the model could never be loaded and any route
 * that touched it would have crashed the process. Fixed to `type: Date` /
 * `default: Date.now`, and extended with the builder-plan fields written by
 * Controller/builder_subscription.js.
 */
const subscriptionSchema = new Schema(
    {
        // ── Legacy marketplace fields (kept for existing rows) ───────────────
        subscription: {
            type: Schema.Types.ObjectId,
            ref: 'subscription'
        },
        user: {
            type: Schema.Types.ObjectId,
            ref: 'user'
        },
        expiry: {
            type: Date,
            default: Date.now
        },

        // ── Builder subscription (builder-centric merge) ──────────────────────
        user_id: {
            type: Schema.Types.ObjectId,
            ref: 'user',
            index: true
        },
        plan: {
            type: String,
            enum: ['trial', 'starter', 'pro'],
        },
        amount: {
            type: Number,          // INR
            default: 0
        },
        razorpay_order_id:   { type: String, default: '' },
        razorpay_payment_id: { type: String, default: '' },
        expires_at:          { type: Date },

        is_delete: {
            type: Number,
            enum: [0, 1],
            default: 0
        }
    },
    { timestamps: true });

module.exports = model("subscriptionlog", subscriptionSchema);
