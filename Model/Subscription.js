const { model, Schema } = require("mongoose");

const subscriptionSchema = new Schema(
    {
        name: String,
        price: Number,
        timespan: {
            type: Number,
            default: 1
        },
        type: {
            type: String,
            enum: ["seller", "user"],
            default: "user"
        },
        is_delete: {
            type: Number,
            enum: [0, 1],
            default: 0
        }
    },
    { timestamps: true });
module.exports = model("subscription", subscriptionSchema);