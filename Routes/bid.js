const { express } = require('../config');
const router = express.Router();

const { addBid, getBidbyOrder, getMyBids, acceptBidForOrder, declineBid } = require('../Controller/bid');
const { sellerAuth, userAuth, verifyTokenwithAuthorization } = require('../Utils');

// Seller submits a quotation for an order
router.post('/', sellerAuth, addBid);

// Seller fetches their own submitted quotations (for "My Quotations" tab)
router.get('/my', sellerAuth, getMyBids);

// Get all non-declined quotations for an order (buyer view)
router.get('/order/:id', verifyTokenwithAuthorization, getBidbyOrder);

// Buyer accepts a quotation → order goes "ongoing"
router.post('/order', userAuth, acceptBidForOrder);

// Buyer declines a specific quotation
router.post('/:id/decline', userAuth, declineBid);

module.exports = router;
