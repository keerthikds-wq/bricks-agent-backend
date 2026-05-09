const { express, app } = require('../config');
const router = express.Router();
const { adminAuth } = require("../Utils");
const { addCategory, updateCategory, deleteCategory, allCategory, getCategory } = require('../Controller/category');
const upload = require("../Utils/multer")

router.post('/',adminAuth, upload.single("image"),addCategory);
router.patch('/:id',adminAuth, updateCategory);
router.delete('/:id',adminAuth, deleteCategory);
router.get('/:id', getCategory);
router.get('/', allCategory);

module.exports = router;