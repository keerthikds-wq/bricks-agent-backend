const express = require("express");
const router = express.Router();

const attendance = require("../Controller/attendance");
const { verifyTokenwithAuthorization } = require("../Middleware");
const attachRole = require("../Middleware/attachRole");

const Auth = [verifyTokenwithAuthorization, attachRole];

/**
 * Not scoped to a project, so projectAccess() does not apply — the gate is the
 * caller's own account role, which attachRole has just resolved. Same shape as
 * wage_rate.js for the same reason.
 */
const builderOnly = (req, res, next) =>
    req.user?.role === "builder"
        ? next()
        : res.status(403).json({
              success: false,
              message: "Only the builder can manage the labour roster.",
          });

/**
 * The labour roster. Builder-only, like wage rates: who is on the crew and what
 * each person is paid is a commercial decision, and a per-worker rate override
 * is exactly the thing a site supervisor must not be able to edit between
 * marking one day's attendance and the next.
 */
router.get("/", Auth, builderOnly, attendance.listWorkers);
router.post("/", Auth, builderOnly, attendance.addWorker);
router.patch("/:id", Auth, builderOnly, attendance.updateWorker);
router.delete("/:id", Auth, builderOnly, attendance.removeWorker);

module.exports = router;
