const { app, express } = require('../config');
const router = express.Router();
const upload = require("../Utils/multer")

const { loginUser, signupUser, registerUser, emailVerify, otpVerify, otpVerifyLogin, logout } = require("../Controller/login");

router.post('/login', loginUser);

// Unified registration — one account type chosen at signup (builder | client).
// Replaces the separate seller / builder / masonry signups. Profile image is
// optional, so `upload.single` is tolerant of a body with no file.
router.post('/register', upload.single("profile"), registerUser);

// Legacy: created a buyer with a MANDATORY profile image and no role. Kept so
// old installs do not hard-fail, but new clients must use /register.
router.post('/sign-up',upload.single("profile"), signupUser);
// router.post('/forgot-password', forgotPassword);
router.post('/email-verify', emailVerify);
// router.post('/change-password', changePassword);
router.post('/otp-verify', otpVerify);
router.post('/login/otp-verify', otpVerifyLogin);
router.post("/logout", logout);
module.exports = router;