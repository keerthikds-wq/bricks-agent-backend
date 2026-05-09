const { model, Schema } = require("mongoose");

const subcategorySchema = new Schema(
    {
        name: String,
        category: {
            type: Schema.Types.ObjectId,
            ref: 'category'
        },
        is_delete: {
            type: Number,
            enum: [0, 1],
            default: 0
        }
    },
    { timestamps: true });
module.exports = model("subcategory", subcategorySchema);