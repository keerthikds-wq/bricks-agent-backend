const { app, express } = require('../config');
const router = express.Router();
const upload = require("../Utils/multer");

const {
    loginUser, signupUser, emailVerify, otpVerify, otpVerifyLogin,
    refreshAccessToken, logoutDevice, logout,
} = require("../Controller/login");

router.post('/login', loginUser);
router.post('/sign-up', upload.single("profile"), signupUser);
router.post('/email-verify', emailVerify);
router.post('/otp-verify', otpVerify);
router.post('/login/otp-verify', otpVerifyLogin);

// Session management — no OTP, no charge
// Single endpoint handles all user types (user/builder/seller/masonry) via user_type stored in RefreshToken
router.post('/refresh', refreshAccessToken);
router.post('/logout-device', logoutDevice);

router.post("/logout", logout);
module.exports = router;
