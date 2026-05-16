const { app, express, jwt, sg_mail, md5, fs, path, cloudinary } = require('../config');
const router = express.Router();
const User = require("../Model/User");
const Otp = require('../Model/Otp');
const { randomString } = require('../Utils');
const { StatusCodes } = require("http-status-codes");

const getUser = async (req, res, next) => {
    let id = req.params.id;
    try {
        const user = await User.findOne({ _id: id, is_delete: 0 });
        return res.send({ status: 200, data: user, message: "User details for " + user.id, error: false });
    } catch (error) {
        console.log(error.message);
        return res.status(500).send({ status: 500, data: null, message: error.message, error: true });
    }
};

const updateUser = async (req, res, next) => {
    try {
        if (req.body.profileBase64) {
            try {
                const result = await cloudinary.uploader.upload(req.body.profileBase64, {
                    folder: 'buyer_profiles',
                    resource_type: 'image',
                    transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }],
                });
                req.body.profile = result.secure_url;
            } catch (uploadErr) {
                console.error('Cloudinary upload error:', uploadErr.message);
                return res.status(500).json({ status: 500, data: null, message: 'Photo upload failed', error: true });
            }
            delete req.body.profileBase64;
        } else if (req.files && req.files.profile) {
            const uploadPath = process.env.PROFILE_FOLDER || 'public/';
            const sampleFiles = req.files.profile;
            const name = randomString() + path.extname(sampleFiles.name);
            sampleFiles.mv(uploadPath + name);
            req.body.profile = uploadPath + name;
        }
        let id = req.params.id;
        await User.updateOne({ _id: id }, req.body);
        const user = await User.findOne({ _id: id });
        return res.send({ status: 200, data: user, message: "Updated details for " + user.id, error: false });
    } catch (error) {
        console.log(error.message);
        return res.status(500).send({ status: 500, data: null, message: error.message, error: true });
    }
};

const activeInactiveUser = async (req, res, next) => {
    try {
        let id = req.params.id;
        const user = await User.updateOne({ _id: id }, req.body);
        let str = (req.body.active == 1) ? "active" : "in-active";
        return res.send({ status: 200, data: user, message: "User set " + str + " for " + id, error: false });
    } catch (error) {
        console.log(error.message);
        return res.status(500).send({ status: 500, data: null, message: error.message, error: true });
    }
};

const allUsers = async (req, res, next) => {
    try {
        const users = await User.find({ is_delete: 0 });
        return res.send({ status: 200, data: users, message: "Successfully fetched all Users", error: false });
    } catch (error) {
        console.log(error.message);
        return res.status(500).send({ status: 500, data: null, message: error.message, error: true });
    }
};

const deleteUser = async (req, res, next) => {
    try {
        let id = req.params.id;
        await User.updateOne({ _id: id }, { is_delete: 1 });
        return res.send({ status: 200, data: null, message: "Deleted user " + id, error: false });
    } catch (error) {
        console.log(error.message);
        return res.status(500).send({ status: 500, data: null, message: error.message, error: true });
    }
};

const updateToken = async (req, res, next) => {
    const userid = req.user.id;
    try {
        const updaters = await User.findById(userid);
        if (!updaters) {
            return res.status(StatusCodes.NOT_FOUND).json({ message: "Invalid User ID", status: StatusCodes.NOT_FOUND });
        }
        const updates = await User.findByIdAndUpdate(userid, { fcm_token: req.body.fcm_token }, { new: true });
        if (updates) {
            return res.status(StatusCodes.OK).json({ message: "Token Updated", status: StatusCodes.OK, updates });
        }
        return res.status(StatusCodes.BAD_REQUEST).json({ message: "Something went wrong", status: StatusCodes.BAD_REQUEST });
    } catch (error) {
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(error);
    }
};

module.exports = { updateToken, getUser, updateUser, allUsers, deleteUser, activeInactiveUser };
