const express = require('express');
const router  = express.Router();
const ctrl    = require('../Controller/review');
const { Auth } = require('../Middleware');

// All routes require a valid JWT (any role can review professionals)
router.post('/',                    Auth, ctrl.addReview);
router.get('/:reviewee_id',              ctrl.getReviews);   // public
router.get('/:reviewee_id/mine',    Auth, ctrl.getMyReview);
router.delete('/:reviewee_id',      Auth, ctrl.deleteReview);

module.exports = router;
