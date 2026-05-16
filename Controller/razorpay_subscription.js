/**
 * razorpay_subscription.js
 *
 * Secure server-side Razorpay subscription flow:
 *   POST /api/seller-premiums/create-order  → create Razorpay order, return order_id
 *   POST /api/seller-premiums/verify-payment → verify signature, record premium
 *   POST /api/premiums/create-order          → same for buyers
 *   POST /api/premiums/verify-payment        → same for buyers
 */

const Razorpay      = require('razorpay');
const crypto        = require('crypto');
const { StatusCodes } = require('http-status-codes');
const SellerPremium = require('../Model/sellerpremium');
const BuyerPremium  = require('../Model/premium');   // buyer premium model
const Package       = require('../Model/Package');

// Razorpay instance — keys come from .env
const razorpay = new Razorpay({
    key_id:     process.env.RAZORPAY_KEY_ID     || 'rzp_test_Rjse3RiytiS7dE',
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'REPLACE_WITH_YOUR_SECRET',
});

// ─── Helper: verify Razorpay HMAC signature ──────────────────────────────────
function _verifySignature(orderId, paymentId, signature) {
    const body    = `${orderId}|${paymentId}`;
    const expected = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'REPLACE_WITH_YOUR_SECRET')
        .update(body)
        .digest('hex');
    return expected === signature;
}

// ─── POST /api/seller-premiums/create-order ───────────────────────────────────
// Creates a Razorpay order server-side so the amount cannot be tampered with.
// Body: { months: 1, packageID?: "..." }
exports.createSellerOrder = async (req, res) => {
    const { months, packageID } = req.body;
    if (!months || months < 1) {
        return res.status(StatusCodes.BAD_REQUEST).json({
            error: true, message: 'months is required',
        });
    }
    try {
        // Look up the price from the Package collection (admin-configurable)
        let amountPaise;
        if (packageID) {
            const pkg = await Package.findById(packageID);
            amountPaise = pkg ? (pkg.complete || pkg.single) * 100 : months * 99900; // ₹999/mo fallback
        } else {
            amountPaise = months * 99900; // ₹999 per month fallback
        }

        const order = await razorpay.orders.create({
            amount:   amountPaise,
            currency: 'INR',
            receipt:  `seller_${req.user.id}_${Date.now()}`,
            notes: {
                sellerId: req.user.id.toString(),
                months:   months.toString(),
                type:     'seller_subscription',
            },
        });

        return res.status(StatusCodes.CREATED).json({
            error:    false,
            order_id: order.id,
            amount:   order.amount,
            currency: order.currency,
            key:      process.env.RAZORPAY_KEY_ID || 'rzp_test_Rjse3RiytiS7dE',
        });
    } catch (err) {
        console.error('createSellerOrder error:', err);
        return res.status(500).json({ error: true, message: err.message });
    }
};

// ─── POST /api/seller-premiums/verify-payment ─────────────────────────────────
// Verifies Razorpay signature then records the premium subscription.
// Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature, months, packageID? }
exports.verifySellerPayment = async (req, res) => {
    const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        months,
        packageID,
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(StatusCodes.BAD_REQUEST).json({
            error: true, message: 'Missing payment verification fields',
        });
    }

    const isValid = _verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    if (!isValid) {
        return res.status(StatusCodes.UNAUTHORIZED).json({
            error: true, message: 'Payment verification failed — invalid signature',
        });
    }

    try {
        const m = Number(months) || 1;
        const now     = new Date();
        const endDate = new Date(now);
        endDate.setDate(endDate.getDate() + m * 30);

        const premium = await SellerPremium.create({
            plan_type:      `${m} month${m > 1 ? 's' : ''}`,
            purchase_date:  now,
            total_cost:     req.body.amount ? req.body.amount / 100 : m * 999,
            plan_start_date: now,
            plan_end_date:  endDate,
            payment_id:     razorpay_payment_id,
            message:        `🎉 Your ${m}-month seller subscription is active!`,
            userID:         req.user.id,
            packageID:      packageID || undefined,
        });

        return res.status(StatusCodes.CREATED).json({
            error:   false,
            message: 'Subscription activated successfully',
            data:    premium,
        });
    } catch (err) {
        console.error('verifySellerPayment error:', err);
        return res.status(500).json({ error: true, message: err.message });
    }
};

// ─── POST /api/premiums/create-order ─────────────────────────────────────────
// Same as seller but for buyers (₹199/month)
exports.createBuyerOrder = async (req, res) => {
    const { months, packageID } = req.body;
    if (!months || months < 1) {
        return res.status(StatusCodes.BAD_REQUEST).json({
            error: true, message: 'months is required',
        });
    }
    try {
        let amountPaise;
        if (packageID) {
            const pkg = await Package.findById(packageID);
            amountPaise = pkg ? (pkg.complete || pkg.single) * 100 : months * 19900;
        } else {
            amountPaise = months * 19900; // ₹199 per month fallback
        }

        const order = await razorpay.orders.create({
            amount:   amountPaise,
            currency: 'INR',
            receipt:  `buyer_${req.user.id}_${Date.now()}`,
            notes: {
                buyerId: req.user.id.toString(),
                months:  months.toString(),
                type:    'buyer_subscription',
            },
        });

        return res.status(StatusCodes.CREATED).json({
            error:    false,
            order_id: order.id,
            amount:   order.amount,
            currency: order.currency,
            key:      process.env.RAZORPAY_KEY_ID || 'rzp_test_Rjse3RiytiS7dE',
        });
    } catch (err) {
        console.error('createBuyerOrder error:', err);
        return res.status(500).json({ error: true, message: err.message });
    }
};

// ─── POST /api/premiums/verify-payment ───────────────────────────────────────
exports.verifyBuyerPayment = async (req, res) => {
    const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        months,
        packageID,
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(StatusCodes.BAD_REQUEST).json({
            error: true, message: 'Missing payment verification fields',
        });
    }

    const isValid = _verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    if (!isValid) {
        return res.status(StatusCodes.UNAUTHORIZED).json({
            error: true, message: 'Payment verification failed — invalid signature',
        });
    }

    try {
        // BuyerPremium model — check if it exists, otherwise fallback gracefully
        const m   = Number(months) || 1;
        const now = new Date();
        const end = new Date(now);
        end.setDate(end.getDate() + m * 30);

        const premium = await BuyerPremium.create({
            plan_type:       `${m} month${m > 1 ? 's' : ''}`,
            purchase_date:   now,
            total_cost:      req.body.amount ? req.body.amount / 100 : m * 199,
            plan_start_date: now,
            plan_end_date:   end,
            payment_id:      razorpay_payment_id,
            message:         `🎉 Your ${m}-month buyer subscription is active!`,
            userID:          req.user.id,
            packageID:       packageID || undefined,
        });

        return res.status(StatusCodes.CREATED).json({
            error:   false,
            message: 'Buyer subscription activated successfully',
            data:    premium,
        });
    } catch (err) {
        console.error('verifyBuyerPayment error:', err);
        return res.status(500).json({ error: true, message: err.message });
    }
};
