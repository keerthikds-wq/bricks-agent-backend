const express = require("express");
const router  = express.Router();

const ctrl = require("../Controller/vendor_roster");
const { verifyTokenwithAuthorization } = require("../Middleware");
const attachRole = require("../Middleware/attachRole");

const Auth = [verifyTokenwithAuthorization, attachRole];

/**
 * Supplier address book — builder-only.
 *
 * Suppliers have no account here. The builder keeps contacts, sends material
 * requests over WhatsApp, and records the prices that come back. There is
 * deliberately no vendor login, invite/accept, or supplier inbox.
 */

router.get   ("/",                            Auth, ctrl.listVendors);
router.post  ("/",                            Auth, ctrl.addVendor);
router.post  ("/dispatch-rfq/:rfqId",         Auth, ctrl.dispatchRfq);
router.post  ("/:id/record-quote/:rfqId",     Auth, ctrl.recordQuote);
router.patch ("/:id",                         Auth, ctrl.updateVendor);
router.delete("/:id",                         Auth, ctrl.removeVendor);

module.exports = router;
