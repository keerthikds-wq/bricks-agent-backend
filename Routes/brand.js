const { express, app } = require('../config');
const router = express.Router();
const {adminAuth } = require("../Utils");
const { addBrand, updateBrand, deleteBrand, allBrand, getBrand } = require('../Controller/brand');
const upload = require("../Utils/multer")

router.post('/', upload.single("image"),adminAuth,addBrand);
router.patch('/:id', adminAuth,updateBrand);
router.delete('/:id',adminAuth, deleteBrand);
router.get('/:id', getBrand);
router.get('/', allBrand);

module.exports = router;