const Review   = require('../Model/Review');
const mongoose = require('mongoose');

// ── Helper: resolve caller identity from JWT ──────────────────────────────────
function callerType(user) {
  if (user.isUser)    return 'buyer';
  if (user.isSeller)  return 'seller';
  if (user.isMasonry) return 'masonry';
  if (user.isBuilder) return 'builder';
  return 'buyer';
}

// ── POST /api/reviews  — add or update a review ───────────────────────────────
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

    // Upsert: one review per reviewer-reviewee pair
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

    res.status(201).json({ message: 'Review saved!', data: review });
  } catch (err) {
    console.error('addReview:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ── GET /api/reviews/:reviewee_id?type=masonry — all reviews for a profile ────
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

    // Rating distribution (1-5)
    const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    reviews.forEach(r => { dist[r.rating] = (dist[r.rating] || 0) + 1; });

    res.status(200).json({
      average:      avg,
      total:        count,
      distribution: dist,
      reviews,
    });
  } catch (err) {
    console.error('getReviews:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ── DELETE /api/reviews/:reviewee_id — delete own review ──────────────────────
exports.deleteReview = async (req, res) => {
  try {
    const reviewer_id  = req.user._id || req.user.id;
    const { reviewee_id } = req.params;

    const deleted = await Review.findOneAndDelete({ reviewer_id, reviewee_id });
    if (!deleted) return res.status(404).json({ message: 'Review not found.' });

    res.status(200).json({ message: 'Review deleted.' });
  } catch (err) {
    console.error('deleteReview:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ── GET /api/reviews/:reviewee_id/mine — check if I already reviewed ──────────
exports.getMyReview = async (req, res) => {
  try {
    const reviewer_id  = req.user._id || req.user.id;
    const { reviewee_id } = req.params;

    const review = await Review.findOne({ reviewer_id, reviewee_id }).lean();
    res.status(200).json({ data: review || null });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};
