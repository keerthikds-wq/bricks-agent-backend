const { express, app } = require('../config');
const router = express.Router();
const {adminAuth,sellerAuth} = require("../Utils");
const upload = require('../Utils/multer');
const {getProductbyUserID,addList,addProduct, updateProduct, deleteProduct, allProduct, getProduct } = require('../Controller/product');


router.post('/', adminAuth, upload.array('image', 6),addProduct);
router.post('/add-list', sellerAuth,addList);
router.patch('/:id',adminAuth, updateProduct);
router.delete('/:id', adminAuth,deleteProduct);
router.get('/:id', getProduct);
router.get('/get-product/me',sellerAuth, getProductbyUserID);
router.get('/', allProduct);

module.exports = router;