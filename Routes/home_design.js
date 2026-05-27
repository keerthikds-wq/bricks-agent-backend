const express = require('express');
const router  = express.Router();
const ctrl    = require('../Controller/home_design');
const { verifyTokenwithAuthorization } = require('../Middleware');

// ── Public (no auth) — catalog & tools ──────────────────────────────────────
router.get('/styles',                ctrl.getStyles);
router.get('/styles/:id',            ctrl.getStyleById);
router.get('/room-guide',            ctrl.getRoomGuide);
router.get('/suggestions',           ctrl.designSuggestions);

// ── Authenticated — AI tools & calculations ──────────────────────────────────
router.post('/vastu-check',          verifyTokenwithAuthorization, ctrl.vastuCheck);
router.post('/interior-estimate',    verifyTokenwithAuthorization, ctrl.interiorEstimate);
router.post('/style-advisor',        verifyTokenwithAuthorization, ctrl.styleAdvisor);
router.post('/room-planner',         verifyTokenwithAuthorization, ctrl.roomPlanner);
router.post('/ask',                  verifyTokenwithAuthorization, ctrl.askDesignAI);
router.post('/analyze-plan',         verifyTokenwithAuthorization, ctrl.analyzeFloorPlan);

// ── Project CRUD ─────────────────────────────────────────────────────────────
router.post('/project',              verifyTokenwithAuthorization, ctrl.saveProject);
router.get('/project/my',            verifyTokenwithAuthorization, ctrl.getMyProjects);
router.get('/project/:id',           verifyTokenwithAuthorization, ctrl.getProject);
router.patch('/project/:id',         verifyTokenwithAuthorization, ctrl.updateProject);
router.delete('/project/:id',        verifyTokenwithAuthorization, ctrl.deleteProject);

// ── Save computed results to a project ───────────────────────────────────────
router.post('/project/:id/save-vastu',    verifyTokenwithAuthorization, ctrl.saveVastuToProject);
router.post('/project/:id/save-estimate', verifyTokenwithAuthorization, ctrl.saveEstimateToProject);

module.exports = router;
