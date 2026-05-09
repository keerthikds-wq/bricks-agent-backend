const { constants } = require('fs');
const { express, app } = require('../config');
const router = express.Router();
const { auth,userAuth } = require("../Utils");
const { updateToken,getUser, updateUser, allUsers, deleteUser, activeInactiveUser } = require('../Controller/users');


router.get('/:id', getUser);
router.patch('/:id', userAuth, updateUser);
router.put('/update-token/me', userAuth, updateToken);
router.delete('/:id', userAuth, deleteUser);
router.get('/', allUsers);
router.put('/:id', userAuth, activeInactiveUser);

module.exports = router;