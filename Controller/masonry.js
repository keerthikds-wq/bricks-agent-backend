const { cloudinary } = require('../config');
const Masonry = require('../Model/Masonry');
const { StatusCodes } = require('http-status-codes');

// ── GET /api/masonry/:id ──────────────────────────────────────────────────────
const getMasonry = async (req, res) => {
    try {
        const masonry = await Masonry.findOne({ _id: req.params.id, is_delete: { $ne: 1 } });
        if (!masonry) {
            return res.status(StatusCodes.NOT_FOUND).json({
                status: 404, data: null,
                message: 'Masonry contractor not found for id ' + req.params.id,
                error: true,
            });
        }
        return res.json({ status: 200, data: masonry, message: 'Masonry details', error: false });
    } catch (error) {
        console.error('getMasonry error:', error.message);
        return res.status(500).json({ status: 500, data: null, message: error.message, error: true });
    }
};

// ── PATCH /api/masonry/:id ────────────────────────────────────────────────────
const updateMasonry = async (req, res) => {
    try {
        // Accept either a base64 data URI (JSON body) or multipart file
        if (req.body.profileBase64) {
            try {
                const result = await cloudinary.uploader.upload(req.body.profileBase64, {
                    folder: 'masonry_profiles',
                    resource_type: 'image',
                    transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }],
                });
                req.body.profile_url = result.secure_url;
            } catch (uploadErr) {
                console.error('Cloudinary upload error:', uploadErr.message);
                return res.status(500).json({ status: 500, data: null, message: 'Photo upload failed', error: true });
            }
            delete req.body.profileBase64;
        }

        // If lat/lng are provided, update GeoJSON location
        if (req.body.latitude != null && req.body.longitude != null) {
            req.body.location = {
                type: 'Point',
                coordinates: [parseFloat(req.body.longitude), parseFloat(req.body.latitude)],
            };
            delete req.body.latitude;
            delete req.body.longitude;
        }

        const updated = await Masonry.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );
        if (!updated) {
            return res.status(404).json({ status: 404, data: null, message: 'Not found', error: true });
        }
        return res.json({ status: 200, data: updated, message: 'Updated successfully', error: false });
    } catch (error) {
        console.error('updateMasonry error:', error.message);
        return res.status(500).json({ status: 500, data: null, message: error.message, error: true });
    }
};

// ── GET /api/masonry ──────────────────────────────────────────────────────────
const getAllMasonry = async (req, res) => {
    try {
        const list = await Masonry.find({ is_delete: { $ne: 1 } }).sort({ createdAt: -1 });
        return res.json({ status: 200, data: list, message: 'All masonry contractors', error: false });
    } catch (error) {
        console.error('getAllMasonry error:', error.message);
        return res.status(500).json({ status: 500, data: null, message: error.message, error: true });
    }
};

// ── DELETE /api/masonry/:id (soft delete) ─────────────────────────────────────
const deleteMasonry = async (req, res) => {
    try {
        await Masonry.findByIdAndUpdate(req.params.id, { is_delete: 1 });
        return res.json({ status: 200, data: null, message: 'Deleted successfully', error: false });
    } catch (error) {
        console.error('deleteMasonry error:', error.message);
        return res.status(500).json({ status: 500, data: null, message: error.message, error: true });
    }
};

// ── GET /api/masonry/nearby?lat=&lng=&radius=&specialization= ─────────────────
//   Returns masonry contractors within `radius` km sorted nearest-first.
//   Falls back to all active masonries if geo-query returns nothing
//   (handles existing accounts registered without location data).
const searchNearby = async (req, res) => {
    try {
        const lat            = parseFloat(req.query.lat);
        const lng            = parseFloat(req.query.lng);
        const radiusKm       = parseFloat(req.query.radius) || 20;
        const specialization = req.query.specialization;

        if (isNaN(lat) || isNaN(lng)) {
            return res.status(400).json({
                status: 400, data: null,
                message: 'lat and lng query parameters are required.',
                error: true,
            });
        }

        const geoFilter = {
            is_delete: { $ne: 1 },
            // Exclude accounts still at default [0,0] coordinates
            'location.coordinates': { $ne: [0, 0] },
            location: {
                $near: {
                    $geometry: { type: 'Point', coordinates: [lng, lat] },
                    $maxDistance: radiusKm * 1000,
                },
            },
        };
        if (specialization) geoFilter.specializations = specialization;

        let results = await Masonry.find(geoFilter).limit(50);

        // Fallback: if geo-query finds nothing (e.g. all accounts have default coords),
        // return all active masonries so the app is never empty.
        if (results.length === 0) {
            const fallbackFilter = { is_delete: { $ne: 1 } };
            if (specialization) fallbackFilter.specializations = specialization;
            results = await Masonry.find(fallbackFilter).sort({ createdAt: -1 }).limit(50);
        }

        return res.json({
            status: 200,
            data: results,
            count: results.length,
            message: `Found ${results.length} masonry contractor(s)`,
            error: false,
        });
    } catch (error) {
        console.error('searchNearby error:', error.message);
        return res.status(500).json({ status: 500, data: null, message: error.message, error: true });
    }
};

// ── PATCH /api/masonry/update-token ───────────────────────────────────────────
const updateFcmToken = async (req, res) => {
    try {
        const masonryId  = req.user.id;
        const contractor = await Masonry.findById(masonryId);
        if (!contractor) {
            return res.status(StatusCodes.NOT_FOUND).json({
                status: 404, message: 'Masonry contractor not found', error: true,
            });
        }
        const updated = await Masonry.findByIdAndUpdate(
            masonryId,
            { fcm_token: req.body.fcm_token },
            { new: true }
        );
        return res.status(StatusCodes.OK).json({
            status: 200, message: 'FCM token updated', data: updated, error: false,
        });
    } catch (error) {
        console.error('updateFcmToken error:', error.message);
        return res.status(500).json({ status: 500, data: null, message: error.message, error: true });
    }
};

module.exports = { getMasonry, updateMasonry, getAllMasonry, deleteMasonry, searchNearby, updateFcmToken };
