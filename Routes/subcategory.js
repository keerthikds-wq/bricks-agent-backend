const { express, app } = require('../config');
const router = express.Router();
const {adminAuth} = require("../Utils");
const { addSubcategory, updateSubcategory, deleteSubcategory, allSubcategory, getSubcategory, getSubcategoryByCategory } = require('../Controller/subcategory');

router.post('/', adminAuth,addSubcategory);
router.patch('/:id',adminAuth, updateSubcategory);
router.delete('/:id',adminAuth, deleteSubcategory);
router.get('/:id', getSubcategory);
router.get('/category/:category', getSubcategoryByCategory);
router.get('/', allSubcategory);

module.exports = router;