const express = require("express");
const router = express.Router();
const ctrl = require("../Controller/materials");
const intel = require("../Controller/materials_intel");
const { verifyTokenwithAuthorization } = require("../Middleware");
const attachRole = require("../Middleware/attachRole");

/**
 * Materials & rates — read-only reference, common to every role.
 * Authenticated but not role-gated: an owner benefits from seeing the same
 * market rate their builder is quoting against.
 */
router.get("/rates",     verifyTokenwithAuthorization, ctrl.rates);
router.get("/products",  verifyTokenwithAuthorization, ctrl.products);
router.get("/benchmark", verifyTokenwithAuthorization, ctrl.benchmark);

/**
 * Market intelligence joins the public rates to the caller's OWN purchasing, so
 * unlike the routes above it needs a resolved role — visibleProjectFilter
 * decides which bills count. A client sees their build's purchasing, a builder
 * sees the portfolio; neither can reach past what they could already open.
 */
router.get("/intelligence",
    verifyTokenwithAuthorization, attachRole, intel.intelligence);

module.exports = router;
