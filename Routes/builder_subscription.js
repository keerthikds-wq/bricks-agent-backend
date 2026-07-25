const express = require("express");
const router  = express.Router();

const ctrl = require("../Controller/builder_subscription");
const { verifyTokenwithAuthorization } = require("../Middleware");

const Auth = verifyTokenwithAuthorization;

/** Builder subscription — the only paid product in the merged app. */
router.get ("/",             Auth, ctrl.mySubscription);
router.get ("/history",      Auth, ctrl.history);
router.post("/start-trial",  Auth, ctrl.startTrial);
router.post("/create-order", Auth, ctrl.createOrder);
router.post("/verify",       Auth, ctrl.verify);

module.exports = router;
