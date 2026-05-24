var admin=require("firebase-admin");
const {StatusCodes}=require("http-status-codes");
const Notification=require("../Model/Notification")
const Allusernotification=require("../Model/allusernotification");
const Sellernotification=require("../Model/Sellernotification");
const GroupNotification = require("../Model/Groupnotification");
const User=require("../Model/User")
const Seller=require("../Model/Seller")
const {v4: uuid} = require('uuid');

var serviceAccount=require("../Utils/config.json")
if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

// ─── Shared helper: send one FCM message via firebase-admin ──────────────────
// Returns true on success, false on failure (never throws).
async function _sendFcm(token, title, body, extraData = {}) {
    if (!token || token === 'user_logged_out') return false;
    try {
        await admin.messaging().send({
            notification: { title, body },
            data: { title, body, click_action: 'FLUTTER_NOTIFICATION_CLICK', ...extraData },
            token,
        });
        return true;
    } catch (e) {
        console.error('_sendFcm error (non-fatal):', e.message);
        return false;
    }
}

// ─── Exported helper: notify ALL sellers of a new requirement ────────────────
// Called directly from requirement.js — fire-and-forget, no HTTP round-trip.
exports.notifyAllSellers = async (title, body) => {
    try {
        const sellers = await Seller.find({ is_delete: { $ne: 1 } }, 'fcm_token');
        const results = await Promise.allSettled(
            sellers
                .filter(s => s.fcm_token && s.fcm_token !== 'user_logged_out')
                .map(s => _sendFcm(s.fcm_token, title, body))
        );
        const sent = results.filter(r => r.status === 'fulfilled' && r.value).length;
        console.log(`notifyAllSellers: sent=${sent}/${sellers.length}`);
    } catch (e) {
        console.error('notifyAllSellers error (non-fatal):', e.message);
    }
};

// ─── POST /api/push-notification/send-notification/:fcm_token ────────────────
// Buyer → seller / any FCM token notification (used when seller quotes a buyer)
exports.sendPushNotification = async (req, res, next) => {
    const { title, body } = req.body;
    const token = req.params.fcm_token;
    try {
        const notifId = uuid();
        // Persist to DB (best-effort — look up user by fcm_token)
        const user = await User.findOne({ fcm_token: token }).catch(() => null);
        if (user) {
            await Notification.create({
                title, body,
                message: req.body.message || '',
                fcm_token: token,
                userid: `${user._id}`,
                notificationid: notifId,
                view: 'false',
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
            }).catch(() => {});
        }

        await _sendFcm(token, title, body, { notificationid: notifId });
        return res.status(200).send({ message: 'Notification sent successfully', error: false });
    } catch (err) {
        console.error('sendPushNotification error:', err);
        return res.status(500).send({ message: err.message, error: true });
    }
};
exports.sendAllUserPushNotification = async (req, res, next) => {
    // Placeholder — not currently used in production
    return res.status(200).send({ message: 'Not implemented', error: false });
};

// ─── POST /api/push-notification/send-seller-notification/:id ────────────────
// Used by send_notification_to_nearby_sellers.dart to notify a single seller
exports.sellerSendPushNotification = async (req, res, next) => {
    const { title, body } = req.body;
    const sellerId = req.params.id;
    try {
        const seller = await Seller.findById(sellerId);
        if (!seller) {
            return res.status(404).send({ message: 'Seller not found', error: true });
        }

        const notifId = uuid();
        // Persist notification record
        await Sellernotification.create({
            title, body,
            message: req.body.message || '',
            fcm_token: `${seller.fcm_token}`,
            userid: `${seller._id}`,
            notificationid: notifId,
            view: 'false',
            click_action: 'FLUTTER_NOTIFICATION_CLICK',
        }).catch(e => console.error('Sellernotification.create error (non-fatal):', e.message));

        await _sendFcm(seller.fcm_token, title, body, {
            userid: `${seller._id}`,
            notificationid: notifId,
        });
        return res.status(200).send({ message: 'Notification sent', error: false });
    } catch (err) {
        console.error('sellerSendPushNotification error:', err);
        return res.status(500).send({ message: err.message, error: true });
    }
};

exports.getUserNotification=async(req,res,next)=>{
    const userid=req.user.id
    try{
        const getUserNotification= await Notification.find({userid});
        if(getUserNotification.length>0){
            res.status(200).json({
                count:getUserNotification.length,
                message:"Notification List",
                data:getUserNotification
                
            })
        }else{
            res.status(StatusCodes.OK).json({
                message:"No NOtification Yet",
                data:[]
            })
        }
    }
    catch(err){
        res.status(500).json({
            err
        })
    }
}


exports.getSellerNotification=async(req,res,next)=>{
    const userid=req.user.id
    try{
        const getUserNotification= await Sellernotification.find({userid});
        if(getUserNotification.length>0){
            res.status(200).json({
                count:getUserNotification.length,
                message:"Notification List",
                data:getUserNotification
                
            })
        }else{
            res.status(StatusCodes.OK).json({
                message:"No NOtification Yet",
                data:[]
            })
        }
    }
    catch(err){
        res.status(500).json({
            err
        })
    }
}

