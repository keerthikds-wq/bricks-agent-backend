const { express, app } = require('../config');
const router = express.Router();
//const { auth } = require("../Utils");
const { sellerAuth,adminAuth,verifyTokenwithAuthorization } = require("../Utils");
const {getSupport,sendSupport,getSupportByUser } = require('../Controller/support');


router.post('/send-support',sellerAuth, sendSupport);
router.get('/get-support', adminAuth, getSupport);
router.get('/get-support/me', sellerAuth, getSupportByUser);


module.exports = router;