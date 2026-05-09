const { model, Schema } = require("mongoose");

const NotificationSchema = new Schema(
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
        click_action:{type: String},
        notificationid: {
            type:String,
        },
        userid:{
            type:Schema.Types.ObjectId,
            ref:"user"
        },
        view:{
            type:String,
            default:"false"
        }
        
    },
    { timestamps: true });
module.exports = model("Notification", NotificationSchema);