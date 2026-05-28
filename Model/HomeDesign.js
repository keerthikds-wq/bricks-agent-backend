const { model, Schema } = require('mongoose');

const RoomSchema = new Schema({
    room_type: {
        type: String,
        enum: [
            'living_room', 'master_bedroom', 'bedroom', 'kitchen', 'dining_room',
            'bathroom', 'pooja_room', 'study_room', 'balcony', 'servant_quarter',
            'storage', 'garage', 'terrace', 'garden',
        ],
        required: true,
    },
    name:            { type: String },
    length_ft:       { type: Number },
    width_ft:        { type: Number },
    area_sqft:       { type: Number },
    floor_number:    { type: Number, default: 1 },
    vastu_direction: { type: String },   // 'northeast', 'southwest', etc.
    estimated_cost:  { type: Number, default: 0 },
}, { _id: false });

const VastuIssueSchema = new Schema({
    area:     { type: String },
    issue:    { type: String },
    severity: { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
}, { _id: false });

const HomeDesignSchema = new Schema({
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    // ── Project basics ──────────────────────────────────────────────────────────
    project_name: { type: String, required: true, trim: true },
    property_type: {
        type: String,
        enum: ['apartment', 'villa', 'independent_house', 'row_house', 'bungalow', 'duplex', 'farmhouse'],
        default: 'independent_house',
    },
    bhk_config:      { type: String },         // "2BHK", "3BHK", "4BHK"
    total_area_sqft: { type: Number },
    floors:          { type: Number, default: 1 },
    city:            { type: String },
    state:           { type: String },

    // ── Location & climate ──────────────────────────────────────────────────────
    climate_zone: {
        type: String,
        enum: ['hot_dry', 'hot_humid', 'composite', 'temperate', 'cold'],
        default: 'composite',
    },
    plot_facing: {
        type: String,
        enum: ['north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest'],
    },
    main_door_direction: {
        type: String,
        enum: ['north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest'],
    },

    // ── Design preferences ──────────────────────────────────────────────────────
    design_style: { type: String },
    budget_tier: {
        type: String,
        enum: ['basic', 'standard', 'premium', 'luxury'],
        default: 'standard',
    },
    family_type: {
        type: String,
        enum: ['nuclear', 'joint', 'couple'],
        default: 'nuclear',
    },
    language: {
        type: String,
        enum: ['english', 'hindi', 'telugu', 'tamil', 'kannada'],
        default: 'english',
    },

    // ── Rooms ───────────────────────────────────────────────────────────────────
    rooms: [RoomSchema],

    // ── Vastu analysis ──────────────────────────────────────────────────────────
    vastu_analysis: {
        compliance_score:  { type: Number, min: 0, max: 100 },
        compliance_level:  { type: String, enum: ['excellent', 'good', 'average', 'poor'] },
        issues:            [VastuIssueSchema],
        recommendations:   [String],
        remedies:          [String],
        door_vastu:        { direction: String, rating: String, tip: String },
        plot_facing_vastu: { direction: String, rating: String, tip: String },
        analyzed_at:       { type: Date },
    },

    // ── AI design advice ────────────────────────────────────────────────────────
    design_advice: {
        style_name:        { type: String },
        style_description: { type: String },
        color_palette: {
            primary:          [String],
            accent:           [String],
            neutral:          [String],
            wall_suggestion:  { type: String },
        },
        material_recommendations: {
            flooring:   String,
            wall_finish: String,
            ceiling:    String,
            kitchen:    String,
            bathroom:   String,
            woodwork:   String,
        },
        key_features:   [String],
        indian_elements:[String],
        brand_suggestions: { type: Schema.Types.Mixed },
        ai_narration:   { type: String },
        generated_at:   { type: Date },
    },

    // ── Interior cost estimate ──────────────────────────────────────────────────
    interior_estimate: {
        tier:            { type: String },
        rooms_breakdown: { type: Schema.Types.Mixed },
        subtotal:        { type: Number },
        contingency_pct: { type: Number, default: 10 },
        contingency_amt: { type: Number },
        total_estimate:  { type: Number },
        cost_per_sqft:   { type: Number },
        generated_at:    { type: Date },
    },

    // ── Floor plan ──────────────────────────────────────────────────────────────
    floor_plan_url:       { type: String },
    floor_plan_public_id: { type: String },
    floor_plan_analysis:  { type: String },

    // ── Links ───────────────────────────────────────────────────────────────────
    linked_boq_id: { type: Schema.Types.ObjectId, ref: 'boq' },

    // ── Status ──────────────────────────────────────────────────────────────────
    status: {
        type: String,
        enum: ['planning', 'designing', 'in_progress', 'completed'],
        default: 'planning',
    },
    is_deleted: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = model('HomeDesign', HomeDesignSchema);
