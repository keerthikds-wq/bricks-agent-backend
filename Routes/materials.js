const express = require("express");
const router = express.Router();
const ctrl = require("../Controller/materials");
const { verifyTokenwithAuthorization } = require("../Middleware");

/**
 * Materials & rates — read-only reference, common to every role.
 * Authenticated but not role-gated: an owner benefits from seeing the same
 * market rate their builder is quoting against.
 */
router.get("/rates",     verifyTokenwithAuthorization, ctrl.rates);
router.get("/products",  verifyTokenwithAuthorization, ctrl.products);
router.get("/benchmark", verifyTokenwithAuthorization, ctrl.benchmark);

module.exports = router;
