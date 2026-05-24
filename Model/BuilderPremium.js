const mongoose = require('mongoose');

const BuilderPremiumSchema = new mongoose.Schema({
    plan_type:       { type: String },
    purchase_date:   { type: Date },
    total_cost:      { type: Number },
    plan_start_date: { type: Date },
    plan_end_date:   { type: Date },
    payment_id:      { type: String },
    message:         { type: String },
    userID:          { type: mongoose.Schema.Types.ObjectId, ref: 'Builder' },
    packageID:       { type: mongoose.Schema.Types.ObjectId, ref: 'Package' },
}, { timestamps: true });

module.exports = mongoose.model('BuilderPremium', BuilderPremiumSchema);
