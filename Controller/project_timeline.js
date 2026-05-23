const ProjectTimeline = require("../Model/ProjectTimeline");

// POST /api/timelines
exports.createProject = async (req, res) => {
  try {
    const { project_name, location, project_type, status, start_date, end_date, total_sqft, description } = req.body;
    if (!project_name) {
      return res.status(400).json({ success: false, message: "project_name is required" });
    }
    const project = await ProjectTimeline.create({
      builder_id: req.builder._id,
      project_name,
      location,
      project_type,
      status,
      start_date,
      end_date,
      total_sqft,
      description,
    });
    return res.status(201).json({ success: true, data: project });
  } catch (err) {
    console.error("createProject error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// PUT /api/timelines/:id
exports.updateProject = async (req, res) => {
  try {
    const project = await ProjectTimeline.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: "Project not found" });
    }
    if (project.builder_id.toString() !== req.builder._id.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized" });
    }
    const allowed = ["project_name", "location", "project_type", "status", "start_date", "end_date", "total_sqft", "description"];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const updated = await ProjectTimeline.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    );
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    console.error("updateProject error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// DELETE /api/timelines/:id
exports.deleteProject = async (req, res) => {
  try {
    const project = await ProjectTimeline.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: "Project not found" });
    }
    if (project.builder_id.toString() !== req.builder._id.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized" });
    }
    await ProjectTimeline.findByIdAndDelete(req.params.id);
    return res.status(200).json({ success: true, message: "Project deleted" });
  } catch (err) {
    console.error("deleteProject error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// PUT /api/timelines/:id/phase/:phase_index
exports.updatePhase = async (req, res) => {
  try {
    const project = await ProjectTimeline.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: "Project not found" });
    }
    if (project.builder_id.toString() !== req.builder._id.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized" });
    }
    const index = parseInt(req.params.phase_index, 10);
    if (isNaN(index) || index < 0 || index >= project.phases.length) {
      return res.status(400).json({ success: false, message: "Invalid phase index" });
    }
    const { status, notes } = req.body;
    const setFields = {};
    if (status !== undefined) {
      setFields[`phases.${index}.status`] = status;
      if (status === "completed") {
        setFields[`phases.${index}.completed_at`] = new Date();
      }
    }
    if (notes !== undefined) {
      setFields[`phases.${index}.notes`] = notes;
    }
    const updated = await ProjectTimeline.findByIdAndUpdate(
      req.params.id,
      { $set: setFields },
      { new: true, runValidators: true }
    );
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    console.error("updatePhase error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// GET /api/timelines/my
exports.getMyProjects = async (req, res) => {
  try {
    const projects = await ProjectTimeline.find({ builder_id: req.builder._id })
      .sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data: projects });
  } catch (err) {
    console.error("getMyProjects error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// GET /api/timelines/builder/:builder_id  (public)
exports.getBuilderProjects = async (req, res) => {
  try {
    const projects = await ProjectTimeline.find({ builder_id: req.params.builder_id })
      .sort({ status: 1, createdAt: -1 });
    return res.status(200).json({ success: true, data: projects });
  } catch (err) {
    console.error("getBuilderProjects error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
