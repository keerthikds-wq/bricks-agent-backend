const { express } = require('../config');
const router = express.Router();
const { sellerAuth, adminAuth, verifyTokenwithAuthorization } = require('../Middleware');
const { updateToken, getSeller, updateSeller, allSellers, deleteSeller } = require('../Controller/seller');

// Public reads (needed for buyer to view seller profiles)
router.get('/',    allSellers);
router.get('/:id', getSeller);

// Seller-only mutations — sellerAuth ensures only the token owner can modify
router.put('/update-seller-token/me', sellerAuth, updateToken);
router.patch('/:id',                  sellerAuth, updateSeller);   // ownership enforced in controller
router.delete('/:id',                 sellerAuth, deleteSeller);   // ownership enforced in controller

module.exports = router;
