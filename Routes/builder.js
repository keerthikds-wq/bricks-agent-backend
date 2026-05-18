const { express } = require('../config');
const router      = express.Router();
const upload      = require('../Utils/multer');

const { loginBuilder, signupBuilder, otpVerify, otpVerifyLogin } = require('../Controller/login-builder');
const { getBuilder, updateBuilder, getAllBuilders, deleteBuilder, searchNearby, updateFcmToken } = require('../Controller/builder');
const { adminAuth, builderAuth, verifyTokenwithAuthorization } = require('../Middleware');

// ── Auth routes ───────────────────────────────────────────────────────────────
router.post('/login',             loginBuilder);
router.post('/sign-up',           upload.single('profile'), signupBuilder);
router.post('/otp-verify',        otpVerify);
router.post('/login/otp-verify',  otpVerifyLogin);

// ── Discovery (public) ────────────────────────────────────────────────────────
// GET /api/builder/nearby?lat=12.9716&lng=77.5946&radius=50&project_type=residential
// Must be defined BEFORE /:id so "nearby" is not treated as an id
router.get('/nearby', searchNearby);

// ── FCM token update (builder auth) ───────────────────────────────────────────
// Must be defined BEFORE /:id
router.patch('/update-token', builderAuth, updateFcmToken);

// ── Admin routes ──────────────────────────────────────────────────────────────
router.get('/',    adminAuth, getAllBuilders);

// ── Per-builder routes ────────────────────────────────────────────────────────
router.get(   '/:id', verifyTokenwithAuthorization, getBuilder);
router.patch( '/:id', builderAuth,                  updateBuilder);
router.delete('/:id', adminAuth,                    deleteBuilder);

module.exports = router;
