const express = require("express");
const router  = express.Router();
const ctrl    = require("../Controller/project_timeline");
// verifyTokenwithAuthorization accepts any logged-in user (buyer/seller/builder/masonry)
// so both builders AND masonries can use Construction Tracking without getting logged out
const { verifyTokenwithAuthorization } = require("../Middleware");

router.get("/my",                       verifyTokenwithAuthorization, ctrl.getMyProjects);
router.get("/builder/:builder_id",                                    ctrl.getBuilderProjects);
router.post("/",                        verifyTokenwithAuthorization, ctrl.createProject);
router.put("/:id",                      verifyTokenwithAuthorization, ctrl.updateProject);
router.put("/:id/phase/:phase_index",   verifyTokenwithAuthorization, ctrl.updatePhase);
router.delete("/:id",                   verifyTokenwithAuthorization, ctrl.deleteProject);

module.exports = router;
