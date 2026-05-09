var admin=require("firebase-admin");
var fcm=require("fcm-notification");
const {StatusCodes}=require("http-status-codes");
const Notification=require("../Model/Notification")
const Allusernotification=require("../Model/allusernotification");
const Sellernotification=require("../Model/Sellernotification");
const GroupNotification = require("../Model/Groupnotification");
const User=require("../Model/User")
const Seller=require("../Model/Seller")
const crypto = require("crypto");
const {v4: uuid} = require('uuid');
const fcm_check = require('fcm-node');

var serviceAccount=require("../Utils/config.json")
const certPath=admin.credential.cert(serviceAccount);
var FCM=new fcm(certPath)
const id = uuid()
// const id = crypto.randomBytes(16).toString();

exports.sendPushNotification =async (req,res,next)=>{
    const {title,body,message,fcm_token,userid,notificationid}=req.body;
    const tokenfcm=req.params.fcm_token
    const verifye=await User.findOne({tokenfcm})
    try{
        let message={
            notification:{
                title,
                body,  
            },
            data:{
                title,
                body,
                message:req.body.message,
                fcm_token:`${req.params.fcm_token}`,
                userid:`${verifye._id}`,
                notificationid:`${id}`,
                view:"false",
                click_action:"FLUTTER_NOTIFICATION_CLICK"
                
            },
        
            token:req.params.fcm_token,

    }
    

    const insertNotification= await Notification.create(message.data)
    //await Notification.findOneAndUpdate(fcm_token,{userid:verify._id},{new:true})

    if(insertNotification){
        

        FCM.send(message, function(err,resp){
            if(err){
                return res.status(500).send({
                    message:err
                })
            }else{
                return res.status(200).send({
                    message:"Notification sent successfully",
                    data:message
                })
            }
        })
    }else{
        return res.status(StatusCodes.BAD_REQUEST).send({
            message:"Oop!!! Something went wrong",
            code:StatusCodes.BAD_REQUEST
        })
    }

    
}
    catch(err){
        console.log(err)
        throw err
    }

}
exports.sendAllUserPushNotification =async (req,res,next)=>{
    const getAllTokens=await User.find()
    console.log(getAllTokens);
    // const {title,body,message,fcm_token,userid,notificationid}=req.body;
    // const tokenfcm=req.body.fcm_token
    // const verifye=await User.find([{tokenfcm}])
    // try{
    //     let message={
    //         notification:{
    //             title,
    //             body,   
    //         },
    //         data:{
    //             title,
    //             body,
    //             message:req.body.message,
    //             fcm_token:[`${req.params.fcm_token}`],
    //             userid:[`${verifye._id}`],
    //             notificationid:`${id}`,
    //             view:"false"
                
    //         },
        
    //         token:req.body.fcm_token,

    // }
    

    // const insertNotification= await Allusernotification.create(message.data)
    //await Notification.findOneAndUpdate(fcm_token,{userid:verify._id},{new:true})

//     if(insertNotification){
//         FCM.send(message, function(err,resp){
//             if(err){
//                 return res.status(500).send({
//                     message:err
//                 })
//             }else{
//                 return res.status(200).send({
//                     message:"Notification sent successfully",
//                     data:message
//                 })
//             }
//         })
//     }else{
//         return res.status(StatusCodes.BAD_REQUEST).send({
//             message:"Oop!!! Something went wrong",
//             code:StatusCodes.BAD_REQUEST
//         })
//     }

    
// }
//     catch(err){
//         console.log(err)
//         throw err
//     }

}
exports.sellerSendPushNotification =async (req,res,next)=>{
    const {title,body,message,fcm_token,userid,view}=req.body;
    const sellerId = req.params.id;
    const verifye=await Seller.findById(sellerId);
    try{
        let message={
            notification:{
                title,
                body,
                
                
            },
            data:{
                title,
                body,
                message:req.body.message,
                fcm_token:`${verifye.fcm_token}`,
                userid:`${verifye._id}`,
                notificationid:`${id}`,
                view:"false",
                click_action:"FLUTTER_NOTIFICATION_CLICK"
                
            },
        
            token:verifye.fcm_token,

    }
    

    const insertNotification= await Sellernotification.create(message.data)
    //await Notification.findOneAndUpdate(fcm_token,{userid:verify._id},{new:true})

    if(insertNotification){
        

        FCM.send(message, function(err,resp){
            if(err){
                return res.status(500).send({
                    message:err
                })
            }else{
                return res.status(200).send({
                    message:"Notification sent successfully",
                    data:message
                })
            }
        })
    }else{
        return res.status(StatusCodes.BAD_REQUEST).send({
            message:"Oop!!! Something went wrong",
            code:StatusCodes.BAD_REQUEST
        })
    }

    
}
    catch(err){
        console.log(err)
        throw err
    }

}

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
    try {
      let message = {
        notification: {
          title,
          body,
        },
        data: {
          title,
          body,
          message: messageBody,
        },
  
        topic,
        // token: verifye.fcm_token,
      };
  
      FCM.send(message, async function (err, resp) {
        if (err) {
          return res.status(500).send({
            message: err,
          });
        } else {
          await GroupNotification.create({
            title,
            body,
            message: messageBody,
            notificationid: resp,
            topic: topic,
          });
  
          console.log({ resp });
          return res.status(200).send({
            message: "Notification sent successfully",
            data: message,
          });
        }
      });
    } catch (err) {
      console.log(err);
      throw err;
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
