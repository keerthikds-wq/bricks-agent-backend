const mongoose = require('mongoose');

// Per-user daily usage counter — reset daily by TTL index
const AiUsageSchema = new mongoose.Schema({
    user_id:    { type: String, required: true },
    date_key:   { type: String, required: true },   // "2024-01-15"
    count:      { type: Number, default: 0 },
    expires_at: { type: Date,   required: true },   // TTL — auto-deleted next day
}, { timestamps: true });

AiUsageSchema.index({ user_id: 1, date_key: 1 }, { unique: true });
AiUsageSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('AiUsage', AiUsageSchema);
