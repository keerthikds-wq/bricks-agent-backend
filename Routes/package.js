const { express } = require('../config');
const router = express.Router();
const { adminAuth } = require("../Utils");
const { addpackage, getPackage, getAllPackages, editPackage, deletePackage } = require('../Controller/package');

// Public: get active packages (optional ?type=seller|buyer filter)
router.get('/get-packages', getPackage);

// Admin-only: manage packages (prices, plans)
router.get('/all',                      adminAuth, getAllPackages);   // all incl. inactive
router.post('/add-package',             adminAuth, addpackage);
router.put('/edit-package/:id',         adminAuth, editPackage);
router.delete('/delete-package/:id',    adminAuth, deletePackage);

module.exports = router;
