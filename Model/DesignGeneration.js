const { model, Schema } = require('mongoose');

const OutputImageSchema = new Schema({
    url:           { type: String },   // Cloudinary secure_url
    public_id:     { type: String },
    thumbnail_url: { type: String },   // Cloudinary w_400 transform
    variant_label: { type: String },   // 'Modern', 'Tropical', etc.
}, { _id: false });

const DesignGenerationSchema = new Schema({
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    // ── What kind of generation ──────────────────────────────────────────────
    generation_type: {
        type: String,
        enum: ['room', 'exterior', 'walls', 'furniture', 'garden'],
        required: true,
    },

    // ── User inputs ──────────────────────────────────────────────────────────
    room_type:         { type: String },   // 'living_room', 'bedroom', etc.
    style_id:          { type: String },   // 'modern_indian', 'cozy', etc.
    style_name:        { type: String },   // human-readable label
    custom_instruction:{ type: String },   // "Add a pumpkin sofa"
    color_choice:      { type: String },   // hex / name for wall redesign
    language:          { type: String, default: 'english' },

    // ── Images ───────────────────────────────────────────────────────────────
    input_image_url:        { type: String },  // uploaded original
    input_image_public_id:  { type: String },
    reference_image_url:    { type: String },  // reference style image (optional)
    output_images:          [OutputImageSchema],

    // ── AI job tracking ──────────────────────────────────────────────────────
    provider: { type: String, enum: ['replicate', 'stability', 'mock'], default: 'replicate' },
    job_id:   { type: String },   // external prediction / request ID
    prompt:   { type: String },   // prompt used (for debugging)
    status: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed'],
        default: 'pending',
    },
    error_message:       { type: String },
    processing_time_ms:  { type: Number },

    // ── Associations ─────────────────────────────────────────────────────────
    linked_project_id: { type: Schema.Types.ObjectId, ref: 'HomeDesign' },
    is_deleted:        { type: Boolean, default: false },

    // ── Usage ────────────────────────────────────────────────────────────────
    credits_used: { type: Number, default: 1 },
}, { timestamps: true });

// Index for polling a specific job quickly
DesignGenerationSchema.index({ user_id: 1, createdAt: -1 });
DesignGenerationSchema.index({ job_id: 1 }, { sparse: true });

module.exports = model('DesignGeneration', DesignGenerationSchema);
