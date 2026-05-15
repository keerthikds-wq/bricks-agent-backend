const { app, express, jwt, sg_mail, md5, fs, path } = require('../config');
const router = express.Router();
const Seller = require("../Model/Seller");
const Otp = require('../Model/Otp');
const { randomString } = require('../Utils');
const {StatusCodes}= require("http-status-codes");

const getSeller = async (req, res, next) => {
    let id = req.params.id;
    try {
        // Use $ne:1 so sellers without the is_delete field (null/missing) are also found.
        // Old code used is_delete:0 (strict), which caused getSeller to return null
        // for sellers whose document pre-dates the is_delete field.
        const seller = await Seller.findOne({ _id: id, is_delete: { $ne: 1 } });
        if (!seller) {
            return res.status(404).send({ "status": 404, "data": null, "message": "Seller not found for id " + id, "error": true });
        }
        return res.send({ "status": 200, "data": seller, "message": "Seller details for " + seller.id, "error": false });
    } catch (error) {
        console.log(error.message);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": true });
    }
}
const updateSeller = async (req, res, next) => {
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
        await Seller.updateOne({ _id: id }, req.body);
        const seller = await Seller.findOne({ _id: id });
        return res.send({ "status": 200, "data": seller, "message": "Updated details for " + seller.id, "error": false });
    } catch (error) {
        console.log(error.message);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": true });
    }
}

const allSellers = async (req, res, next) => {
    try {
        const sellers = await Seller.find({ is_delete: 0 });
        return res.send({ "status": 200, "data": sellers, "message": "Sucessfully fetched  all Sellers", "error": false });
    } catch (error) {
        console.log(error.message);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": true });
    }
}

const deleteSeller = async (req, res, next) => {
    try {
        let id = req.params.id;
        const seller = await Seller.updateOne({ _id: id }, { is_delete: 1 });
        return res.send({ "status": 200, "data": seller, "message": "Deleted details for " + seller.id, "error": false });
    } catch (error) {
        console.log(error.message);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": true });
    }
}


const updateToken=async (req, res, next) => {
        const userid=req.user.id
        const updaters=await Seller.findById(userid)
    try{
        if(updaters){
            const updates=await Seller.findByIdAndUpdate(userid,{fcm_token:req.body.fcm_token},{new:true})
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
module.exports = {updateToken,getSeller, updateSeller, allSellers, deleteSeller };