const ctrl = require("../Controller/push_notification");
const express = require("express");
const router = express.Router();
const { userAuth, sellerAuth, adminAuth, verifyTokenwithAuthorization } = require("../Utils");

// ── Authenticated user/seller notification reads ──────────────────────────────
router.get("/get-user-notification/me",               userAuth,   ctrl.getUserNotification);
router.get("/get-seller-notification/me",             sellerAuth, ctrl.getSellerNotification);
router.get("/view-single-usernotification/:notificationid",   userAuth,   ctrl.singleNotification);
router.get("/view-single-sellernotification/:notificationid", sellerAuth, ctrl.singleSellerNotification);
router.delete("/delete-usernotification/:notificationid",     userAuth,   ctrl.deleteUserNotificatioin);
router.delete("/delete-sellernotification/:notificationid",   sellerAuth, ctrl.deleteSellerNotificatioin);
router.patch("/mark-all-user-read",   userAuth,   ctrl.markAllUserNotificationsRead);
router.patch("/mark-all-seller-read", sellerAuth, ctrl.markAllSellerNotificationsRead);

// ── Send notifications — require auth to prevent spam ─────────────────────────
// Any authenticated user can trigger a targeted notification (order/bid flows need this)
router.post("/send-notification/:fcm_token",    verifyTokenwithAuthorization, ctrl.sendPushNotification);
router.post("/send-seller-notification/:id",    verifyTokenwithAuthorization, ctrl.sellerSendPushNotification);
// Broadcast endpoints — admin only
router.post("/send-alluser-notification",       adminAuth, ctrl.sendAllUserPushNotification);
router.post("/send-topic-notification",         adminAuth, ctrl.sendTopicNotification);
// Group notification fetch — any authenticated user
router.get("/get-group-notification/:topic",    verifyTokenwithAuthorization, ctrl.getGroupNotification);

module.exports = router;
