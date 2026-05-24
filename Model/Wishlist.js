const mongoose = require('mongoose');

const WishlistSchema = new mongoose.Schema({
  user_id:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  item_type:    { type: String, enum: ['product', 'seller', 'builder', 'masonry'], required: true },
  item_id:      { type: String, required: true },   // ObjectId as string (product _id, seller _id, etc.)
  item_name:    { type: String, default: '' },
  item_image:   { type: String, default: '' },
  item_meta:    { type: Object, default: {} },       // price, category, location — snapshot
}, { timestamps: true });

// One entry per user+item
WishlistSchema.index({ user_id: 1, item_id: 1 }, { unique: true });

module.exports = mongoose.model('Wishlist', WishlistSchema);
