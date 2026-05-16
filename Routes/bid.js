const { express } = require('../config');
const router = express.Router();

const {
    addBid,
    getBidbyOrder,
    getBidsByRequirement,
    getMyBids,
    acceptBidForOrder,
    acceptBidForRequirement,
    declineBid,
} = require('../Controller/bid');
const { sellerAuth, userAuth, verifyTokenwithAuthorization } = require('../Utils');

// Seller submits a quotation (for an order OR a requirement)
router.post('/', sellerAuth, addBid);

// Seller fetches their own submitted quotations ("My Quotations" tab)
router.get('/my', sellerAuth, getMyBids);

// Get all non-declined quotations for an ORDER (buyer view)
router.get('/order/:id', verifyTokenwithAuthorization, getBidbyOrder);

// Get all non-declined quotations for a REQUIREMENT (buyer view)
router.get('/requirement/:id', verifyTokenwithAuthorization, getBidsByRequirement);

// Buyer accepts a bid on an ORDER → order goes "ongoing"
router.post('/order', userAuth, acceptBidForOrder);

// Buyer accepts a bid on a REQUIREMENT → requirement closed
router.post('/requirement', userAuth, acceptBidForRequirement);

// Buyer declines a specific bid (order or requirement)
router.post('/:id/decline', userAuth, declineBid);

module.exports = router;
