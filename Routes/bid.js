const { express, app } = require('../config');
const router = express.Router();

const { addBid, getBidbyOrder, acceptBidForOrder } = require('../Controller/bid');


router.post('/', addBid);
router.get('/order/:id', getBidbyOrder);
router.post('/order', acceptBidForOrder);


module.exports = router;