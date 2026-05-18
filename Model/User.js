const { model, Schema } = require("mongoose");
const userSchema = new Schema(
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
        profile: String,
        fcm_token: String,
        longitude:String,
        latitude:String,
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
        },
        isUser:{
            type:Boolean,
            default: true
        },
        subscription_tier: {
            type: String,
            enum: ['free', 'builder_pro'],
            default: 'free',
        },
        subscription_expires_at: {
            type: Date,
        },
    },
    { timestamps: true }
);
module.exports = model("user", userSchema);
