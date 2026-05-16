const { express, app } = require('../config');
const router = express.Router();
const { sellerAuth, adminAuth } = require("../Utils");
const { addpremium, getPremiumbyUser, deletePremium } = require('../Controller/sellerpremium');
const { createSellerOrder, verifySellerPayment } = require('../Controller/razorpay_subscription');

// Legacy: direct add (kept for backward compat, no signature check)
router.post('/add-premium', sellerAuth, addpremium);

// Secure Razorpay subscription flow
router.post('/create-order',    sellerAuth, createSellerOrder);
router.post('/verify-payment',  sellerAuth, verifySellerPayment);

router.get('/get-premium/me',   sellerAuth, getPremiumbyUser);
router.delete('/delete-premium/:id', adminAuth, deletePremium);

module.exports = router;