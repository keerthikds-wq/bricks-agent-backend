const { model, Schema } = require("mongoose");

const supportSchema = new Schema(
    {
        fullname: {
            type: String, 
        },
        email: {
            type: String,
        },
        subject: {
            type: String,
        },
        message: {
            type: String,
           
        },
        sender: {
            type: Schema.Types.ObjectId,
            ref:"seller"
        },
        
    },
    { timestamps: true });
module.exports = model("support", supportSchema);