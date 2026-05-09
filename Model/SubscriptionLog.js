const { model, Schema } = require("mongoose");

const subscriptionSchema = new Schema(
    {
        subscription: {
            type: Schema.Types.ObjectId,
            ref: 'subscription'
        },
        user: {
            type: Schema.Types.ObjectId,
            ref: 'user'
        },
        expiry: {
            type: new Date,
            default: new Date.now()
        },
        is_delete: {
            type: Number,
            enum: [0, 1],
            default: 0
        }
    },
    { timestamps: true });
module.exports = model("subscriptionlog", subscriptionSchema);