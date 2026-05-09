const { model, Schema } = require("mongoose");

const UsersupportSchema = new Schema(
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
        sender: {type: Schema.Types.ObjectId, ref:"user",index:true},
        
    },
    { timestamps: true });
module.exports = model("Usersupport", UsersupportSchema);