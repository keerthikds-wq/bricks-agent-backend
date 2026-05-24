const { app, express, jwt, sg_mail, md5, fs, path, cloudinary } = require('../config');
const router = express.Router();
const Seller = require("../Model/Seller");
const Otp = require('../Model/Otp');
const { randomString } = require('../Utils');
const { StatusCodes } = require("http-status-codes");

const getSeller = async (req, res, next) => {
    let id = req.params.id;
    try {
        // Use $ne:1 so sellers without the is_delete field (null/missing) are also found.
        const seller = await Seller.findOne({ _id: id, is_delete: { $ne: 1 } });
        if (!seller) {
            return res.status(404).send({ status: 404, data: null, message: "Seller not found for id " + id, error: true });
        }
        return res.send({ status: 200, data: seller, message: "Seller details for " + seller.id, error: false });
    } catch (error) {
        console.log(error.message);
        return res.status(500).send({ status: 500, data: null, message: error.message, error: true });
    }
};

const updateSeller = async (req, res, next) => {
    try {
        // ── Profile photo via Cloudinary (base64 data URI in JSON body) ──────
        if (req.body.profileBase64) {
            try {
                const result = await cloudinary.uploader.upload(req.body.profileBase64, {
                    folder:        'seller_profiles',
                    resource_type: 'image',
                    transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }],
                });
                req.body.profile = result.secure_url;
            } catch (uploadErr) {
                console.error('Cloudinary upload error:', uploadErr.message);
                return res.status(500).json({ status: 500, data: null, message: 'Photo upload failed', error: true });
            }
            delete req.body.profileBase64;
        }
        // ── Legacy multipart file upload (kept for backwards compat) ─────────
        else if (req.files && req.files.profile) {
            const uploadPath = process.env.PROFILE_FOLDER || 'public/';
            const sampleFiles = req.files.profile;
            const name = randomString() + path.extname(sampleFiles.name);
            sampleFiles.mv(uploadPath + name);
            req.body.profile = uploadPath + name;
        }

        let id = req.params.id;
        // Ownership check — a seller can only update their own profile
        if (req.user && req.user.id !== id) {
            return res.status(403).json({ status: 403, message: 'Access denied: you can only update your own profile.', error: true });
        }
        await Seller.updateOne({ _id: id }, req.body);
        const seller = await Seller.findOne({ _id: id });
        return res.send({ status: 200, data: seller, message: "Updated details for " + seller.id, error: false });
    } catch (error) {
        console.log(error.message);
        return res.status(500).send({ status: 500, data: null, message: error.message, error: true });
    }
};

const allSellers = async (req, res, next) => {
    try {
        const sellers = await Seller.find({ is_delete: 0 });
        return res.send({ status: 200, data: sellers, message: "Successfully fetched all Sellers", error: false });
    } catch (error) {
        console.log(error.message);
        return res.status(500).send({ status: 500, data: null, message: error.message, error: true });
    }
};

const deleteSeller = async (req, res, next) => {
    try {
        let id = req.params.id;
        // Ownership check — a seller can only delete their own account
        if (req.user && req.user.id !== id) {
            return res.status(403).json({ status: 403, message: 'Access denied: you can only delete your own account.', error: true });
        }
        const seller = await Seller.updateOne({ _id: id }, { is_delete: 1 });
        return res.send({ status: 200, data: seller, message: "Deleted details for " + id, error: false });
    } catch (error) {
        console.log(error.message);
        return res.status(500).send({ status: 500, data: null, message: error.message, error: true });
    }
};

const updateToken = async (req, res, next) => {
    const userid = req.user.id;
    try {
        const updaters = await Seller.findById(userid);
        if (!updaters) {
            return res.status(StatusCodes.NOT_FOUND).json({ message: "Invalid User ID", status: StatusCodes.NOT_FOUND });
        }
        const updates = await Seller.findByIdAndUpdate(
            userid,
            { fcm_token: req.body.fcm_token },
            { new: true }
        );
        if (updates) {
            return res.status(StatusCodes.OK).json({ message: "Token Updated", status: StatusCodes.OK, updates });
        }
        return res.status(StatusCodes.BAD_REQUEST).json({ message: "Something went wrong", status: StatusCodes.BAD_REQUEST });
    } catch (error) {
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(error);
    }
};

module.exports = { updateToken, getSeller, updateSeller, allSellers, deleteSeller };
