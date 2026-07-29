const { express, app } = require('../config');

const router = express.Router();

/**
 * Retired auth silos.
 *
 * The app is builder-centric now: one account collection, one OTP login, and a
 * `role` (builder | client | field_staff | vendor) that decides what you see.
 * The separate seller / builder / masonry logins are what made the same person
 * need three accounts, and what caused the masonry lockout fixed in 8abda8d.
 *
 * These are answered rather than deleted: installs already on phones still
 * call them, and a 404 would read as "server broken" instead of "please
 * update". Mounted BEFORE the legacy routers so they win the match.
 *
 * Everything else on those routers (profiles, inventory, premium) is untouched
 * — only the auth doors are closed. See Middleware/retiredAuth.js for why they
 * are matched by shape instead of listed by name.
 */
const { retireAuthDoors } = require('../Middleware/retiredAuth');

// The legacy silos: every auth door closed, nothing else touched.
for (const silo of ['/seller', '/builder', '/masonry']) {
    router.use(silo, retireAuthDoors());
}

// The unified account keeps exactly the three doors the app calls. `/sign-up`
// and `/otp-verify` are the pre-merge pair — `/sign-up` minted a token without
// ever checking an OTP, so it closes with the rest.
router.use('/auth', retireAuthDoors({
    except: ['/login', '/login/otp-verify', '/register'],
}));

// Admin still signs in — the marketplace catalogue is published through it —
// but `/admin/sign-up` called Admin.create(req.body) behind no auth at all,
// which made a full admin account a single unauthenticated POST. Closed.
// Additional admins are a deliberate DB operation now, not a public endpoint.
router.use('/admin', retireAuthDoors({
    except: ['/login', '/otp-verify', '/forgot-password', '/change-password', '/email-verify'],
}));

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
router.use('/home-design',         require("./home_design"));
router.use('/design-gen',          require("./design_generation"));

// ── Builder-centric merge (v2) ───────────────────────────────────────────────
// Projects are the new spine: builders own them, clients / field staff /
// vendors are linked in. See MERGE_PLAN.md.
router.use('/materials',             require("./materials"));
router.use('/projects',              require("./project"));
router.use('/vendors',               require("./vendor_roster"));
router.use('/builder-subscription',  require("./builder_subscription"));
router.use('/project-notifications', require("./project_notification"));

module.exports = router;
