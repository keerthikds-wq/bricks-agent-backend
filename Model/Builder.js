const { model, Schema } = require("mongoose");

const builderSchema = new Schema(
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
            type: String,
        },
        license_number: {
            type: String,  // contractor license / CRN
        },
        project_types: {
            type: [String],
            enum: ['residential', 'commercial', 'industrial', 'renovation', 'infrastructure'],
            default: [],
        },
        experience_years: {
            type: Number,
        },
        projects_completed: {
            type: Number,
            default: 0,
        },
        min_project_value: {
            type: Number,  // in INR
        },
        max_project_value: {
            type: Number,  // in INR
        },
        team_size: {
            type: Number,
        },
        service_radius_km: {
            type: Number,
            default: 50,
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
        average_rating: {
            type: Number,
            default: 0,
            min: 0,
            max: 5,
        },
        review_count: {
            type: Number,
            default: 0,
        },
        language: {
            type: String,
            enum: ['en', 'hi', 'te', 'ta', 'kn', 'mr', 'gu'],
            default: 'en',
        },
        isBuilder: {
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
builderSchema.index({ location: '2dsphere' });

module.exports = model("builder", builderSchema);
