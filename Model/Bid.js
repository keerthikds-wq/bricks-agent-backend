const { model, Schema } = require("mongoose");

const bidSchema = new Schema(
    {
        order: {
            type: Schema.Types.ObjectId,
            ref: 'order',
        },
        description: String,
        representative_name: String,
        representative_no: Number,
        price: {
            type: Number,
        },
        delivery_date: {
            type: String,
        },
        seller: {
            type: Schema.Types.ObjectId,
            ref: 'seller',
        },
        // pending = awaiting buyer decision
        // accepted = buyer accepted this bid
        // declined = buyer declined this bid
        status: {
            type: String,
            enum: ['pending', 'accepted', 'declined'],
            default: 'pending',
        },
        is_delete: {
            type: Number,
            enum: [0, 1],
            default: 0
        }
    },
    { timestamps: true });
module.exports = model("bid", bidSchema);
