const { express, app } = require('../config');

const router = express.Router();

router.use('/auth', require("./login"));
router.use('/admin', require("./login-admin"));
router.use('/seller', require("./login-seller"));
router.use('/user', require("./user"));
router.use('/admin', require("./admin"));
router.use('/seller', require("./seller"));
router.use('/category', require("./category"));
router.use('/subcategory', require("./subcategory"));
router.use('/brand', require("./brand"));
router.use('/product', require("./product"));
router.use('/order', require("./order"));
router.use('/supports', require("./support"));
router.use('/user-supports', require("./user_support"));
router.use('/packages', require("./package"));
router.use('/premiums', require("./premium"));
router.use('/seller-premiums', require("./sellerpremium"));
router.use('/push-notification', require("./pushnotification"));
/* router.use('/push-seller-notification', require("./seller_push")); */
router.use('/bid', require("./bid"));
router.use('/requirement', require("./requirement"));
router.use('/masonry',          require("./masonry"));
router.use('/masonry-premiums',  require("./masonry_premium"));
router.use('/builder-premiums', require("./builder_premium"));
router.use('/builder',          require("./builder"));
router.use('/boq',              require("./boq"));
router.use('/rfq',              require("./rfq"));
router.use('/price-trends',     require("./price_trend"));
router.use('/reviews',          require("./review"));
router.use('/inventory',        require("./inventory"));
router.use('/wishlist',         require("./wishlist"));
router.use('/timelines',          require("./project_timeline"));
router.use('/prof-notifications',  require("./professional_notification"));
router.use('/ai',                  require("./ai_assistant"));

module.exports = router;
