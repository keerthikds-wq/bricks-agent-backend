const crypto = require("crypto");
const User = require("../Model/User");
const SubscriptionLog = require("../Model/SubscriptionLog");
const { PLANS, publicPlans, getStatus, TRIAL_DAYS } = require("../Utils/subscription");
const { callerId } = require("../Middleware/projectAccess");

const ok   = (res, data, s = 200) => res.status(s).json({ success: true, data });
const fail = (res, s, message)    => res.status(s).json({ success: false, message });

/**
 * Builder subscription — the app's only paid product.
 *
 * Unlike Bricks_agent_v2's version (which minted fake order ids and accepted
 * any payload as proof of payment), this uses the real Razorpay SDK already in
 * this project's dependencies and verifies the HMAC signature before granting
 * anything.
 */

let _rzp = null;
function razorpay() {
    if (_rzp) return _rzp;
    const Razorpay = require("razorpay");
    const key_id = process.env.RAZORPAY_KEY_ID;
    const key_secret = process.env.RAZORPAY_KEY_SECRET;
    if (!key_id || !key_secret) {
        const e = new Error("Payments are not configured on the server.");
        e.status = 503;
        throw e;
    }
    _rzp = new Razorpay({ key_id, key_secret });
    return _rzp;
}

// GET /api/builder-subscription
exports.mySubscription = async (req, res) => {
    try {
        const user = await User.findById(callerId(req));
        if (!user) return fail(res, 404, "User not found");
        return ok(res, { subscription: await getStatus(user), plans: publicPlans() });
    } catch (err) {
        console.error("mySubscription error:", err);
        return fail(res, 500, "Server error");
    }
};

// POST /api/builder-subscription/create-order   { plan: "starter" | "pro" }
exports.createOrder = async (req, res) => {
    try {
        const user = await User.findById(callerId(req));
        if (!user) return fail(res, 404, "User not found");
        if (user.role !== "builder") return fail(res, 403, "Only builder accounts can subscribe");

        const plan = PLANS[req.body.plan];
        if (!plan || req.body.plan === "trial") return fail(res, 400, "Choose a valid plan");

        const order = await razorpay().orders.create({
            amount:   plan.price_inr * 100,        // paise
            currency: "INR",
            receipt:  `sub_${user._id.toString().slice(-8)}_${Date.now().toString().slice(-6)}`,
            notes:    { user_id: user._id.toString(), plan: plan.key },
        });

        return ok(res, {
            order,
            plan: plan.key,
            plan_label: plan.label,
            amount_inr: plan.price_inr,
            duration_days: plan.duration_days,
            key_id: process.env.RAZORPAY_KEY_ID,
            prefill: { name: user.name, contact: user.phone, email: user.email || "" },
        });
    } catch (err) {
        console.error("createOrder error:", err);
        return fail(res, err.status || 500, err.message || "Server error");
    }
};

// POST /api/builder-subscription/verify
exports.verify = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan: planKey } = req.body;
        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return fail(res, 400, "Incomplete payment details");
        }

        const plan = PLANS[planKey];
        if (!plan || planKey === "trial") return fail(res, 400, "Choose a valid plan");

        // Real signature verification — this is the step v2 skipped entirely.
        const expected = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest("hex");

        if (expected !== razorpay_signature) {
            return fail(res, 400, "Payment could not be verified");
        }

        const user = await User.findById(callerId(req));
        if (!user) return fail(res, 404, "User not found");

        // Extend from the current expiry if still active, else start now.
        const now = new Date();
        const currentExpiry = user.plan_expires_at ? new Date(user.plan_expires_at) : null;
        const start = currentExpiry && currentExpiry > now ? currentExpiry : now;
        const expiresAt = new Date(start.getTime() + plan.duration_days * 86400000);

        user.plan = plan.key;
        user.plan_expires_at = expiresAt;
        user.subscription_tier = "builder_pro";       // legacy field, kept in sync
        user.subscription_expires_at = expiresAt;
        await user.save();

        try {
            await SubscriptionLog.create({
                user_id: user._id,
                plan: plan.key,
                amount: plan.price_inr,
                razorpay_order_id,
                razorpay_payment_id,
                expires_at: expiresAt,
            });
        } catch (e) {
            // Log shape varies across the legacy admin panel — never fail the
            // upgrade because the audit row didn't fit.
            console.error("SubscriptionLog write (non-fatal):", e.message);
        }

        return ok(res, { subscription: await getStatus(user) });
    } catch (err) {
        console.error("verify error:", err);
        return fail(res, err.status || 500, err.message || "Server error");
    }
};

// POST /api/builder-subscription/start-trial
exports.startTrial = async (req, res) => {
    try {
        const user = await User.findById(callerId(req));
        if (!user) return fail(res, 404, "User not found");
        if (user.role !== "builder") return fail(res, 403, "Only builders have trials");
        if (user.trial_started_at) {
            return fail(res, 400, "Your free trial has already been used.");
        }

        user.trial_started_at = new Date();
        user.plan = "trial";
        user.plan_expires_at = new Date(Date.now() + TRIAL_DAYS * 86400000);
        await user.save();

        return ok(res, { subscription: await getStatus(user) });
    } catch (err) {
        console.error("startTrial error:", err);
        return fail(res, 500, "Server error");
    }
};

// GET /api/builder-subscription/history
exports.history = async (req, res) => {
    try {
        const items = await SubscriptionLog.find({ user_id: callerId(req) })
            .sort({ createdAt: -1 }).limit(50).lean();
        return ok(res, items);
    } catch (err) {
        console.error("history error:", err);
        return fail(res, 500, "Server error");
    }
};
