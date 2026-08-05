const { app, express } = require('../config');
const router = express.Router();
const upload = require("../Utils/multer")

const { loginUser, signupUser, registerUser, emailVerify, otpVerify, otpVerifyLogin, logout } = require("../Controller/login");

router.post('/login', loginUser);

// ── Firebase Phone Auth ──────────────────────────────────────────────────────
//
// The handset proves it owns the number to Firebase; these two verify the token
// it comes back with. Both take the phone from the VERIFIED token and ignore
// any phone in the body — see Controller/firebase_auth.js for why that single
// rule is the whole security of this door.
const fb = require("../Controller/firebase_auth");
router.post('/firebase', fb.firebaseLogin);
router.post('/firebase/register', fb.firebaseRegister);

// Ending a session, unlike starting one, requires already having it.
const { Auth } = require("../Middleware");
const attachRole = require("../Middleware/attachRole");
router.post('/signout', Auth, attachRole, fb.signOut);

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