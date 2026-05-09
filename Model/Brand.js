const { model, Schema } = require("mongoose");

const brandSchema = new Schema(
    {
        name: String,
        image: String,
        is_delete: {
            type: Number,
            enum: [0, 1],
            default: 0
        },
        cloudinaryid: String,
    },
    { timestamps: true });
module.exports = model("brand", brandSchema);