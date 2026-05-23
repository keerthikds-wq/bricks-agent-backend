const mongoose = require('mongoose');

const ReviewSchema = new mongoose.Schema({
  reviewer_id:   { type: mongoose.Schema.Types.ObjectId, required: true },
  reviewer_type: { type: String, required: true, enum: ['buyer', 'seller', 'masonry', 'builder'] },
  reviewer_name: { type: String, default: '' },
  reviewer_photo:{ type: String, default: '' },

  reviewee_id:   { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  reviewee_type: { type: String, required: true, enum: ['seller', 'masonry', 'builder'] },

  rating:  { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, default: '', maxlength: 500 },
}, { timestamps: true });

// One review per reviewer-reviewee pair (upsert)
ReviewSchema.index({ reviewer_id: 1, reviewee_id: 1 }, { unique: true });

module.exports = mongoose.model('Review', ReviewSchema);
