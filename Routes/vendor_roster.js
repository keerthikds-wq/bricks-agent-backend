const express = require("express");
const router  = express.Router();

const ctrl = require("../Controller/vendor_roster");
const { verifyTokenwithAuthorization } = require("../Middleware");

const Auth = verifyTokenwithAuthorization;

/**
 * Vendor roster — builder-scoped supplier management.
 * Replaces the open marketplace seller discovery.
 */

// Public — invite preview shown before login. Must precede the auth'd routes.
router.get ("/invite/:token",                  ctrl.vendorInviteInfo);

// Vendor-side
router.get ("/my-requests",              Auth, ctrl.myRequests);
router.post("/invite/:token/accept",     Auth, ctrl.acceptVendorInvite);

// Builder-side
router.get   ("/",                       Auth, ctrl.listVendors);
router.post  ("/invite",                 Auth, ctrl.inviteVendor);
router.post  ("/dispatch-rfq/:rfqId",    Auth, ctrl.dispatchRfq);
router.get   ("/:vendorId/catalogue",    Auth, ctrl.vendorCatalogue);
router.patch ("/:linkId",                Auth, ctrl.updateVendor);
router.delete("/:linkId",                Auth, ctrl.removeVendor);

module.exports = router;
