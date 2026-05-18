const Razorpay        = require('razorpay');
const crypto          = require('crypto');
const { StatusCodes } = require('http-status-codes');
const SellerPremium   = require('../Model/sellerpremium');
const BuyerPremium    = require('../Model/premium');
const MasonryPremium  = require('../Model/MasonryPremium');
const Package         = require('../Model/Package');

const razorpay = new Razorpay({
    key_id:     process.env.RAZORPAY_KEY_ID     || 'rzp_test_Rjse3RiytiS7dE',
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'REPLACE_WITH_YOUR_SECRET',
});

function _verifySignature(orderId, paymentId, signature) {
    const body     = orderId + '|' + paymentId;
    const expected = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'REPLACE_WITH_YOUR_SECRET')
        .update(body)
        .digest('hex');
    return expected === signature;
}

// POST /api/seller-premiums/create-order
exports.createSellerOrder = async (req, res) => {
    const { months, packageID } = req.body;
    if (!months || months < 1) {
        return res.status(StatusCodes.BAD_REQUEST).json({ error: true, message: 'months is required' });
    }
    try {
        let amountPaise;
        if (packageID) {
            const pkg = await Package.findById(packageID);
            amountPaise = pkg ? (pkg.complete || pkg.single) * 100 : months * 69900;
        } else {
            amountPaise = months * 69900;
        }
        const order = await razorpay.orders.create({
            amount:   amountPaise,
            currency: 'INR',
            receipt:  'seller_' + req.user.id + '_' + Date.now(),
            notes: { sellerId: req.user.id.toString(), months: months.toString(), type: 'seller_subscription' },
        });
        return res.status(StatusCodes.CREATED).json({
            error: false, order_id: order.id, amount: order.amount,
            currency: order.currency, key: process.env.RAZORPAY_KEY_ID || 'rzp_test_Rjse3RiytiS7dE',
        });
    } catch (err) {
        console.error('createSellerOrder error:', err);
        return res.status(500).json({ error: true, message: err.message });
    }
};

// POST /api/seller-premiums/verify-payment
exports.verifySellerPayment = async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, months, packageID } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(StatusCodes.BAD_REQUEST).json({ error: true, message: 'Missing payment verification fields' });
    }
    if (!_verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
        return res.status(StatusCodes.UNAUTHORIZED).json({ error: true, message: 'Payment verification failed -- invalid signature' });
    }
    try {
        const m = Number(months) || 1;
        const now = new Date();
        const endDate = new Date(now);
        endDate.setDate(endDate.getDate() + m * 30);
        const premium = await SellerPremium.create({
            plan_type:       m + ' month' + (m > 1 ? 's' : ''),
            purchase_date:   now,
            total_cost:      req.body.amount ? req.body.amount / 100 : m * 699,
            plan_start_date: now,
            plan_end_date:   endDate,
            payment_id:      razorpay_payment_id,
            message:         'Your ' + m + '-month seller subscription is active!',
            userID:          req.user.id,
            packageID:       packageID || undefined,
        });
        return res.status(StatusCodes.CREATED).json({ error: false, message: 'Subscription activated successfully', data: premium });
    } catch (err) {
        console.error('verifySellerPayment error:', err);
        return res.status(500).json({ error: true, message: err.message });
    }
};

// POST /api/premiums/create-order (buyers)
exports.createBuyerOrder = async (req, res) => {
    const { months, packageID } = req.body;
    if (!months || months < 1) {
        return res.status(StatusCodes.BAD_REQUEST).json({ error: true, message: 'months is required' });
    }
    try {
        let amountPaise;
        if (packageID) {
            const pkg = await Package.findById(packageID);
            amountPaise = pkg ? (pkg.complete || pkg.single) * 100 : months * 19900;
        } else {
            amountPaise = months * 19900;
        }
        const order = await razorpay.orders.create({
            amount:   amountPaise,
            currency: 'INR',
            receipt:  'buyer_' + req.user.id + '_' + Date.now(),
            notes: { buyerId: req.user.id.toString(), months: months.toString(), type: 'buyer_subscription' },
        });
        return res.status(StatusCodes.CREATED).json({
            error: false, order_id: order.id, amount: order.amount,
            currency: order.currency, key: process.env.RAZORPAY_KEY_ID || 'rzp_test_Rjse3RiytiS7dE',
        });
    } catch (err) {
        console.error('createBuyerOrder error:', err);
        return res.status(500).json({ error: true, message: err.message });
    }
};

