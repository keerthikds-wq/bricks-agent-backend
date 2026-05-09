const { app, express } = require('../config');
const router = express.Router();
const upload = require("../Utils/multer")

const { loginUser, signupUser, emailVerify, otpVerify, otpVerifyLogin, logout } = require("../Controller/login");

router.post('/login', loginUser);
router.post('/sign-up',upload.single("profile"), signupUser);
// router.post('/forgot-password', forgotPassword);
router.post('/email-verify', emailVerify);
// router.post('/change-password', changePassword);
router.post('/otp-verify', otpVerify);
router.post('/login/otp-verify', otpVerifyLogin);
router.post("/logout", logout);
module.exports = router;