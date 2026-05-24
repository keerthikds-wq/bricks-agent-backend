const ctrl = require("../Controller/push_notification");
const express = require("express");
const router = express.Router();
const { userAuth, sellerAuth } = require("../Utils");

router.post("/send-notification/:fcm_token", ctrl.sendPushNotification);
router.post("/send-seller-notification/:id", ctrl.sellerSendPushNotification);
router.get("/get-user-notification/me", userAuth, ctrl.getUserNotification);
router.get("/get-seller-notification/me", sellerAuth, ctrl.getSellerNotification);
router.get("/view-single-usernotification/:notificationid", userAuth, ctrl.singleNotification);
router.get("/view-single-sellernotification/:notificationid", sellerAuth, ctrl.singleSellerNotification);
router.delete("/delete-usernotification/:notificationid", userAuth, ctrl.deleteUserNotificatioin);
router.delete("/delete-sellernotification/:notificationid", sellerAuth, ctrl.deleteSellerNotificatioin);
router.patch("/mark-all-user-read", userAuth, ctrl.markAllUserNotificationsRead);
router.patch("/mark-all-seller-read", sellerAuth, ctrl.markAllSellerNotificationsRead);
router.post("/send-alluser-notification", ctrl.sendAllUserPushNotification);
router.post("/send-topic-notification", ctrl.sendTopicNotification);
router.get("/get-group-notification/:topic", ctrl.getGroupNotification);

module.exports = router;
