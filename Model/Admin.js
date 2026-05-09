const { model, Schema } = require("mongoose");
const userSchema = new Schema(
    {
        name: {
            type: String,
            required: true,
        },
        email: {
            type: String,
            required: true,
            // match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please fill a valid email address']
        },
        phone: {
            type: String,
            min: 10,
            max: 10,
            required: true,
        },
        password: {
            type: String,
            required: true,
            // match: [/(?=^.{8,}$)((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, "Password should be minimum 8 letter contain 1 special character, uppercase letter and numbers"]
        },
        profile: String,
        is_verified: {
            type: Number,
            enum: [0, 1],
            default: 0,
        },
        isAdmin: {
            type: Boolean,
            default:true
            //default: 0,
        },
        active: {
            type: Number,
            enum: [0, 1],
            default: 0,
        },
        is_delete: {
            type: Number,
            enum: [0, 1],
            default: 0
        }
    },
    { timestamps: true }
);
module.exports = model("Admin", userSchema);
