const { express } = require('../config');
const router      = express.Router();
const upload      = require('../Utils/multer');

const { loginMasonry, signupMasonry, otpVerify, otpVerifyLogin } = require('../Controller/login-masonry');
const { getMasonry, updateMasonry, getAllMasonry, deleteMasonry, searchNearby, updateFcmToken } = require('../Controller/masonry');
const { adminAuth, masonryAuth, verifyTokenwithAuthorization } = require('../Middleware');

// ── Auth routes ───────────────────────────────────────────────────────────────
router.post('/login',             loginMasonry);
router.post('/sign-up',           upload.single('profile'), signupMasonry);
router.post('/otp-verify',        otpVerify);
router.post('/login/otp-verify',  otpVerifyLogin);

// ── Discovery (public) ────────────────────────────────────────────────────────
// GET /api/masonry/nearby?lat=12.9716&lng=77.5946&radius=15&specialization=brickwork
// Must be defined BEFORE /:id so "nearby" is not treated as an id
router.get('/nearby', searchNearby);

// ── FCM token update (masonry auth) ───────────────────────────────────────────
// Must be defined BEFORE /:id
router.patch('/update-token', masonryAuth, updateFcmToken);

// ── Admin routes ──────────────────────────────────────────────────────────────
router.get('/',    adminAuth, getAllMasonry);

// ── Per-contractor routes ─────────────────────────────────────────────────────
router.get(   '/:id', verifyTokenwithAuthorization, getMasonry);
router.patch( '/:id', masonryAuth,                  updateMasonry);
router.delete('/:id', adminAuth,                    deleteMasonry);

module.exports = router;
