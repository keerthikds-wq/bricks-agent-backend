const express = require('express');
const router  = express.Router();
const ctrl    = require('../Controller/inventory');
const { Auth } = require('../Middleware');

router.get('/my',                    Auth, ctrl.getMyInventory);
router.get('/seller/:seller_id',           ctrl.getSellerInventory);
router.post('/',                     Auth, ctrl.addItem);
router.put('/:id',                   Auth, ctrl.updateItem);
router.patch('/:id/toggle',          Auth, ctrl.toggleAvailability);
router.delete('/:id',                Auth, ctrl.deleteItem);

module.exports = router;
