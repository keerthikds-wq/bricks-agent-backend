const express = require("express");
const router  = express.Router();
const ctrl    = require("../Controller/project_timeline");
const { builderAuth } = require("../Middleware");

router.get("/my",                       builderAuth, ctrl.getMyProjects);
router.get("/builder/:builder_id",                   ctrl.getBuilderProjects);
router.post("/",                        builderAuth, ctrl.createProject);
router.put("/:id",                      builderAuth, ctrl.updateProject);
router.put("/:id/phase/:phase_index",   builderAuth, ctrl.updatePhase);
router.delete("/:id",                   builderAuth, ctrl.deleteProject);

module.exports = router;
