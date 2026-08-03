const express = require("express");
const router = express.Router();

const ledger = require("../Controller/ledger");
const cashflow = require("../Controller/cashflow");
const { verifyTokenwithAuthorization } = require("../Middleware");
const attachRole = require("../Middleware/attachRole");

const Auth = [verifyTokenwithAuthorization, attachRole];

/**
 * Cross-project finance. Not scoped to one project, so projectAccess() does not
 * apply — visibility is resolved inside the controller from the caller's own
 * memberships, the same way the dashboard does it.
 *
 * Field staff are excluded: they post daily logs but must not see commercials.
 */
const financeRoles = (req, res, next) =>
    ["builder", "client"].includes(req.user?.role)
        ? next()
        : res.status(403).json({
              success: false,
              message: "Finance is available to builders and owners.",
          });

router.get("/overview", Auth, financeRoles, ledger.financeOverview);
router.get("/cashflow", Auth, financeRoles, cashflow.cashflow);

module.exports = router;
