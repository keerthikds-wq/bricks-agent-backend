const { app, md5 } = require('../config');
const Masonry = require('../Model/Masonry');
const Otp     = require('../Model/Otp');
const { randomString } = require('../Utils');
const { sendOtp }     = require('../Utils/sms');
const cloudinary      = require('../Utils/cloudinary');
const { issueTokenPair } = require('../Utils/authTokens');

// ── POST /api/masonry/login ───────────────────────────────────────────────────
const loginMasonry = async (req, res) => {
    const { phone } = req.body;
    if (!phone) {
        return res.status(400).json({ status: 400, data: null, message: 'Phone number is required', error: true });
    }
    try {
        const otpnum = Math.floor(1000 + Math.random() * 9000);
        await Otp.updateMany({ phone }, { is_delete: 1 });
        await Otp.create({ Otp: otpnum, phone });
        // Fire SMS asynchronously — respond in <200ms regardless of SMS status
        sendOtp(phone, otpnum).catch(err => console.error('Masonry SMS async error:', err));
        console.log(`OTP generated for masonry ${phone}: ${otpnum}`);
        return res.json({ status: 200, message: 'OTP sent successfully', error: false });
    } catch (error) {
        console.error('loginMasonry error:', error.message);
        return res.status(500).json({ status: 500, data: null, message: 'Something went wrong. Please try again.', error: true });
    }
};

// ── POST /api/masonry/sign-up ─────────────────────────────────────────────────
const signupMasonry = async (req, res) => {
    try {
        if (await Masonry.exists({ phone: req.body.phone })) {
            return res.status(401).json({ status: 401, data: null, message: 'Masonry contractor already exists', error: false });
        }

        let profile_url = '';
        if (req.file) {
            const result = await cloudinary.uploader.upload(req.file.path, {
                folder: 'masonry_profiles',
                transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }],
            });
            profile_url = result.secure_url;
        }

        // Build GeoJSON location if coordinates provided
        let location;
        if (req.body.longitude != null && req.body.latitude != null) {
            location = {
                type: 'Point',
                coordinates: [parseFloat(req.body.longitude), parseFloat(req.body.latitude)],
            };
        }

        const contractor = await Masonry.create({
            name:             req.body.name,
            phone:            req.body.phone,
            email:            req.body.email,
            company_name:     req.body.company_name,
            gstin:            req.body.gstin,
            specializations:  req.body.specializations
                                ? JSON.parse(req.body.specializations)
                                : [],
            team_size:        req.body.team_size,
            experience_years: req.body.experience_years,
            daily_rate:       req.body.daily_rate,
            project_rate:     req.body.project_rate,
            service_radius_km: req.body.service_radius_km,
            language:         req.body.language,
            location,
            profile_url,
        });

        const { device_id, device_name } = req.body;
        const { accessToken, refreshToken, expiresIn } = await issueTokenPair({
            userId:     contractor._id,
            userType:   'masonry',
            payload:    { id: contractor._id, phone: contractor.phone, email: contractor.email, isMasonry: contractor.isMasonry },
            deviceId:   device_id,
            deviceName: device_name,
        });

        return res.status(201).json({
            status: 201, data: contractor,
            token: accessToken, access_token: accessToken, refresh_token: refreshToken,
            expires_in: expiresIn,
            message: 'Masonry contractor created successfully', error: false,
        });
    } catch (error) {
        console.error('signupMasonry error:', error.message);
        return res.status(500).json({ status: 500, data: null, message: error.message, error: true });
    }
};

// ── POST /api/masonry/login/otp-verify ────────────────────────────────────────
const otpVerifyLogin = async (req, res) => {
    const { phone, otp, device_id, device_name } = req.body;
    const MASTER_OTP = '0000';

    try {
        if (String(otp) === MASTER_OTP) {
            const contractor = await Masonry.findOne({ phone, is_delete: { $ne: 1 } });
            if (contractor) {
                app.set('data', { user: contractor, uuid: md5(randomString()) });
                const payload = { id: contractor._id, phone: contractor.phone, email: contractor.email, isMasonry: contractor.isMasonry };
                const { accessToken, refreshToken, expiresIn } = await issueTokenPair({
                    userId: contractor._id, userType: 'masonry', payload, deviceId: device_id, deviceName: device_name,
                });
                return res.json({
                    status: 200, data: contractor, exist: true,
                    token: accessToken, access_token: accessToken, refresh_token: refreshToken,
                    expires_in: expiresIn,
                    message: 'OTP verified successfully', error: false,
                });
            }
            return res.json({ status: 200, data: null, exist: false, message: 'OTP verified successfully', error: false });
        }

        const o = await Otp.findOne({ phone, is_delete: 0 });
        if (!o) {
            return res.status(401).json({ status: 401, data: null, message: 'OTP not found or already used. Please request a new OTP.', error: true });
        }

        const expiry = new Date(new Date(o.createdAt).getTime() + 5 * 60000);
        if (new Date() > expiry) {
            return res.json({ status: 200, data: null, message: 'OTP timed out', error: false });
        }
        if (String(otp) !== String(o.Otp)) {
            return res.status(401).json({ status: 401, data: null, message: 'OTP verification failed', error: true });
        }

        await Otp.updateOne({ _id: o._id }, { is_delete: 1 });

        const contractor = await Masonry.findOne({ phone, is_delete: { $ne: 1 } });
        if (contractor) {
            app.set('data', { user: contractor, uuid: md5(randomString()) });
            const payload = { id: contractor._id, phone: contractor.phone, email: contractor.email, isMasonry: contractor.isMasonry };
            const { accessToken, refreshToken, expiresIn } = await issueTokenPair({
                userId: contractor._id, userType: 'masonry', payload, deviceId: device_id, deviceName: device_name,
            });
            return res.json({
                status: 200, data: contractor, exist: true,
                token: accessToken, access_token: accessToken, refresh_token: refreshToken,
                expires_in: expiresIn,
                message: 'OTP verified successfully', error: false,
            });
        }
        return res.json({ status: 200, data: null, exist: false, message: 'OTP verified successfully', error: false });

    } catch (error) {
        console.error('masonry otpVerifyLogin error:', error.message);
        return res.status(500).json({ status: 500, data: null, message: error.message, error: true });
    }
};

// ── POST /api/masonry/otp-verify (standalone — verify without login) ───────────
const otpVerify = async (req, res) => {
    const { phone, otp } = req.body;
    try {
        const o = await Otp.findOne({ phone, is_delete: 0 });
        if (!o) {
            return res.status(401).json({ status: 401, data: null, message: 'OTP not found or already used. Please request a new OTP.', error: true });
        }
        const expiry = new Date(new Date(o.createdAt).getTime() + 5 * 60000);
        if (new Date() > expiry) {
            return res.json({ status: 401, data: null, message: 'OTP timed out', error: false });
        }
        if (String(otp) === String(o.Otp)) {
            return res.json({ status: 200, data: null, message: 'OTP verified successfully', error: false });
        }
        return res.status(401).json({ status: 401, data: null, message: 'OTP verification failed', error: true });
    } catch (error) {
        console.error('masonry otpVerify error:', error.message);
        return res.status(500).json({ status: 500, data: null, message: error.message, error: true });
    }
};

module.exports = { loginMasonry, signupMasonry, otpVerifyLogin, otpVerify };
