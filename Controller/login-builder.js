const { jwt, app, md5 } = require('../config');
const Builder = require('../Model/Builder');
const Otp     = require('../Model/Otp');
const { randomString } = require('../Utils');
const { sendOtp }     = require('../Utils/sms');
const cloudinary      = require('../Utils/cloudinary');

// ── POST /api/builder/login ───────────────────────────────────────────────────
const loginBuilder = async (req, res) => {
    const { phone } = req.body;
    if (!phone) {
        return res.status(400).json({ status: 400, data: null, message: 'Phone number is required', error: true });
    }
    try {
        const otpnum = Math.floor(1000 + Math.random() * 9000);
        await Otp.updateMany({ phone }, { is_delete: 1 });
        await Otp.create({ Otp: otpnum, phone });
        // Fire SMS asynchronously — respond in <200ms regardless of SMS status
        sendOtp(phone, otpnum).catch(err => console.error('Builder SMS async error:', err));
        console.log(`OTP generated for builder ${phone}: ${otpnum}`);
        return res.json({ status: 200, message: 'OTP sent successfully', error: false });
    } catch (error) {
        console.error('loginBuilder error:', error.message);
        return res.status(500).json({ status: 500, data: null, message: 'Something went wrong. Please try again.', error: true });
    }
};

// ── POST /api/builder/sign-up ─────────────────────────────────────────────────
const signupBuilder = async (req, res) => {
    try {
        if (await Builder.exists({ phone: req.body.phone })) {
            return res.status(401).json({ status: 401, data: null, message: 'Builder already exists', error: false });
        }

        let profile_url = '';
        if (req.file) {
            const result = await cloudinary.uploader.upload(req.file.path, {
                folder: 'builder_profiles',
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

        const builder = await Builder.create({
            name:               req.body.name,
            phone:              req.body.phone,
            email:              req.body.email,
            company_name:       req.body.company_name,
            gstin:              req.body.gstin,
            license_number:     req.body.license_number,
            project_types:      req.body.project_types
                                    ? JSON.parse(req.body.project_types)
                                    : [],
            experience_years:   req.body.experience_years,
            projects_completed: req.body.projects_completed,
            min_project_value:  req.body.min_project_value,
            max_project_value:  req.body.max_project_value,
            team_size:          req.body.team_size,
            service_radius_km:  req.body.service_radius_km,
            language:           req.body.language,
            location,
            profile_url,
        });

        const token = jwt.sign(
            {
                id:        builder._id,
                phone:     builder.phone,
                email:     builder.email,
                isBuilder: builder.isBuilder,
            },
            process.env.SECRET,
            { expiresIn: '3d' }
        );

        return res.status(201).json({
            status: 201, data: builder, token,
            message: 'Builder created successfully', error: false,
        });
    } catch (error) {
        console.error('signupBuilder error:', error.message);
        return res.status(500).json({ status: 500, data: null, message: error.message, error: true });
    }
};

// ── POST /api/builder/login/otp-verify ────────────────────────────────────────
const otpVerifyLogin = async (req, res) => {
    const { phone, otp } = req.body;
    const MASTER_OTP = '0000';

    try {
        // Master OTP bypass (testing only)
        if (String(otp) === MASTER_OTP) {
            const builder = await Builder.findOne({ phone, is_delete: { $ne: 1 } });
            if (builder) {
                app.set('data', { user: builder, uuid: md5(randomString()) });
                const token = jwt.sign(
                    { id: builder._id, phone: builder.phone, email: builder.email, isBuilder: builder.isBuilder },
                    process.env.SECRET,
                    { expiresIn: '3d' }
                );
                return res.json({ status: 200, data: builder, token, exist: true, message: 'OTP verified successfully', error: false });
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

        const builder = await Builder.findOne({ phone, is_delete: { $ne: 1 } });
        if (builder) {
            app.set('data', { user: builder, uuid: md5(randomString()) });
            const token = jwt.sign(
                { id: builder._id, phone: builder.phone, email: builder.email, isBuilder: builder.isBuilder },
                process.env.SECRET,
                { expiresIn: '3d' }
            );
            return res.json({ status: 200, data: builder, token, exist: true, message: 'OTP verified successfully', error: false });
        }
        return res.json({ status: 200, data: null, exist: false, message: 'OTP verified successfully', error: false });

    } catch (error) {
        console.error('builder otpVerifyLogin error:', error.message);
        return res.status(500).json({ status: 500, data: null, message: error.message, error: true });
    }
};

// ── POST /api/builder/otp-verify (standalone — verify without login) ───────────
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
        console.error('builder otpVerify error:', error.message);
        return res.status(500).json({ status: 500, data: null, message: error.message, error: true });
    }
};

module.exports = { loginBuilder, signupBuilder, otpVerifyLogin, otpVerify };
