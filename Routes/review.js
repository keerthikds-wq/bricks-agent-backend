const express = require('express');
const router  = express.Router();
const ctrl    = require('../Controller/review');
const { Auth, adminAuth } = require('../Middleware');

// Admin: mark a builder or masonry contractor as Bricks Verified
router.patch('/verify/:type/:id',   adminAuth, ctrl.verifyProfile);

// All routes require a valid JWT (any role can review professionals)
router.post('/',                    Auth, ctrl.addReview);
router.get('/:reviewee_id',              ctrl.getReviews);   // public — surfaces rating on profile
router.get('/:reviewee_id/mine',    Auth, ctrl.getMyReview);
router.delete('/:reviewee_id',      Auth, ctrl.deleteReview);

module.exports = router;