// POST /api/premiums/verify-payment (buyers)
exports.verifyBuyerPayment = async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, months, packageID } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(StatusCodes.BAD_REQUEST).json({ error: true, message: 'Missing payment verification fields' });
    }
    if (!_verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
        return res.status(StatusCodes.UNAUTHORIZED).json({ error: true, message: 'Payment verification failed -- invalid signature' });
    }
    try {
        const m   = Number(months) || 1;
        const now = new Date();
        const end = new Date(now);
        end.setDate(end.getDate() + m * 30);
        const premium = await BuyerPremium.create({
            plan_type:       m + ' month' + (m > 1 ? 's' : ''),
            purchase_date:   now,
            total_cost:      req.body.amount ? req.body.amount / 100 : m * 199,
            plan_start_date: now,
            plan_end_date:   end,
            payment_id:      razorpay_payment_id,
            message:         'Your ' + m + '-month buyer subscription is active!',
            userID:          req.user.id,
            packageID:       packageID || undefined,
        });
        return res.status(StatusCodes.CREATED).json({ error: false, message: 'Buyer subscription activated successfully', data: premium });
    } catch (err) {
        console.error('verifyBuyerPayment error:', err);
        return res.status(500).json({ error: true, message: err.message });
    }
};

// POST /api/masonry-premiums/create-order
exports.createMasonryOrder = async (req, res) => {
    const { months, packageID } = req.body;
    if (!months || months < 1) {
        return res.status(StatusCodes.BAD_REQUEST).json({ error: true, message: 'months is required' });
    }
    try {
        let amountPaise;
        if (packageID) {
            const pkg = await Package.findById(packageID);
            amountPaise = pkg ? (pkg.complete || pkg.single) * 100 : months * 39900;
        } else {
            amountPaise = months * 39900;
        }
        const order = await razorpay.orders.create({
            amount:   amountPaise,
            currency: 'INR',
            receipt:  'masonry_' + req.user.id + '_' + Date.now(),
            notes: { masonryId: req.user.id.toString(), months: months.toString(), type: 'masonry_subscription' },
        });
        return res.status(StatusCodes.CREATED).json({
            error: false, order_id: order.id, amount: order.amount,
            currency: order.currency, key: process.env.RAZORPAY_KEY_ID || 'rzp_test_Rjse3RiytiS7dE',
        });
    } catch (err) {
        console.error('createMasonryOrder error:', err);
        return res.status(500).json({ error: true, message: err.message });
    }
};

// POST /api/masonry-premiums/verify-payment
exports.verifyMasonryPayment = async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, months, packageID } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(StatusCodes.BAD_REQUEST).json({ error: true, message: 'Missing payment verification fields' });
    }
    if (!_verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
        return res.status(StatusCodes.UNAUTHORIZED).json({ error: true, message: 'Payment verification failed -- invalid signature' });
    }
    try {
        const m       = Number(months) || 1;
        const now     = new Date();
        const endDate = new Date(now);
        endDate.setDate(endDate.getDate() + m * 30);
        const premium = await MasonryPremium.create({
            plan_type:       m + ' month' + (m > 1 ? 's' : ''),
            purchase_date:   now,
            total_cost:      req.body.amount ? req.body.amount / 100 : m * 399,
            plan_start_date: now,
            plan_end_date:   endDate,
            payment_id:      razorpay_payment_id,
            message:         'Your ' + m + '-month masonry subscription is active!',
            userID:          req.user.id,
            packageID:       packageID || undefined,
        });
        return res.status(StatusCodes.CREATED).json({ error: false, message: 'Masonry subscription activated successfully', data: premium });
    } catch (err) {
        console.error('verifyMasonryPayment error:', err);
        return res.status(500).json({ error: true, message: err.message });
    }
};
