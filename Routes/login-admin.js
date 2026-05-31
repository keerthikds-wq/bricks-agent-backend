const { express } = require('../config');
const router = express.Router();

const { loginAdmin, signupAdmin, forgotPassword, emailVerify, changePassword, otpVerify } = require("../Controller/login-admin");

// ── Email + password login (active) ──────────────────────────────────────────
router.post('/login',           loginAdmin);
router.post('/sign-up',         signupAdmin);
router.post('/change-password', changePassword);
router.post('/otp-verify',      otpVerify);

// ── Deprecated — return 410 ───────────────────────────────────────────────────
router.post('/forgot-password', forgotPassword);
router.post('/email-verify',    emailVerify);

// ── Coming soon ───────────────────────────────────────────────────────────────
// TODO: router.post('/whatsapp-login', whatsappLogin);

module.exports = router;
