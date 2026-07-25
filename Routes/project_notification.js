const express = require("express");
const router  = express.Router();

const ctrl = require("../Controller/project_notification");
const { verifyTokenwithAuthorization } = require("../Middleware");

const Auth = verifyTokenwithAuthorization;

router.get  ("/",          Auth, ctrl.list);
router.patch("/read-all",  Auth, ctrl.markAllRead);
router.patch("/:id/read",  Auth, ctrl.markRead);

module.exports = router;
