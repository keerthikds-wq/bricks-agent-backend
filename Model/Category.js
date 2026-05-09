const { model, Schema } = require("mongoose");

const categorySchema = new Schema(
    {
        name: String,
        created_by: {
            type: Schema.Types.ObjectId,
            ref: 'admin'
        },
        image: String,
        is_delete: {
            type: Number,
            enum: [0, 1],
            default: 0
        },
        cloudinaryid: String,
    },
    { timestamps: true });
module.exports = model("category", categorySchema);