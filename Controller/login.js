const { jwt, sg_mail, md5, fs, path, app, cloudinary } = require('../config');
const User = require("../Model/User");
const Otp = require('../Model/Otp');
const { randomString } = require('../Utils');
const axios = require('axios');
const { sendOtp } = require("../Utils/sms");

const loginUser = async (req, res, next) => {
    const { phone } = req.body;
    if (!phone) {
        return res.status(400).send({ "status": 400, "data": null, "message": "Phone number is required", "error": true });
    }
    try {
        const otpnum = Math.floor(1000 + Math.random() * 9000);
        await Otp.updateMany({ phone }, { "is_delete": 1 });
        await Otp.create({ Otp: otpnum, phone });
        // Fire SMS asynchronously — don't await, so login responds in <200ms
        sendOtp(phone, otpnum).catch(err => console.error('SMS async error:', err));
        console.log(`OTP generated for ${phone}: ${otpnum}`);
        return res.send({ "status": 200, "message": "OTP sent successfully", "error": false });
    } catch (error) {
        console.error("loginUser error:", error.message);
        return res.status(500).send({ "status": 500, "data": null, "message": "Something went wrong. Please try again.", "error": true });
    }
};

const signupUser = async (req, res, next) => {
    try {
        if (await User.exists({ phone: req.body.phone })) {
            return res.status(401).send({ "status": 401, "data": null, "message": "User already exists", "error": false });
        }
        const result = await cloudinary.uploader.upload(req.file.path);
        const data = new User({
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
        const user = await data.save();
        const token = jwt.sign({
            id: user._id,
            email: user.email,
            phone: user.phone,
            isUser: user.isUser,
        }, process.env.SECRET, { expiresIn: "3d" });
        return res.send({ "status": 200, "data": user, token, "message": "User created successfully", "error": false });
    } catch (error) {
        console.log(error.message);
        return res.status(401).send({ "status": 401, "data": null, "message": "Something went wrong!", "error": true });
    }
};

/**
 * Unified registration — the single way an account is created.
 *
 * Replaces the four separate signup flows (user / seller / builder / masonry).
 * A person now picks what they are once, and everything else follows from
 * `role`:
 *
 *   builder      self-registers; the only paying role
 *   client       self-registers, or is auto-linked when a builder enters their
 *                phone on a project
 *   field_staff  normally arrives through a builder's invite; accepting one
 *                promotes the account (see projects.acceptInvite)
 *   vendor       arrives through a builder's vendor invite
 *
 * Only builder and client may be chosen here. Letting someone self-declare as
 * field staff would create site accounts attached to no builder, which is
 * exactly the orphaned-role mess this merge exists to remove.
 *
 * Unlike the old signupUser this does NOT require a profile image — demanding
 * a photo upload before a builder can even see the product cost signups for no
 * benefit.
 */
const registerUser = async (req, res, next) => {
    try {
        const { name, phone, email, pincode, role, longitude, latitude } = req.body;

        if (!name || !phone) {
            return res.status(400).send({
                status: 400, data: null, error: true,
                message: "Name and phone number are required",
            });
        }
        if (!['builder', 'client'].includes(role)) {
            return res.status(400).send({
                status: 400, data: null, error: true,
                message: "Choose whether you are a builder or a home owner",
            });
        }

        const existing = await User.findOne({ phone });
        if (existing) {
            // Idempotent-ish: a returning user who hits register instead of
            // login should be told plainly, not handed a duplicate-key stack.
            return res.status(409).send({
                status: 409, data: null, error: true,
                message: "An account already exists for this number. Please log in.",
            });
        }

        // Profile image is optional. multer gives us req.file only when sent.
        let profile;
        if (req.file && req.file.path) {
            try {
                const up = await cloudinary.uploader.upload(req.file.path);
                profile = up.secure_url;
            } catch (e) {
                console.error('register: profile upload failed (non-fatal):', e.message);
            }
        }

        const user = await User.create({
            name,
            phone,
            email: email || undefined,
            pincode: pincode || '000000',
            profile,
            role,
            longitude: longitude ? String(longitude) : undefined,
            latitude: latitude ? String(latitude) : undefined,
            // Builders start their free trial the moment they sign up — the
            // paywall reads this, so it must be set at creation.
            ...(role === 'builder'
                ? { plan: 'trial', trial_started_at: new Date() }
                : {}),
        });

        // Pre-linked by a builder before they signed up? Attach them now so the
        // project is waiting on first open rather than needing an invite.
        if (role === 'client') {
            try {
                const Project = require('../Model/Project');
                const ProjectMember = require('../Model/ProjectMember');
                const pending = await Project.find({
                    client_phone: phone, client_id: null, is_delete: 0,
                }).select('_id builder_id');

                for (const p of pending) {
                    await Project.updateOne({ _id: p._id }, { $set: { client_id: user._id } });
                    await ProjectMember.updateOne(
                        { project_id: p._id, user_id: user._id, role: 'client' },
                        {
                            $set: {
                                ...ProjectMember.defaultCapabilities('client'),
                                status: 'active',
                                invited_by: p.builder_id,
                                accepted_at: new Date(),
                            },
                        },
                        { upsert: true }
                    );
                }
            } catch (e) {
                console.error('register: client backfill failed (non-fatal):', e.message);
            }
        }

        const token = jwt.sign(
            { id: user._id, email: user.email, phone: user.phone, isUser: true },
            process.env.SECRET,
            { expiresIn: "3d" }
        );

        return res.send({
            status: 200, error: false,
            data: user, token,
            message: "Account created successfully",
        });
    } catch (error) {
        console.error("registerUser error:", error.message);
        return res.status(500).send({
            status: 500, data: null, error: true,
            message: "Could not create your account. Please try again.",
        });
    }
};

const emailVerify = async (req, res, next) => {
    const { email } = req.body;
    try {
        const user = await User.findOne({ email, is_delete: 0 });
        if (!user) {
            return res.status(401).send({ "status": 401, "data": null, "message": "User not found", "error": true });
        }
        let otpnum = Math.floor(1000 + Math.random() * 9000);
        await Otp.updateMany({ "is_delete": 1 });
        const otp = await Otp.create({ Otp: otpnum, email });
        const msg = {
            to: user.email,
            from: process.env.EMAIL,
            subject: 'email verify',
            text: 'OTP : ' + otp.Otp,
            html: '<strong>OTP : ' + otp.Otp + '</strong>',
        };
        sg_mail.send(msg).then(() => {
            return res.send({ "status": 200, "message": "Otp send successfully", "error": false });
        }).catch((error) => {
            console.error(error);
            return res.status(500).send({ "status": 500, "message": "Otp send Failed", "error": true });
        });
    } catch (error) {
        console.log(error.message);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": true });
    }
};

const otpVerifyLogin = async (req, res, next) => {
    const { phone, otp } = req.body;

    // The master-OTP bypass is gone.
    //
    // It began as a hardcoded "0000" with a "remove before production" comment,
    // which meant any phone number could be signed into by anyone who knew it.
    // It was then put behind ALLOW_MASTER_OTP so the default deployment had no
    // bypass — but a backdoor behind an env var is still a backdoor, and it only
    // existed because the SMS provider had been retired and there was genuinely
    // no other way in.
    //
    // There is now: /api/auth/firebase. Firebase both delivers the code and
    // vouches for the result, so nothing here needs a way to skip the check.
    // Removing it also removes the risk that the flag is set once for a demo
    // and never unset.
    //
    // This endpoint stays only for handsets running an older build. It cannot
    // succeed — nothing writes an Otp row any more — and that is the intended
    // outcome: an old app should fail to sign in rather than sign in weakly.

    try {
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

        const user = await User.findOne({ phone, is_delete: 0 });
        const string = randomString();
        if (user) {
            app.set("data", { user, uuid: md5(string) });
            const token = jwt.sign({
                id: user._id,
                email: user.email,
                phone: user.phone,
                isUser: user.isUser,
            }, process.env.SECRET, { expiresIn: "3d" });
            return res.send({ "status": 200, "data": user, "exist": true, token, "message": "Otp verified successfully", "error": false });
        }
        return res.send({ "status": 200, "data": null, "exist": false, "message": "Otp verified successfully", "error": false });
    } catch (error) {
        console.error("otpVerifyLogin error:", error.message);
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
        console.error("otpVerify error:", error.message);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": true });
    }
};

const logout = (req, res, next) => {
    try {
        req.session.destroy();
        return res.send({ status: true, msg: "User Logged out successfully" });
    } catch (error) {
        console.log(error.message);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": true });
    }
};

module.exports = { loginUser, signupUser, registerUser, emailVerify, otpVerify, otpVerifyLogin, logout };
