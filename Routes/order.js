const { express, app } = require('../config');
const router = express.Router();
const { changeStatus,getSellersOrders,addOrder, getOrder, getOrderbyUser, getOrderBySeller, getOrderAll } = require('../Controller/order');
const { adminAuth,userAuth,verifyTokenwithAuthorization } = require('../Utils');


router.post('/',userAuth, addOrder);
// router.post('/',auth, addOrder);
router.get('/:id',verifyTokenwithAuthorization, getOrder);
router.get('/seller/:id',verifyTokenwithAuthorization, getOrderBySeller);
router.get('/user/:id',verifyTokenwithAuthorization, getOrderbyUser);
router.get('/',verifyTokenwithAuthorization, getOrderAll);
router.get('/get-user-order',userAuth,getSellersOrders);
router.put('/complete-order/:id',verifyTokenwithAuthorization,changeStatus);

module.exports = router;