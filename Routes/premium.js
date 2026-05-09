const { express, app } = require('../config');
const router = express.Router();
//const { auth } = require("../Utils");
const {sellerAuth,verifyTokenwithAuthorization,userAuth,adminAuth } = require("../Utils");
const {addpremium,getPremiumbyUser,deletePremium } = require('../Controller/premium');


router.post('/add-premium',userAuth, addpremium);
 router.get('/get-premium/me',userAuth, getPremiumbyUser);
router.delete('/delete-premium/:id',adminAuth, deletePremium);
/*router.get('/get-support/me', sellerAuth, getSupportByUser); */


module.exports = router;