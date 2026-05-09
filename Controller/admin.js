const { app, express, jwt, sg_mail, md5, fs, path } = require('../config');
const { randomString } = require('../Utils');
const router = express.Router();
const Admin = require("../Model/Admin");
const Otp = require('../Model/Otp');
const getAdmin = async (req, res, next) => {
    let id = req.params.id;
    try {
        const admin = await Admin.findOne({ _id: id, is_delete: 0 });
        return res.send({ "status": 200, "data": admin, "message": "Admin details for " + admin.id, "error": false });
    } catch (error) {
        console.log(error.message);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": true });
    }
}
const updateAdmin = async (req, res, next) => {
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
        await Admin.updateOne({ _id: id }, req.body);
        const admin = await Admin.findOne({ _id: id });
        return res.send({ "status": 200, "data": admin, "message": "Updated details for " + admin.id, "error": false });
    } catch (error) {
        console.log(error.message);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": true });
    }
}

const deleteAdmin = async (req, res, next) => {
    try {
        let id = req.params.id;
        const admin = await Admin.updateOne({ _id: id }, { is_delete: 1 });
        return res.send({ "status": 200, "data": admin, "message": "Updated details for " + admin.id, "error": false });
    } catch (error) {
        console.log(error.message);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": true });
    }
}

const allAdmins = async (req, res, next) => {
    try {
        const admins = await Admin.find({ is_delete: 0 });
        return res.send({ "status": 200, "data": admins, "message": "Sucessfully fetched  all Admins", "error": false });
    } catch (error) {
        console.log(error.message);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": true });
    }
}

module.exports = { getAdmin, updateAdmin, allAdmins, deleteAdmin };