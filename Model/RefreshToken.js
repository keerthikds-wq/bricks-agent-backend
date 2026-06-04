const { model, Schema } = require('mongoose');

const refreshTokenSchema = new Schema(
    {
        token:       { type: String, required: true, unique: true },
        user_id:     { type: Schema.Types.ObjectId, required: true },
        user_type:   { type: String, required: true, enum: ['user', 'builder', 'seller', 'masonry'] },
        device_id:   { type: String, required: true, default: 'none' },
        device_name: { type: String, default: 'Unknown Device' },
        expires_at:  { type: Date, required: true },
        is_revoked:  { type: Boolean, default: false },
    },
    { timestamps: true }
);

// Compound index for per-device lookups
refreshTokenSchema.index({ user_id: 1, device_id: 1 });
// TTL — MongoDB auto-deletes expired tokens
refreshTokenSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

module.exports = model('RefreshToken', refreshTokenSchema);
