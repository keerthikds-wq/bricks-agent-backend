const express = require('express');
const router  = express.Router();
const ctrl    = require('../Controller/wishlist');
const { Auth } = require('../Middleware');

router.get('/',              Auth, ctrl.getAll);
router.get('/ids',           Auth, ctrl.getIds);
router.get('/check/:item_id', Auth, ctrl.check);
router.post('/toggle',       Auth, ctrl.toggle);

module.exports = router;
