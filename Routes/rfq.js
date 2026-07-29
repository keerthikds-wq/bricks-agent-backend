const express  = require("express");
const router   = express.Router();
const ctrl     = require("../Controller/rfq");
const { Auth } = require("../Middleware");

/**
 * Material requests — builder-owned end to end.
 *
 * Suppliers are WhatsApp contacts, not app users, so the routes that existed
 * for a logged-in seller are retired:
 *   GET  /open              browsing every open RFQ in the region
 *   GET  /seller/my-quotes  a seller's own submitted quotes
 *   POST /:id/quote         a seller submitting a price
 *
 * Their replacements live on /api/vendors: dispatch-rfq builds the WhatsApp
 * messages, and :id/record-quote/:rfqId stores what a supplier quoted back.
 * They answer 410 rather than 404 so an old install says "please update"
 * instead of looking broken.
 */
const retired = (replacement) => (req, res) =>
    res.status(410).send({
        status: 410,
        error: true,
        moved_to: replacement,
        message:
            'Suppliers no longer sign in. Builders now send material requests ' +
            'over WhatsApp and record the prices that come back.',
    });

// ── Static/named routes MUST come before wildcard /:id ───────────────────────
router.get("/my",                       Auth, ctrl.myRFQs);
router.post("/",                        Auth, ctrl.createRFQ);
router.post("/from-boq/:boqId",         Auth, ctrl.createFromBOQ);

router.get("/open",                     retired('/api/vendors'));
router.get("/seller/my-quotes",         retired('/api/vendors'));

// ── Wildcard routes (must be LAST) ─────────────────────────────────────────────
router.get("/:id",                      Auth, ctrl.getRFQ);
router.patch("/:id/cancel",             Auth, ctrl.cancelRFQ);
router.patch("/:rfqId/accept/:quoteId", Auth, ctrl.acceptQuote);
router.post("/:id/quote",               retired('/api/vendors/:id/record-quote/:rfqId'));

module.exports = router;
