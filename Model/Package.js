const { model, Schema } = require("mongoose");

const PackageSchema = new Schema(
    {
        label: {
            type: String,
            default: '',
        },
        month: {
            type: Number,
            required: true,
        },
        single: {
            type: Number,
            required: true,
        },
        complete: {
            type: Number,
            required: true,
        },
        type: {
            type: String,
            enum: ['seller', 'builder_pro', 'masonry', 'free'],
            default: 'seller',
        },
        features: {
            type: [String],
            default: [],
        },
        active: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

module.exports = model("Package", PackageSchema);
