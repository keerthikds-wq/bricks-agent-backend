const { model, Schema } = require("mongoose");

const GroupNotificationSchema = new Schema(
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
    notificationid: {
      type: String,
    },
   topic: {
    type: String
   }
  },
  { timestamps: true }
);
module.exports = model("Groupnotification", GroupNotificationSchema);
