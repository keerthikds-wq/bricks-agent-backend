const { model, Schema } = require("mongoose");

const MasonryPremiumSchema = new Schema(
    {
        plan_type: {
            type: String,
        },
        purchase_date: {
            type: Date,
        },
        total_cost: {
            type: Number,
        },
        plan_start_date: {
            type: Date,
        },
        plan_end_date: {
            type: Date,
        },
        payment_id: {
            type: String,
        },
        message: {
            type: String,
        },
        userID: {
            type: Schema.Types.ObjectId,
            ref: "masonry",   // masonry contractors subscribe
        },
        packageID: {
            type: Schema.Types.ObjectId,
            ref: "Package",
        },
    },
    { timestamps: true }
);

module.exports = model("MasonryPremium", MasonryPremiumSchema);
