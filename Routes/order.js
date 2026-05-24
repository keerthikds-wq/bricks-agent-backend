const { express, app } = require('../config');
const router = express.Router();
const { changeStatus,getSellersOrders,addOrder, getOrder, getOrderbyUser, getOrderBySeller, getOrderAll, declineOrder } = require('../Controller/order');
const { adminAuth,userAuth,verifyTokenwithAuthorization,sellerAuth } = require('../Utils');


// Named/static routes before wildcard /:id
router.post('/', userAuth, addOrder);
router.get('/get-user-order', userAuth, getSellersOrders);     // must be before /:id
router.get('/seller/:id', verifyTokenwithAuthorization, getOrderBySeller);
router.get('/user/:id', verifyTokenwithAuthorization, getOrderbyUser);
router.get('/', verifyTokenwithAuthorization, getOrderAll);
// Wildcard routes last
router.get('/:id', verifyTokenwithAuthorization, getOrder);
router.put('/complete-order/:id', sellerAuth, changeStatus);   // only seller can complete
router.post('/:id/decline', sellerAuth, declineOrder);

module.exports = router;