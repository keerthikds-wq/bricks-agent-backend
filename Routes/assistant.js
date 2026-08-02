const express = require("express");
const router = express.Router();

const assistant = require("../Controller/assistant");
const { verifyTokenwithAuthorization } = require("../Middleware");
const attachRole = require("../Middleware/attachRole");

const Auth = [verifyTokenwithAuthorization, attachRole];

/**
 * Open to every signed-in role.
 *
 * The answers are built from whatever that caller can already see —
 * visibleProjectFilter decides the scope — so a client asking about payments
 * gets their own build, and site staff get the sites they are on. There is no
 * separate permission to grant because the assistant cannot reach past what the
 * person could reach by tapping around the app.
 */
router.get("/summary", Auth, assistant.summary);
router.get("/suggestions", Auth, assistant.suggestions);
router.post("/ask", Auth, assistant.ask);

module.exports = router;
