const express = require('express');
const router  = express.Router();
const ctrl    = require('../Controller/price_trend');
const { adminAuth } = require('../Middleware');

// Public - no auth required (buyers, builders, masons all use these)
router.get('/alerts',      ctrl.getPriceAlerts);  // buy-now / wait signals
router.get('/all-current', ctrl.getAllCurrent);
router.get('/materials',   ctrl.getMaterials);
router.get('/',            ctrl.getTrend);

// Admin-only: manually add a price correction / override
router.post('/', adminAuth, ctrl.addPricePoint);

module.exports = router;
