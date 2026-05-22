const express  = require("express");
const router   = express.Router();
const ctrl     = require("../Controller/rfq");
const { Auth, sellerAuth } = require("../Middleware");

// ── Buyer / Builder / Mason ────────────────────────────────────────────────────
router.post("/",                      Auth, ctrl.createRFQ);
router.post("/from-boq/:boqId",       Auth, ctrl.createFromBOQ);
router.get("/my",                     Auth, ctrl.myRFQs);
router.get("/:id",                    Auth, ctrl.getRFQ);
router.patch("/:id/cancel",           Auth, ctrl.cancelRFQ);
router.patch("/:rfqId/accept/:quoteId", Auth, ctrl.acceptQuote);

// ── Seller ─────────────────────────────────────────────────────────────────────
router.get("/open",                   sellerAuth, ctrl.openRFQs);
router.post("/:id/quote",             sellerAuth, ctrl.submitQuote);
router.get("/seller/my-quotes",       sellerAuth, ctrl.sellerQuotes);

module.exports = router;
