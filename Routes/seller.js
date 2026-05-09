const { express, app } = require('../config');
const router = express.Router();
const { sellerAuth,auth } = require("../Utils");
const { updateToken,getSeller, updateSeller, allSellers, deleteSeller } = require('../Controller/seller');


router.get('/:id', getSeller);
router.put('/update-seller-token/me',sellerAuth, updateToken);
router.patch('/:id', auth, updateSeller);
router.delete('/:id', auth, deleteSeller);
router.get('/', allSellers);

module.exports = router;