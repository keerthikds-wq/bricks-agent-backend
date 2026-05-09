const { app, express, jwt, sg_mail, md5, fs, path } = require('../config');
const router = express.Router();
const User = require("../Model/User");
const Otp = require('../Model/Otp');
const { randomString } = require('../Utils');
const {StatusCodes} =require("http-status-codes")

const getUser = async (req, res, next) => {
    let id = req.params.id;
    try {
        const user = await User.findOne({ _id: id, is_delete: 0 });
        return res.send({ "status": 200, "data": user, "message": "User details for " + user.id, "error": false });
    } catch (error) {
        console.log(error.message);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": true });
    }
}

const updateUser = async (req, res, next) => {
    try {
        let profile = "";
        if (req.files) {
            if (req.files.profile) {
                let uploadPath = process.env.PROFILE_FOLDER;
                let sampleFiles = req.files.profile;
                let name = randomString() + path.extname(sampleFiles.name);
                sampleFiles.mv(uploadPath + name);
                profile = process.env.PROFILE_FOLDER + name;
            }
        }
        if (profile) {
            req.body.profile = profile;
        }
        let id = req.params.id;
        await User.updateOne({ _id: id }, req.body);
        const user = await User.findOne({ _id: id }, req.body);
        return res.send({ "status": 200, "data": user, "message": "Updated details for " + user.id, "error": false });
    } catch (error) {
        console.log(error.message);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": true });
    }
}

const activeInactiveUser = async (req, res, next) => {
    try {
        let id = req.params.id;
        const user = await User.updateOne({ _id: id }, req.body);
        let str = (req.body.active == 1) ? "active" : "in-active";
        return res.send({ "status": 200, "data": user, "message": "User set " + str + " for " + user.id, "error": false });
    } catch (error) {
        console.log(error.message);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": true });
    }
}

const allUsers = async (req, res, next) => {
    try {
        const users = await User.find({ is_delete: 0 });
        return res.send({ "status": 200, "data": users, "message": "Sucessfully fetched  all Users", "error": false });
    } catch (error) {
        console.log(error.message);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": true });
    }
}

const deleteUser = async (req, res, next) => {
    try {
        let id = req.params.id;
        const user = await User.updateOne({ _id: id }, { is_delete: 1 });
        return res.send({ "status": 200, "data": user, "message": "Deleted details for " + user.id, "error": false });
    } catch (error) {
        console.log(error.message);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": true });
    }
}



const updateToken=async (req, res, next) => {
    const userid=req.user.id
        const updaters=await User.findById(userid)
    try{
        
        if(updaters){
            const updates=await User.findByIdAndUpdate(userid,{fcm_token:req.body.fcm_token},{new:true})
            if(updates){
                res.status(StatusCodes.OK).json({
                    message: "Token Updated",
                    status: StatusCodes.OK,
                    updates
                })
            }else{
                res.status(StatusCodes.BAD_REQUEST).json({
                    message: "SOmething Went Wrong",
                    status: StatusCodes.BAD_REQUEST
                })
            }

        }else{
            res.status(StatusCodes.NOT_FOUND).json({
                message: "Invalid User ID",
                status: StatusCodes.NOT_FOUND
            })
        }
    }
    catch (error) {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(error)
    }
}

module.exports = { updateToken,getUser, updateUser, allUsers, deleteUser, activeInactiveUser };