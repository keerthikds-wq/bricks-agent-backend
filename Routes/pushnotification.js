const sendPushNotificationController = require("../Controller/push_notification");
const express = require("express");
const router=express.Router();
const { userAuth,sellerAuth,adminAuth,verifyTokenwithAuthorization } = require("../Utils");

router.post("/send-notification/:fcm_token",sendPushNotificationController.sendPushNotification);
router.post("/send-seller-notification/:id",sendPushNotificationController.sellerSendPushNotification);
router.get("/get-user-notification/me",userAuth,sendPushNotificationController.getUserNotification);
router.get("/get-seller-notification/me",sellerAuth,sendPushNotificationController.getSellerNotification);
router.get("/view-single-usernotification/:notificationid",userAuth,sendPushNotificationController.singleNotification);
router.get("/view-single-sellernotification/:notificationid",sellerAuth,sendPushNotificationController.singleSellerNotification);
router.delete("/delete-usernotification/:notificationid",userAuth,sendPushNotificationController.deleteUserNotificatioin);
router.delete("/delete-sellernotification/:notificationid",sellerAuth,sendPushNotificationController.deleteSellerNotificatioin);
router.post("/send-alluser-notification",sendPushNotificationController.sendAllUserPushNotification);
router.post("/send-topic-notification",sendPushNotificationController.sendTopicNotification);
router.get("/get-group-notification/:topic",sendPushNotificationController.getGroupNotification);

module.exports = router;