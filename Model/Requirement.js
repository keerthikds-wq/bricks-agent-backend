const { model, Schema } = require("mongoose");

const requirementSchema = new Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true,
        },
        quantity: {
            type: Number,
            required: true,
        },
        unit: {
            type: String,
            default: "Bags",
        },
        message: {
            type: String,
            default: "",
        },
        user: {
            type: Schema.Types.ObjectId,
            ref: "user",
            required: true,
        },
        status: {
            type: String,
            enum: ["open", "closed"],
            default: "open",
        },
        is_delete: {
            type: Number,
            enum: [0, 1],
            default: 0,
        },
    },
    { timestamps: true }
);

module.exports = model("requirement", requirementSchema);
