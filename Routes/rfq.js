const express  = require("express");
const router   = express.Router();
const ctrl     = require("../Controller/rfq");
// vendorAuth accepts both the merged `role: 'vendor'` and the legacy
// isSeller flag, so migrated suppliers keep working. See Middleware/index.js.
const { Auth, vendorAuth } = require("../Middleware");

// ── Static/named routes MUST come before wildcard /:id ───────────────────────
router.get("/my",                       Auth,       ctrl.myRFQs);
router.get("/open",                     vendorAuth, ctrl.openRFQs);       // legacy open feed
router.get("/seller/my-quotes",         vendorAuth, ctrl.sellerQuotes);   // submitted quotes
router.post("/",                        Auth,       ctrl.createRFQ);
router.post("/from-boq/:boqId",         Auth,       ctrl.createFromBOQ);

// ── Wildcard routes (must be LAST) ─────────────────────────────────────────────
router.get("/:id",                      Auth,       ctrl.getRFQ);
router.patch("/:id/cancel",             Auth,       ctrl.cancelRFQ);
router.patch("/:rfqId/accept/:quoteId", Auth,       ctrl.acceptQuote);
router.post("/:id/quote",               vendorAuth, ctrl.submitQuote);

module.exports = router;
