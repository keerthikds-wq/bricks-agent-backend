const { model, Schema } = require("mongoose");

const ordersSchema = new Schema(
    {
        product: {
            type: Schema.Types.ObjectId,
            ref: 'product',
        },
        user: {
            type: Schema.Types.ObjectId,
            ref: 'user',
        },
        bid: {
            type: Schema.Types.ObjectId,
            ref: 'bid',
        },
        quantity: {
            type: Number,
            default: 1
        },
        distance: {
            type: String,
            default: "0"
        },
        longitude: {
            type: String,
        },
        latitude: {
            type: String,
        },
        address: {
            type: String,
        },
        status: {
            type: String,
            enum: ["pending", "ongoing", "completed"],
            default: "pending"
        },
        // Sellers who explicitly declined this order — filtered out of their "All Orders" tab
        declined_by: [{
            type: Schema.Types.ObjectId,
            ref: 'seller',
        }],
        is_delete: {
            type: Number,
            enum: [0, 1],
            default: 0
        }
    },
    { timestamps: true });
module.exports = model("order", ordersSchema);
