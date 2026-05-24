const express  = require("express");
const router   = express.Router();
const ctrl     = require("../Controller/rfq");
const { Auth, sellerAuth } = require("../Middleware");

// ── Static/named routes MUST come before wildcard /:id ───────────────────────
router.get("/my",                       Auth,       ctrl.myRFQs);
router.get("/open",                     sellerAuth, ctrl.openRFQs);       // seller feed
router.get("/seller/my-quotes",         sellerAuth, ctrl.sellerQuotes);   // seller submitted quotes
router.post("/",                        Auth,       ctrl.createRFQ);
router.post("/from-boq/:boqId",         Auth,       ctrl.createFromBOQ);

// ── Wildcard routes (must be LAST) ─────────────────────────────────────────────
router.get("/:id",                      Auth,       ctrl.getRFQ);
router.patch("/:id/cancel",             Auth,       ctrl.cancelRFQ);
router.patch("/:rfqId/accept/:quoteId", Auth,       ctrl.acceptQuote);
router.post("/:id/quote",               sellerAuth, ctrl.submitQuote);

module.exports = router;
