const express   = require('express');
const router    = express.Router();
const ctrl      = require('../Controller/price_trend');
const { adminAuth } = require('../Middleware');

// Public (buyers, builders, masons can all view price trends)
router.get('/all-current', ctrl.getAllCurrent);
router.get('/materials',   ctrl.getMaterials);
router.get('/',            ctrl.getTrend);

// Admin-only: seed + add new price point
router.post('/seed',  adminAuth, ctrl.seedPriceTrends);
router.post('/',      adminAuth, ctrl.addPricePoint);

module.exports = router;
