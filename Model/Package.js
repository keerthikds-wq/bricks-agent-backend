const { model, Schema } = require("mongoose");

const PackageSchema = new Schema(
    {
        // Display label, e.g. "Monthly Plan", "Quarterly Plan"
        label: {
            type: String,
            default: '',
        },
        // Duration in months
        month: {
            type: Number,
            required: true,
        },
        // Price per month (shown on card as "₹X / month")
        single: {
            type: Number,
            required: true,
        },
        // Total charged price (month * single or discounted)
        complete: {
            type: Number,
            required: true,
        },
        // Who this plan is for: 'seller', 'buyer', or 'both'
        type: {
            type: String,
            enum: ['seller', 'buyer', 'both'],
            default: 'seller',
        },
        // Whether this plan is active/visible in the app
        active: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

module.exports = model("Package", PackageSchema);
