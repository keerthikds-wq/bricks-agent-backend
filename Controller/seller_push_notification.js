/* var admin=require("firebase-admin");
var fcm=require("fcm-notification");
const {StatusCodes}=require("http-status-codes");
const Sellernotification=require("../Model/Sellernotification")
const Seller=require("../Model/Seller")

var serviceAccount=require("../Utils/config.json")
const certPath=admin.credential.cert(serviceAccount);
var FCM=new fcm(certPath)

exports.sendPushNotification =async (req,res,next)=>{
    const {title,body,message,fcm_token,userid}=req.body;
    const tokenfcm=req.params.id
    const verifye=await Seller.findOne({tokenfcm})
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
                userid:`${verifye._id}`
                
            },
        
            token:req.params.fcm_token,

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
 */