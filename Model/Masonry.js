const { model, Schema } = require("mongoose");

const masonrySchema = new Schema(
    {
        name: {
            type: String,
            required: true,
        },
        phone: {
            type: String,
            min: 10,
            max: 10,
            required: true,
            unique: true,
        },
        email: {
            type: String,
        },
        company_name: {
            type: String,
        },
        gstin: {
            type: String,  // optional
        },
        specializations: {
            type: [String],
            enum: ['brickwork', 'plastering', 'tiling', 'rcc', 'plumbing', 'electrical', 'full_construction'],
            default: [],
        },
        team_size: {
            type: Number,
        },
        experience_years: {
            type: Number,
        },
        daily_rate: {
            type: Number,
        },
        project_rate: {
            type: Number,
        },
        service_radius_km: {
            type: Number,
            default: 20,
        },
        location: {
            type: {
                type: String,
                default: 'Point',
            },
            coordinates: {
                type: [Number],  // [longitude, latitude]
                default: [0, 0],
            },
        },
        profile_url: {
            type: String,
        },
        fcm_token: {
            type: String,
        },
        is_verified: {
            type: Number,
            enum: [0, 1],
            default: 0,
        },
        is_active_subscription: {
            type: Number,
            enum: [0, 1],
            default: 0,
        },
        language: {
            type: String,
            enum: ['en', 'hi', 'te', 'ta', 'kn', 'mr', 'gu'],
            default: 'en',
        },
        isMasonry: {
            type: Boolean,
            default: true,
        },
        is_delete: {
            type: Number,
            enum: [0, 1],
            default: 0,
        },
    },
    { timestamps: true }
);

// 2dsphere index for $near / $geoWithin queries on location
masonrySchema.index({ location: '2dsphere' });

module.exports = model("masonry", masonrySchema);
