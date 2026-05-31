const { express } = require('../config');
const router = express.Router();
const upload = require("../Utils/multer");

const { loginUser, signupUser, emailVerify, otpVerify, otpVerifyLogin, logout } = require("../Controller/login");

// ── Mobile OTP login (active) ─────────────────────────────────────────────────
router.post('/login',            loginUser);
router.post('/sign-up',          upload.single("profile"), signupUser);
router.post('/otp-verify',       otpVerify);
router.post('/login/otp-verify', otpVerifyLogin);
router.post('/logout',           logout);

// ── Deprecated — returns 410 ──────────────────────────────────────────────────
router.post('/email-verify',     emailVerify);

// ── Coming soon ───────────────────────────────────────────────────────────────
// TODO: router.post('/whatsapp-login', whatsappLogin);
// TODO: router.post('/whatsapp-verify', whatsappVerify);

module.exports = router;
