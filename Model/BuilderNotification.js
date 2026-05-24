const { model, Schema } = require("mongoose");

const BuilderNotificationSchema = new Schema(
  {
    title:          { type: String },
    body:           { type: String },
    message:        { type: String },
    notificationid: { type: String },
    userid:         { type: Schema.Types.ObjectId, ref: "Builder" },
    view:           { type: String, default: "false" },
    type:           { type: String, default: "general" }, // order | review | rfq | system | general
  },
  { timestamps: true }
);

module.exports = model("BuilderNotification", BuilderNotificationSchema);
