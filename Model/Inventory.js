const mongoose = require('mongoose');

const InventorySchema = new mongoose.Schema({
  seller_id:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name:           { type: String, required: true, trim: true },
  category:       {
    type: String,
    required: true,
    enum: ['cement','steel','bricks','sand','aggregate','tiles','paint','plywood','pipes','electrical','other'],
  },
  quantity:       { type: Number, required: true, min: 0 },
  unit:           { type: String, required: true },   // bags, tons, pieces, sq_ft, liters, meters, kg, cubic_ft
  price_per_unit: { type: Number, required: true, min: 0 },
  is_available:   { type: Boolean, default: true },
  description:    { type: String, default: '', maxlength: 300 },
}, { timestamps: true });

module.exports = mongoose.model('Inventory', InventorySchema);
