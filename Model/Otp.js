const { model, Schema } = require("mongoose");
const otpSchema = new Schema(
    {
        Otp: {
            type: Number,
            required: true,
        },
        phone: {
            type: Number,
            required: true,
        },
        is_delete: {
            type: Number,
            enum: [0, 1],
            default: 0,
        }
    },
    { timestamps: true }
);
module.exports = model("Otp", otpSchema);
