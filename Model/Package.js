const { model, Schema } = require("mongoose");

const PackageSchema = new Schema(
    {
        month: {
            type: Number, 
        },
        single: {
            type: Number,
        },
        complete: {
            type: Number,
        },
       
        
    },
    { timestamps: true });
module.exports = model("Package", PackageSchema);