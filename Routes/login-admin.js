const { app, express } = require('../config');
const router = express.Router();

const { loginAdmin, signupAdmin, forgotPassword, emailVerify, changePassword, otpVerify } = require("../Controller/login-admin");

router.post('/login', loginAdmin);
router.post('/sign-up', signupAdmin);
router.post('/forgot-password', forgotPassword);
router.post('/email-verify', emailVerify);
router.post('/change-password', changePassword);
router.post('/otp-verify', otpVerify);

module.exports = router;