const { express, app } = require('../config');
const router = express.Router();
//const { auth } = require("../Utils");
const { sellerAuth,adminAuth,verifyTokenwithAuthorization } = require("../Utils");
const {addpackage,getPackage,editPackage } = require('../Controller/package');


router.post('/add-package',adminAuth, addpackage);
router.get('/get-packages', getPackage);
router.put('/edit-package/:id',adminAuth, editPackage);
/*router.get('/get-support/me', sellerAuth, getSupportByUser); */


module.exports = router;