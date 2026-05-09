const { express, app } = require('../config');
const router = express.Router();
//const { auth } = require("../Utils");
const {sellerAuth,verifyTokenwithAuthorization,userAuth,adminAuth } = require("../Utils");
const {addpremium,getPremiumbyUser,deletePremium } = require('../Controller/sellerpremium');


router.post('/add-premium',sellerAuth, addpremium);
 router.get('/get-premium/me',sellerAuth, getPremiumbyUser);
router.delete('/delete-premium/:id',adminAuth, deletePremium);
/*router.get('/get-support/me', sellerAuth, getSupportByUser); */


module.exports = router;