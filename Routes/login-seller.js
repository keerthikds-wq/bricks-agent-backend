const { app, express } = require('../config');
const router = express.Router();
const upload = require("../Utils/multer")

const { loginSeller, signupSeller, emailVerify, otpVerify,otpVerifyLogin, logout } = require("../Controller/login-seller");

router.post('/login', loginSeller);
router.post('/sign-up',upload.single("profile"), signupSeller);
// router.post('/forgot-password', forgotPassword);
router.post('/email-verify', emailVerify);
// router.post('/change-password', changePassword);
router.post('/otp-verify', otpVerify);
router.post('/login/otp-verify', otpVerifyLogin);
router.post("/logout", logout);
module.exports = router;