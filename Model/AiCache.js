const mongoose = require('mongoose');

// Stores Q&A pairs so repeated questions never hit the AI API
const AiCacheSchema = new mongoose.Schema({
    question_hash: { type: String, required: true, unique: true, index: true },
    question_text: { type: String, required: true },
    answer_text:   { type: String, required: true },
    language:      { type: String, default: 'en' },
    hit_count:     { type: Number, default: 1 },
    last_hit:      { type: Date,   default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('AiCache', AiCacheSchema);
