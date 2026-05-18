const { express } = require('../config');
const router = express.Router();
const { masonryAuth, adminAuth } = require('../Middleware');
const { addpremium, getPremiumbyUser, deletePremium } = require('../Controller/masonry_premium');
const { createMasonryOrder, verifyMasonryPayment } = require('../Controller/razorpay_subscription');

// Legacy: direct add (kept for backward compat, no Razorpay signature check)
router.post('/add-premium',     masonryAuth, addpremium);

// Secure Razorpay subscription flow
router.post('/create-order',    masonryAuth, createMasonryOrder);
router.post('/verify-payment',  masonryAuth, verifyMasonryPayment);

router.get('/get-premium/me',   masonryAuth, getPremiumbyUser);
router.delete('/delete-premium/:id', adminAuth, deletePremium);

module.exports = router;
