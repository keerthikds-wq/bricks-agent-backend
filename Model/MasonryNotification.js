const { model, Schema } = require("mongoose");

const MasonryNotificationSchema = new Schema(
  {
    title:          { type: String },
    body:           { type: String },
    message:        { type: String },
    notificationid: { type: String },
    userid:         { type: Schema.Types.ObjectId, ref: "Masonry" },
    view:           { type: String, default: "false" },
    type:           { type: String, default: "general" }, // review | rfq | system | general
  },
  { timestamps: true }
);

module.exports = model("MasonryNotification", MasonryNotificationSchema);
