const express = require("express");
const router = express.Router();

const intelligence = require("../Controller/intelligence");
const { verifyTokenwithAuthorization } = require("../Middleware");
const attachRole = require("../Middleware/attachRole");

const Auth = [verifyTokenwithAuthorization, attachRole];

/**
 * Cross-project intelligence. Scope comes from visibleProjectFilter inside the
 * controller, so a client sees the health of their own build and a builder sees
 * every site — no separate permission needed, because it cannot reach past what
 * the caller could already open by hand.
 */
router.get("/attention", Auth, intelligence.needsAttention);

module.exports = router;
