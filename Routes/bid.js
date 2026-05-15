const { express, app } = require('../config');
const router = express.Router();

const { addBid, getBidbyOrder, acceptBidForOrder } = require('../Controller/bid');
const { sellerAuth, userAuth, verifyTokenwithAuthorization } = require('../Utils');

// POST /api/bid — seller submits a bid (must be authenticated seller)
router.post('/', sellerAuth, addBid);

// GET /api/bid/order/:id — get all bids for an order (any authenticated user)
router.get('/order/:id', verifyTokenwithAuthorization, getBidbyOrder);

// POST /api/bid/order — buyer accepts a bid (must be authenticated user/buyer)
router.post('/order', userAuth, acceptBidForOrder);


module.exports = router;