exports.singleNotification=async (req,res,next)=>{
    const notificationIds=req.params.notificationid
    try{
        const checkAvailably=await Notification.findOne({notificationid:notificationIds})
        await Notification.findOneAndUpdate({notificationid:notificationIds},{view:"true"},{new:true})
        if(checkAvailably){
            res.status(StatusCodes.OK).json({
                code:StatusCodes.OK,
                message:"success",
                data:checkAvailably
            })
        }else{
            res.status(StatusCodes.OK).json({
                message:"Not Found",
                data:[],
                code:StatusCodes.OK
            })
        }
    }
    catch(errors){
        console.log(errors)
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            message:errors,
            code:StatusCodes.INTERNAL_SERVER_ERROR
           
        })
    }
}
exports.singleSellerNotification=async (req,res,next)=>{
    const notificationIds=req.params.notificationid
    try{
        const checkAvailably=await Sellernotification.findOne({notificationid:notificationIds})
        await Sellernotification.findOneAndUpdate({notificationid:notificationIds},{view:"true"},{new:true})
        if(checkAvailably){
            res.status(StatusCodes.OK).json({
                code:StatusCodes.OK,
                message:"success",
                data:checkAvailably
            })
        }else{
            res.status(StatusCodes.OK).json({
                message:"Not Found",
                data:[],
                code:StatusCodes.OK
            })
        }
    }
    catch(errors){
        console.log(errors)
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            message:errors,
            code:StatusCodes.INTERNAL_SERVER_ERROR
           
        })
    }
}


exports.deleteUserNotificatioin=async(req, res)=> {
    const deleteid=req.params.notificationid
    try {
        const notificationCheck=await Notification.findOne({deleteid})
        if(notificationCheck){
            const deleted=await notificationCheck.delete()
            if(deleted){
                res.status(StatusCodes.OK).json({status:"Deleted Successful"})
            }else{
                return res.status(StatusCodes.BAD_REQUEST).json({status:"Delete Failure"})
            }
        }else{
            return res.status(StatusCodes.NOT_FOUND).json({
                status:"Failed",
                message:"Premium Not Found",
            })
    }
    } catch (error) {
        console.log(error)
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            status:"Failed",
            message:"Something went wrong",
        })
    }
}
exports.deleteSellerNotificatioin=async(req, res)=> {
    const deleteid=req.params.notificationid
    try {
        const notificationCheck=await Notification.findOne({deleteid})
        if(notificationCheck){
            const deleted=await notificationCheck.delete()
            if(deleted){
                res.status(StatusCodes.OK).json({status:"Deleted Successful"})
            }else{
                return res.status(StatusCodes.BAD_REQUEST).json({status:"Delete Failure"})
            }
        }else{
            return res.status(StatusCodes.NOT_FOUND).json({
                status:"Failed",
                message:"Premium Not Found",
            })
    }
    } catch (error) {
        console.log(error)
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            status:"Failed",
            message:"Something went wrong",
        })
    }
}

exports.sendTopicNotification = async (req, res) => {
    const { title, body, topic, message: messageBody } = req.body;
    if (!topic) return res.status(400).send({ message: 'topic is required', error: true });
    try {
        const result = await admin.messaging().send({
            notification: { title, body },
            data: { title, body, message: messageBody || '' },
            topic,
        });
        await GroupNotification.create({
            title, body,
            message: messageBody || '',
            notificationid: result,
            topic,
        }).catch(e => console.error('GroupNotification.create error (non-fatal):', e.message));
        return res.status(200).send({ message: 'Notification sent successfully', error: false });
    } catch (err) {
        console.error('sendTopicNotification error:', err);
        return res.status(500).send({ message: err.message, error: true });
    }
};
  
  exports.getGroupNotification = async (req, res, next) => {
    const { topic } = req.params;
    try {
      const getGroupNotification = await GroupNotification.find({ topic });
      if (getGroupNotification.length > 0) {
        res.status(200).json({
          count: getGroupNotification.length,
          message: "Notification List",
          data: getGroupNotification,
        });
      } else {
        res.status(StatusCodes.OK).json({
          message: "No NOtification Yet",
          data: [],
        });
      }
    } catch (err) {
      console.log(err)
      res.status(500).json({
        err,
      });
    }
  };

// ─── PATCH /mark-all-read — buyer ─────────────────────────────────────────────
exports.markAllUserNotificationsRead = async (req, res) => {
    try {
        const userid = req.user?.id || req.user?._id;
        await Allusernotification.updateMany({ userid, view: "false" }, { view: "true" });
        res.status(200).json({ message: "All marked as read" });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

// ─── PATCH /mark-all-read — seller ───────────────────────────────────────────
exports.markAllSellerNotificationsRead = async (req, res) => {
    try {
        const userid = req.user?.id || req.user?._id;
        await Sellernotification.updateMany({ userid, view: "false" }, { view: "true" });
        res.status(200).json({ message: "All marked as read" });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};
