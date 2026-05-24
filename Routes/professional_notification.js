const express  = require("express");
const router   = express.Router();
const ctrl     = require("../Controller/professional_notification");
const { builderAuth, masonryAuth, verifyTokenwithAuthorization } = require("../Utils");

// Combined auth: allow either builder or masonry
const profAuth = (req, res, next) => {
  verifyTokenwithAuthorization(req, res, () => {
    if (req.user?.isBuilder || req.user?.isMasonry) return next();
    return res.status(403).json({ message: "Builders and masons only" });
  });
};

router.get(   "/me",                    profAuth, ctrl.getMyNotifications);
router.patch( "/mark-all-read",         profAuth, ctrl.markAllRead);
router.patch( "/read/:notificationid",  profAuth, ctrl.markOneRead);
router.delete("/:notificationid",       profAuth, ctrl.deleteNotification);

module.exports = router;
