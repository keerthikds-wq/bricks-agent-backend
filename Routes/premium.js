const { express, app } = require('../config');
const router = express.Router();
const { userAuth, adminAuth } = require("../Utils");
const { addpremium, getPremiumbyUser, deletePremium } = require('../Controller/premium');
const { createBuyerOrder, verifyBuyerPayment } = require('../Controller/razorpay_subscription');

// Legacy: direct add (kept for backward compat)
router.post('/add-premium', userAuth, addpremium);

// Secure Razorpay subscription flow for buyers
router.post('/create-order',   userAuth, createBuyerOrder);
router.post('/verify-payment', userAuth, verifyBuyerPayment);

router.get('/get-premium/me',  userAuth, getPremiumbyUser);
router.delete('/delete-premium/:id', adminAuth, deletePremium);

module.exports = router;