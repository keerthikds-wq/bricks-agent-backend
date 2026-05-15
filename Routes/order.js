const { express, app } = require('../config');
const router = express.Router();
const { changeStatus,getSellersOrders,addOrder, getOrder, getOrderbyUser, getOrderBySeller, getOrderAll, declineOrder } = require('../Controller/order');
const { adminAuth,userAuth,verifyTokenwithAuthorization,sellerAuth } = require('../Utils');


router.post('/',userAuth, addOrder);
// router.post('/',auth, addOrder);
router.get('/:id',verifyTokenwithAuthorization, getOrder);
router.get('/seller/:id',verifyTokenwithAuthorization, getOrderBySeller);
router.get('/user/:id',verifyTokenwithAuthorization, getOrderbyUser);
router.get('/',verifyTokenwithAuthorization, getOrderAll);
router.get('/get-user-order',userAuth,getSellersOrders);
router.put('/complete-order/:id',verifyTokenwithAuthorization,changeStatus);
// Seller declines an order (hides it from their feed permanently)
router.post('/:id/decline', sellerAuth, declineOrder);

module.exports = router;