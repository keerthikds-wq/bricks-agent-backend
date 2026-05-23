const mongoose = require('mongoose');

const PhaseSchema = new mongoose.Schema({
  name:         { type: String, required: true },
  status:       { type: String, enum: ['pending','in_progress','completed'], default: 'pending' },
  notes:        { type: String, default: '' },
  completed_at: { type: Date },
}, { _id: false });

const ProjectTimelineSchema = new mongoose.Schema({
  builder_id:   { type: mongoose.Schema.Types.ObjectId, ref: 'Builder', required: true, index: true },
  project_name: { type: String, required: true, trim: true },
  location:     { type: String, default: '' },
  project_type: { type: String, enum: ['residential','commercial','industrial','renovation','infrastructure'], default: 'residential' },
  status:       { type: String, enum: ['planning','ongoing','completed'], default: 'planning' },
  start_date:   { type: Date },
  end_date:     { type: Date },
  total_sqft:   { type: Number },
  phases: { type: [PhaseSchema], default: () => [
    { name: 'Planning & Design',      status: 'pending' },
    { name: 'Foundation',             status: 'pending' },
    { name: 'Structure',              status: 'pending' },
    { name: 'Brickwork & Walls',      status: 'pending' },
    { name: 'Roofing',                status: 'pending' },
    { name: 'Electrical & Plumbing',  status: 'pending' },
    { name: 'Plastering',             status: 'pending' },
    { name: 'Flooring & Tiling',      status: 'pending' },
    { name: 'Painting & Finishing',   status: 'pending' },
    { name: 'Handover',               status: 'pending' },
  ]},
  description: { type: String, default: '', maxlength: 500 },
}, { timestamps: true });

module.exports = mongoose.model('ProjectTimeline', ProjectTimelineSchema);
