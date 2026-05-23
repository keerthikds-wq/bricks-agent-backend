const mongoose = require('mongoose');

const PriceTrendSchema = new mongoose.Schema({
  material: {
    type: String,
    required: true,
    enum: ['cement', 'steel', 'bricks', 'sand', 'aggregate', 'tiles', 'paint', 'tmt_bars', 'plywood'],
    index: true,
  },
  price: { type: Number, required: true },        // price in INR
  unit: { type: String, required: true },          // "per 50kg bag", "per kg", "per 1000 pcs", etc.
  region: { type: String, default: 'national' },   // future: city-level granularity
  recorded_at: { type: Date, default: Date.now, index: true },
  source: { type: String, default: 'admin' },      // "admin" | "market_feed"
}, { timestamps: true });

// Compound index for efficient trend queries
PriceTrendSchema.index({ material: 1, recorded_at: -1 });

module.exports = mongoose.model('PriceTrend', PriceTrendSchema);
