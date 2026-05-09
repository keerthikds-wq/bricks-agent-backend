const { model, Schema } = require("mongoose");

const productSchema = new Schema(
    {
        name: String,
        description: String,
        size: String,
        //image: [String],

        image: [
            {
                public_id:{type: String, required: true},
                secure_url:{type: String, required: true}
            }
        ],



        min_quantity: {
            type: Number,
            default: 0
        },
        min_price: {
            type: Number,
            default: 0
        },
        max_price: {
            type: Number,
            default: 0
        },
        subtitle:{
            type: String,
        },
        manufacturer:{
            type: String,
        },
        disclaimer:{
            type: String,
        },
        category: {
            type: Schema.Types.ObjectId,
            ref: 'category'
        },
        subcategory: {
            type: Schema.Types.ObjectId,
            ref: 'subcategory',
        },
        brand: {
            type: Schema.Types.ObjectId,
            ref: 'brand',
        },
        is_delete: {
            type: Number,
            enum: [0, 1],
            default: 0
        }
    },
    { timestamps: true });
module.exports = model("product", productSchema);