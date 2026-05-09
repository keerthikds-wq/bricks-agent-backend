const { express, app } = require('../config');
const router = express.Router();
const { auth,adminAuth } = require("../Utils");
const { getAdmin, updateAdmin, allAdmins, deleteAdmin } = require('../Controller/admin');


router.get('/:id', adminAuth, getAdmin);
router.patch('/:id', adminAuth, updateAdmin);
router.delete('/:id', adminAuth, deleteAdmin);
router.get('/', adminAuth, allAdmins);

module.exports = router;