const { model, Schema } = require("mongoose");

const ListSchema = new Schema(
    {
        productid: {
            type: Schema.Types.ObjectId,
            ref: 'product',
        },
 
        sellerid: {
            type: Schema.Types.ObjectId,
            ref: 'seller',
        },
        is_delete: {
            type: Number,
            enum: [0, 1],
            default: 0
        }
    },
    { timestamps: true }
);
module.exports = model("List", ListSchema);