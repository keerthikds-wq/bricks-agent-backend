const { jwt, md5 } = require('../config');
const Admin = require("../Model/Admin");
const Otp = require('../Model/Otp');
const { randomString } = require('../Utils');

const loginAdmin = async (req, res, next) => {
    const { email, password } = req.body;
    try {
        const admin = await Admin.findOne({ email, is_delete: 0 });
        if (admin) {
            if (admin.password == md5(password)) {
                //token = jwt.sign({ admin, exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 30) }, process.env.SECRET);
                const token = jwt.sign({
                    id:admin._id,
                    email:admin.email,
                    phone:admin.phone,
                    isAdmin:admin.isAdmin,
                }, process.env.SECRET, { expiresIn: "3d" });

                return res.send({ "status": 200, token, "data": admin, "message": "Admin logged in successfully", "error": false });
            } else {
                return res.send({ "status": 200, "data": null, "message": "Password do not match", "error": false });
            }
        } else {
            return res.status(401).send({ "status": 401, "data": null, "message": "Admin not found", "error": true });
        }
    } catch (error) {
        console.log(error.message);
        return res.status(401).send({ "status": 401, "data": null, "message": "Something went wrong!", "error": true });
    }
}
const signupAdmin = async (req, res, next) => {
    const { name, email, password, phone } = req.body;
    try {
        req.body.password = md5(req.body.password);
        const admin = await Admin.create(req.body);
        return res.send({ "status": 200, "data": admin, "message": "Admin created successfully", "error": false });
    } catch (error) {
        console.log(error.message);
        return res.status(401).send({ "status": 401, "data": null, "message": "Something went wrong!", "error": true });
    }
}
// TODO: forgot-password via WhatsApp OTP — coming soon.
const forgotPassword = (req, res) =>
    res.status(410).json({ status: 410, data: null, message: 'Email-based password reset is no longer supported. WhatsApp reset coming soon.', error: true });
// Email OTP removed — use admin password login.
// TODO: WhatsApp OTP for admin — coming soon.
const emailVerify = (req, res) =>
    res.status(410).json({ status: 410, data: null, message: 'Email OTP is no longer supported.', error: true });
const changePassword = async (req, res, next) => {
    const { email, password, prevpassword } = req.body;
    try {
        const admin = await Admin.findOne({ email, is_delete: 0 });
        if (prevpassword != '' && (md5(prevpassword) != admin.password)) {
            console.log("error pass");
            return res.status(401).send({ "status": 401, "data": null, "message": "Admin passwords do not match", "error": true });
        } else {
            // console.log("error");
            if (Object.keys(admin).length !== 0) {
                admin.password = md5(password);
                await admin.save();
                return res.send({ "status": 200, "data": admin, "message": "Password updated successfully", "error": false });
            } else {
                console.log("error else");
                return res.status(401).send({ "status": 401, "data": null, "message": "Admin not found", "error": true });
            }
        }
    } catch (error) {
        console.log(error);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": true });
    }
}
const otpVerify = async (req, res, next) => {
    const { email, otp, verify } = req.body;
    try {
        const o = await Otp.findOne({ email, "is_delete": 0 });
        let dt = new Date(o.createdAt);
        if (new Date(dt.getTime() + (5 * 60000)) > new Date()) {
            if (otp == o.Otp) {
                if (verify == 'email') {
                    const admin = await Admin.findOne({ email, is_delete: 0 });
                    admin.is_verified = 1;
                    await admin.save();
                    return res.send({ "status": 200, "data": null, "message": "Otp verified sucessfully", "error": false });
                }
                return res.send({ "status": 200, "data": null, "message": "Otp verified sucessfully", "error": false });
            } else {
                return res.status(401).send({ "status": 401, "data": null, "message": "Otp verification failed", "error": true });
            }
        } else {
            return res.send({ "status": 200, "data": null, "message": "Otp timed-out", "error": false });
        }
    } catch (error) {
        console.log(error.message);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": true });
    }
}

module.exports = { loginAdmin, signupAdmin, forgotPassword, emailVerify, changePassword, otpVerify };
