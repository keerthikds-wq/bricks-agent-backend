const { model, Schema } = require("mongoose");

const AllUserNotificationSchema = new Schema(
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
        fcm_token: [{
            type: Array,
           
        }],
        notificationid: {
            type:String,
        },
        userid:[{
            type:Schema.Types.ObjectId,
            ref:"user"
        }],
        view:{
            type:String,
            default:"false"
        }
        
    },
    { timestamps: true });
module.exports = model("Allusernotification", AllUserNotificationSchema);