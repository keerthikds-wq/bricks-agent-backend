const { model, Schema } = require("mongoose");

/**
 * ProjectNotification — in-app notification tied to a project.
 *
 * Kept in its own collection rather than reusing the legacy `Notification`
 * model, because that one is keyed on fcm_token and is consumed by the
 * existing marketplace notification screens. Mixing project events into it
 * would corrupt those lists.
 *
 * Delivery is dual: a row here (the in-app bell, ported from v2 which was
 * DB-only) plus an FCM push (which v2 had no equivalent of).
 */
const projectNotificationSchema = new Schema(
    {
        user_id:    { type: Schema.Types.ObjectId, ref: "user", required: true, index: true },
        project_id: { type: Schema.Types.ObjectId, ref: "project", index: true },

        title: { type: String, required: true },
        body:  { type: String, default: "" },

        kind: {
            type: String,
            enum: ["info", "progress", "milestone", "payment", "approval",
                   "document", "rfq", "invite", "ai", "success", "warning"],
            default: "info",
            index: true,
        },

        // Deep-link target for notification taps, e.g. "/project/:id?tab=approvals".
        route: { type: String, default: "" },

        read:    { type: Boolean, default: false, index: true },
        read_at: { type: Date },

        pushed: { type: Boolean, default: false },   // whether FCM delivery succeeded
    },
    { timestamps: true }
);

projectNotificationSchema.index({ user_id: 1, read: 1, createdAt: -1 });

module.exports = model("projectnotification", projectNotificationSchema);
