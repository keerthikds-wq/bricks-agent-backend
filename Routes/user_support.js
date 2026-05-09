const { express, app } = require('../config');
const router = express.Router();
const { auth,userAuth,adminAuth } = require("../Utils");
const {getSupport,sendSupport,getSupportByUser } = require('../Controller/support_user');


router.post('/send-support',userAuth, sendSupport);
router.get('/get-support', adminAuth, getSupport);
router.get('/get-support/me', userAuth, getSupportByUser);


module.exports = router;