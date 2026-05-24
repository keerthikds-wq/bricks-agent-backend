const express   = require('express');
const router    = express.Router();
const { builderAuth, adminAuth } = require('../Middleware');
const {
    createBuilderOrder,
    verifyBuilderPayment,
} = require('../Controller/razorpay_subscription');

const { getPremiumbyUser, addpremium, deletePremium } = require('../Controller/premium');

router.post('/add-premium',     builderAuth, addpremium);
router.post('/create-order',    builderAuth, createBuilderOrder);
router.post('/verify-payment',  builderAuth, verifyBuilderPayment);
router.get('/get-premium/me',   builderAuth, getPremiumbyUser);
router.delete('/delete-premium/:id', adminAuth, deletePremium);

module.exports = router;
