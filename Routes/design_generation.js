const express = require('express');
const router  = express.Router();
const ctrl    = require('../Controller/design_generation');
const { verifyTokenwithAuthorization } = require('../Middleware');
const multer  = require('../Utils/multer');

// ── Public catalog endpoints (no auth) ───────────────────────────────────────
router.get('/styles',        ctrl.getStyles);
router.get('/styles/:id',    ctrl.getStyleById);
router.get('/room-types',    ctrl.getRoomTypes);

// ── Authenticated ─────────────────────────────────────────────────────────────

// Step 1: Upload source photo → get Cloudinary URL
router.post('/upload-image', verifyTokenwithAuthorization, multer.single('image'), ctrl.uploadImage);

// Step 2: Generate redesigned image
// room      — "Generate Home Designs" / "Remodel & Design Dream Home"
// exterior  — "Redesign Exterior With AI"
// walls     — "Redesign Walls and More"
// furniture — "Replace Furniture of Your Room"
// garden    — "Design Garden with AI"
router.post('/room',         verifyTokenwithAuthorization, ctrl.generateRoom);
router.post('/exterior',     verifyTokenwithAuthorization, ctrl.generateExterior);
router.post('/walls',        verifyTokenwithAuthorization, ctrl.generateWalls);
router.post('/furniture',    verifyTokenwithAuthorization, ctrl.generateFurniture);
router.post('/garden',       verifyTokenwithAuthorization, ctrl.generateGarden);

// Step 3: Poll for result (Flutter app polls every 3s)
router.get('/job/:id',       verifyTokenwithAuthorization, ctrl.getJobStatus);

// History & management
router.get('/history',       verifyTokenwithAuthorization, ctrl.getHistory);
router.get('/usage',         verifyTokenwithAuthorization, ctrl.getUsage);
router.delete('/:id',        verifyTokenwithAuthorization, ctrl.deleteGeneration);

module.exports = router;
