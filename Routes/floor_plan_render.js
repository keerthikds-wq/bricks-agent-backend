const express = require('express');
const router  = express.Router();
const ctrl    = require('../Controller/floor_plan_render');
const { Auth } = require('../Middleware');

router.get('/styles',                ctrl.getStyles);
router.get('/room-types',            ctrl.getRoomTypes);
router.get('/usage',          Auth,  ctrl.getUsage);
router.post('/visualize',     Auth,  ctrl.visualize);

module.exports = router;
