const { cloudinary } = require('../config');
const Builder = require('../Model/Builder');
const { StatusCodes } = require('http-status-codes');

// ── GET /api/builder/:id ──────────────────────────────────────────────────────
const getBuilder = async (req, res) => {
    try {
        const builder = await Builder.findOne({ _id: req.params.id, is_delete: { $ne: 1 } });
        if (!builder) {
            return res.status(StatusCodes.NOT_FOUND).json({
                status: 404, data: null,
                message: 'Builder not found for id ' + req.params.id,
                error: true,
            });
        }
        return res.json({ status: 200, data: builder, message: 'Builder details', error: false });
    } catch (error) {
        console.error('getBuilder error:', error.message);
        return res.status(500).json({ status: 500, data: null, message: error.message, error: true });
    }
};

// ── PATCH /api/builder/:id ────────────────────────────────────────────────────
const updateBuilder = async (req, res) => {
    try {
        if (req.body.profileBase64) {
            try {
                const result = await cloudinary.uploader.upload(req.body.profileBase64, {
                    folder: 'builder_profiles',
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

        const updated = await Builder.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );
        if (!updated) {
            return res.status(404).json({ status: 404, data: null, message: 'Not found', error: true });
        }
        return res.json({ status: 200, data: updated, message: 'Updated successfully', error: false });
    } catch (error) {
        console.error('updateBuilder error:', error.message);
        return res.status(500).json({ status: 500, data: null, message: error.message, error: true });
    }
};

// ── GET /api/builder ──────────────────────────────────────────────────────────
const getAllBuilders = async (req, res) => {
    try {
        const list = await Builder.find({ is_delete: { $ne: 1 } }).sort({ createdAt: -1 });
        return res.json({ status: 200, data: list, message: 'All builders', error: false });
    } catch (error) {
        console.error('getAllBuilders error:', error.message);
        return res.status(500).json({ status: 500, data: null, message: error.message, error: true });
    }
};

// ── DELETE /api/builder/:id (soft delete) ─────────────────────────────────────
const deleteBuilder = async (req, res) => {
    try {
        await Builder.findByIdAndUpdate(req.params.id, { is_delete: 1 });
        return res.json({ status: 200, data: null, message: 'Deleted successfully', error: false });
    } catch (error) {
        console.error('deleteBuilder error:', error.message);
        return res.status(500).json({ status: 500, data: null, message: error.message, error: true });
    }
};

// ── GET /api/builder/nearby?lat=&lng=&radius=&project_type= ──────────────────
//   Returns builders within `radius` km sorted nearest-first.
//   Falls back to all active builders if geo-query returns nothing
//   (handles existing accounts registered without location data).
const searchNearby = async (req, res) => {
    try {
        const lat          = parseFloat(req.query.lat);
        const lng          = parseFloat(req.query.lng);
        const radiusKm     = parseFloat(req.query.radius) || 50;
        const project_type = req.query.project_type;

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
        if (project_type) geoFilter.project_types = project_type;

        let results = await Builder.find(geoFilter).limit(50);

        // Fallback: if geo-query finds nothing (e.g. all accounts have default coords),
        // return all active builders so the app is never empty.
        if (results.length === 0) {
            const fallbackFilter = { is_delete: { $ne: 1 } };
            if (project_type) fallbackFilter.project_types = project_type;
            results = await Builder.find(fallbackFilter).sort({ createdAt: -1 }).limit(50);
        }

        return res.json({
            status: 200,
            data: results,
            count: results.length,
            message: `Found ${results.length} builder(s)`,
            error: false,
        });
    } catch (error) {
        console.error('searchNearby (builder) error:', error.message);
        return res.status(500).json({ status: 500, data: null, message: error.message, error: true });
    }
};

// ── PATCH /api/builder/update-token ───────────────────────────────────────────
const updateFcmToken = async (req, res) => {
    try {
        const builderId = req.user.id;
        const builder = await Builder.findById(builderId);
        if (!builder) {
            return res.status(StatusCodes.NOT_FOUND).json({
                status: 404, message: 'Builder not found', error: true,
            });
        }
        const updated = await Builder.findByIdAndUpdate(
            builderId,
            { fcm_token: req.body.fcm_token },
            { new: true }
        );
        return res.status(StatusCodes.OK).json({
            status: 200, message: 'FCM token updated', data: updated, error: false,
        });
    } catch (error) {
        console.error('updateFcmToken (builder) error:', error.message);
        return res.status(500).json({ status: 500, data: null, message: error.message, error: true });
    }
};

module.exports = { getBuilder, updateBuilder, getAllBuilders, deleteBuilder, searchNearby, updateFcmToken };
