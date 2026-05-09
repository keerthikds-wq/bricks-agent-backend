const { model, Schema } = require("mongoose");

const SellerNotificationSchema = new Schema(
    {
        title: {
            type: String, 
        },
        body: {
            type: String,
        },
        message: {
            type: String,
        },
        fcm_token: {
            type: String,
           
        },
        notificationid: {
            type:String,
        },
        userid:{
            type:Schema.Types.ObjectId,
            ref:"seller"
        },
        view:{
            type:String,
            default:"false"
        }
        
    },
    { timestamps: true });
module.exports = model("Sellernotification", SellerNotificationSchema);