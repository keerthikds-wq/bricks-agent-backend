const express = require("express");
const router = express.Router();

const ledger = require("../Controller/ledger");
const { verifyTokenwithAuthorization } = require("../Middleware");
const attachRole = require("../Middleware/attachRole");

const Auth = [verifyTokenwithAuthorization, attachRole];

/**
 * These routes are not scoped to a project, so projectAccess() does not apply —
 * the gate is the caller's own account role, which attachRole has just resolved
 * from the database.
 */
const builderOnly = (req, res, next) =>
    req.user?.role === "builder"
        ? next()
        : res.status(403).json({
              success: false,
              message: "Only the builder can manage wage rates.",
          });

/**
 * Wage rates belong to the builder, not to a project — the same mason rate
 * applies across their sites. So these sit outside /projects and are scoped by
 * the caller's own id.
 *
 * Builder-only: a rate is a commercial decision, and field staff must not be
 * able to read or change what labour costs.
 */
router.get("/", Auth, builderOnly, ledger.listWageRates);
router.post("/", Auth, builderOnly, ledger.setWageRate);
router.delete("/:id", Auth, builderOnly, ledger.removeWageRate);

module.exports = router;
