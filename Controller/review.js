const Review   = require('../Model/Review');
const mongoose = require('mongoose');
const Builder  = require('../Model/Builder');
const Masonry  = require('../Model/Masonry');
const Seller   = require('../Model/Seller');

const REVIEWEE_MODELS = { builder: Builder, masonry: Masonry, seller: Seller };

// Recalculate and persist average_rating + review_count on the reviewee document
async function syncRating(reviewee_id, reviewee_type) {
    const Model = REVIEWEE_MODELS[reviewee_type];
    if (!Model) return;
    const agg = await Review.aggregate([
        { $match: { reviewee_id: new mongoose.Types.ObjectId(reviewee_id) } },
        { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);
    const avg   = agg.length ? parseFloat(agg[0].avg.toFixed(1)) : 0;
    const count = agg.length ? agg[0].count : 0;
    await Model.findByIdAndUpdate(reviewee_id, { average_rating: avg, review_count: count });
}

// ── Helper: resolve caller identity from JWT ──────────────────────────────────
function callerType(user) {
    if (user.isUser)    return 'buyer';
    if (user.isSeller)  return 'seller';
    if (user.isMasonry) return 'masonry';
    if (user.isBuilder) return 'builder';
    return 'buyer';
}

// ── POST /api/reviews ─────────────────────────────────────────────────────────
exports.addReview = async (req, res) => {
    try {
        const { reviewee_id, reviewee_type, rating, comment, reviewer_name, reviewer_photo } = req.body;

        if (!reviewee_id || !reviewee_type || !rating) {
            return res.status(400).json({ message: 'reviewee_id, reviewee_type and rating are required.' });
        }
        if (!['seller', 'masonry', 'builder'].includes(reviewee_type)) {
            return res.status(400).json({ message: 'reviewee_type must be seller, masonry or builder.' });
        }
        const ratingNum = Number(rating);
        if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
            return res.status(400).json({ message: 'rating must be 1–5.' });
        }

        const reviewer_id = req.user._id || req.user.id;

        const review = await Review.findOneAndUpdate(
            { reviewer_id, reviewee_id },
            {
                reviewer_id,
                reviewer_type:  callerType(req.user),
                reviewer_name:  reviewer_name  || req.user.name || '',
                reviewer_photo: reviewer_photo || req.user.profile || '',
                reviewee_id,
                reviewee_type,
                rating: ratingNum,
                comment: (comment || '').slice(0, 500),
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        // Update cached rating on the reviewee's profile — fire and forget
        syncRating(reviewee_id, reviewee_type).catch(e =>
            console.error('syncRating error (non-fatal):', e.message)
        );

        res.status(201).json({ message: 'Review saved!', data: review });
    } catch (err) {
        console.error('addReview:', err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};

// ── GET /api/reviews/:reviewee_id ─────────────────────────────────────────────
exports.getReviews = async (req, res) => {
    try {
        const { reviewee_id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(reviewee_id)) {
            return res.status(400).json({ message: 'Invalid reviewee_id' });
        }

        const reviews = await Review.find({ reviewee_id })
            .sort({ createdAt: -1 })
            .select('reviewer_name reviewer_photo reviewer_type rating comment createdAt')
            .lean();

        const count = reviews.length;
        const avg   = count > 0
            ? parseFloat((reviews.reduce((s, r) => s + r.rating, 0) / count).toFixed(1))
            : 0;

        const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        reviews.forEach(r => { dist[r.rating] = (dist[r.rating] || 0) + 1; });

        res.status(200).json({ average: avg, total: count, distribution: dist, reviews });
    } catch (err) {
        console.error('getReviews:', err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};

// ── DELETE /api/reviews/:reviewee_id ─────────────────────────────────────────
exports.deleteReview = async (req, res) => {
    try {
        const reviewer_id     = req.user._id || req.user.id;
        const { reviewee_id } = req.params;

        const deleted = await Review.findOneAndDelete({ reviewer_id, reviewee_id });
        if (!deleted) return res.status(404).json({ message: 'Review not found.' });

        syncRating(reviewee_id, deleted.reviewee_type).catch(e =>
            console.error('syncRating error (non-fatal):', e.message)
        );

        res.status(200).json({ message: 'Review deleted.' });
    } catch (err) {
        console.error('deleteReview:', err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};

// ── GET /api/reviews/:reviewee_id/mine ────────────────────────────────────────
exports.getMyReview = async (req, res) => {
    try {
        const reviewer_id     = req.user._id || req.user.id;
        const { reviewee_id } = req.params;
        const review = await Review.findOne({ reviewer_id, reviewee_id }).lean();
        res.status(200).json({ data: review || null });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};

// ── PATCH /api/reviews/verify/:type/:id — admin marks builder/masonry verified ─
// type: 'builder' | 'masonry'
exports.verifyProfile = async (req, res) => {
    try {
        const { type, id } = req.params;
        const Model = REVIEWEE_MODELS[type];
        if (!Model || type === 'seller') {
            return res.status(400).json({ message: 'type must be builder or masonry' });
        }
        const doc = await Model.findByIdAndUpdate(id, { is_verified: 1 }, { new: true })
            .select('name company_name is_verified average_rating review_count');
        if (!doc) return res.status(404).json({ message: `${type} not found` });
        res.json({ message: `${doc.name} marked as Bricks Verified`, data: doc });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};
