const { jwt, md5, app } = require('../config');
const Seller = require("../Model/Seller");
const Otp = require('../Model/Otp');
const { randomString } = require('../Utils');
const { sendOtp } = require("../Utils/sms");
const cloudinary = require("../Utils/cloudinary");

const loginSeller = async (req, res, next) => {
    const { phone } = req.body;
    if (!phone) {
        return res.status(400).send({ "status": 400, "data": null, "message": "Phone number is required", "error": true });
    }
    try {
        const otpnum = Math.floor(1000 + Math.random() * 9000);
        await Otp.updateMany({ phone }, { "is_delete": 1 });
        await Otp.create({ Otp: otpnum, phone });
        // Fire SMS asynchronously — respond in <200ms regardless of SMS status
        sendOtp(phone, otpnum).catch(err => console.error('SMS async error:', err));
        console.log(`OTP generated for seller ${phone}: ${otpnum}`);
        return res.send({ "status": 200, "message": "OTP sent successfully", "error": false });
    } catch (error) {
        console.error("loginSeller error:", error.message);
        return res.status(500).send({ "status": 500, "data": null, "message": "Something went wrong. Please try again.", "error": true });
    }
};

const signupSeller = async (req, res, next) => {
    try {
        if (await Seller.exists({ phone: req.body.phone })) {
            return res.status(401).send({ "status": 401, "data": null, "message": "Seller already exists", "error": false });
        }
        const result = await cloudinary.uploader.upload(req.file.path);
        const data = new Seller({
            name: req.body.name,
            email: req.body.email,
            phone: req.body.phone,
            pincode: req.body.pincode,
            profile: result.secure_url,
            gst: req.body.gst,
            longitude: req.body.longitude,
            latitude: req.body.latitude,
            address: req.body.address,
        });
        const seller = await data.save();
        const token = jwt.sign({
            id: seller._id,
            email: seller.email,
            phone: seller.phone,
            isSeller: seller.isSeller,
        }, process.env.SECRET, { expiresIn: "3d" });
        return res.send({ "status": 200, "data": seller, token, "message": "Seller created successfully", "error": false });
    } catch (error) {
        console.log(error);
        return res.status(401).send({ "status": 401, "data": null, "message": "Something went wrong!", "error": true });
    }
};

// Email OTP removed — authentication is mobile-OTP only.
// TODO: WhatsApp OTP login (replace SMS flow) — coming soon.
const emailVerify = (req, res) =>
    res.status(410).json({ status: 410, data: null, message: 'Email OTP is no longer supported. Please use mobile OTP.', error: true });

const otpVerifyLogin = async (req, res, next) => {
    const { phone, otp } = req.body;
    // Master OTP bypass for testing — remove before production
    const MASTER_OTP = "0000";
    try {
        // Allow master OTP to bypass DB lookup entirely
        if (String(otp) === MASTER_OTP) {
            const seller = await Seller.findOne({ phone, is_delete: 0 });
            if (seller) {
                app.set("data", { user: seller, uuid: md5(randomString()) });
                const token = jwt.sign({
                    id: seller._id,
                    email: seller.email,
                    phone: seller.phone,
                    isSeller: seller.isSeller,
                }, process.env.SECRET, { expiresIn: "3d" });
                return res.send({ "status": 200, "data": seller, token, "exist": true, "message": "Otp verified successfully", "error": false });
            }
            return res.send({ "status": 200, "data": null, "exist": false, "message": "Otp verified successfully", "error": false });
        }

        const o = await Otp.findOne({ phone, "is_delete": 0 });
        if (!o) {
            return res.status(401).send({ "status": 401, "data": null, "message": "OTP not found or already used. Please request a new OTP.", "error": true });
        }
        const expiry = new Date(new Date(o.createdAt).getTime() + (5 * 60000));
        if (new Date() > expiry) {
            return res.send({ "status": 200, "data": null, "message": "Otp timed-out", "error": false });
        }
        if (String(otp) !== String(o.Otp)) {
            return res.status(401).send({ "status": 401, "data": null, "message": "Otp verification failed", "error": true });
        }

        const seller = await Seller.findOne({ phone, is_delete: 0 });
        if (seller) {
            app.set("data", { user: seller, uuid: md5(randomString()) });
            const token = jwt.sign({
                id: seller._id,
                email: seller.email,
                phone: seller.phone,
                isSeller: seller.isSeller,
            }, process.env.SECRET, { expiresIn: "3d" });
            return res.send({ "status": 200, "data": seller, token, "exist": true, "message": "Otp verified successfully", "error": false });
        }
        return res.send({ "status": 200, "data": null, "exist": false, "message": "Otp verified successfully", "error": false });
    } catch (error) {
        console.error("seller otpVerifyLogin error:", error.message);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": true });
    }
};

const otpVerify = async (req, res, next) => {
    const { phone, otp } = req.body;
    try {
        const o = await Otp.findOne({ phone, "is_delete": 0 });
        if (!o) {
            return res.status(401).send({ "status": 401, "data": null, "message": "OTP not found or already used. Please request a new OTP.", "error": true });
        }
        const expiry = new Date(new Date(o.createdAt).getTime() + (5 * 60000));
        if (new Date() > expiry) {
            return res.send({ "status": 401, "data": null, "message": "Otp timed-out", "error": false });
        }
        if (String(otp) === String(o.Otp)) {
            return res.send({ "status": 200, "data": null, "message": "Otp verified successfully", "error": false });
        }
        return res.status(401).send({ "status": 401, "data": null, "message": "Otp verification failed", "error": true });
    } catch (error) {
        console.error("seller otpVerify error:", error.message);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": true });
    }
};

const logout = (req, res, next) => {
    try {
        req.session.destroy();
        return res.send({ status: true, msg: "Seller Logged out successfully" });
    } catch (error) {
        console.log(error.message);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": true });
    }
};

module.exports = { loginSeller, signupSeller, emailVerify, otpVerify, otpVerifyLogin, logout };
