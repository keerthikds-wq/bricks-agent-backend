const { model, Schema } = require("mongoose");
const sellerSchema = new Schema(
    {
        name: {
            type: String,
            required: true,
        },
        email: {
            type: String,
        },
        phone: {
            type: String,
            min: 10,
            max: 10,
            required: true,
            unique:true
        },
        pincode: {
            type: String,
            min: 6,
            max: 6,
            required: true,
        },
        isSeller:{
            type:Boolean,
            default: true
        },
        profile: String,
        gst: String,
        fcm_token: String,
        longitude:String,
        latitude:String,
        address:String,
        is_verified: {
            type: Number,
            enum: [0, 1],
            default: 0,
        },
        active: {
            type: Number,
            enum: [0, 1],
            default: 0,
        },
        is_delete: {
            type: Number,
            enum: [0, 1],
            default: 0
        }
    },
    { timestamps: true }
);
module.exports = model("seller", sellerSchema);
