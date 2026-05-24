const BuilderNotification  = require("../Model/BuilderNotification");
const MasonryNotification  = require("../Model/MasonryNotification");
const { v4: uuid }         = require("uuid");

// ─── Helper — derive model and userId from JWT payload ───────────────────────
function _ctx(req) {
  const userId   = req.user?.id || req.user?._id;
  const userType = req.user?.isMasonry ? "masonry" : "builder";
  const Model    = userType === "masonry" ? MasonryNotification : BuilderNotification;
  return { userId, userType, Model };
}

// ─── GET /api/prof-notifications/me ──────────────────────────────────────────
exports.getMyNotifications = async (req, res) => {
  try {
    const { userId, Model } = _ctx(req);
    const list  = await Model
      .find({ userid: userId })
      .sort({ createdAt: -1 })
      .lean();

    // Normalise to the shape the Flutter app already expects
    const data = list.map(n => ({
      notificationid: n.notificationid || n._id.toString(),
      title:   n.title   || "",
      body:    n.body    || "",
      message: n.message || "",
      type:    n.type    || "general",
      view:    n.view    || "false",
      createdAt: n.createdAt,
    }));

    res.status(200).json({ data });
  } catch (err) {
    console.error("getMyNotifications:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ─── PATCH /api/prof-notifications/mark-all-read ─────────────────────────────
exports.markAllRead = async (req, res) => {
  try {
    const { userId, Model } = _ctx(req);
    await Model.updateMany({ userid: userId, view: "false" }, { view: "true" });
    res.status(200).json({ message: "All marked as read" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ─── DELETE /api/prof-notifications/:notificationid ──────────────────────────
exports.deleteNotification = async (req, res) => {
  try {
    const { userId, Model } = _ctx(req);
    const { notificationid } = req.params;
    await Model.deleteOne({ notificationid, userid: userId });
    res.status(200).json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ─── PATCH /api/prof-notifications/read/:notificationid ──────────────────────
exports.markOneRead = async (req, res) => {
  try {
    const { userId, Model } = _ctx(req);
    const { notificationid } = req.params;
    await Model.findOneAndUpdate(
      { notificationid, userid: userId },
      { view: "true" },
      { new: true }
    );
    res.status(200).json({ message: "Marked as read" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ─── Utility: create a notification for a builder (called by other controllers)
exports.notifyBuilder = async (builderId, { title, body, message = "", type = "general" }) => {
  try {
    await BuilderNotification.create({
      title, body, message, type,
      notificationid: uuid(),
      userid: builderId,
    });
  } catch (err) {
    console.error("notifyBuilder:", err.message);
  }
};

// ─── Utility: create a notification for a masonry (called by other controllers)
exports.notifyMasonry = async (masonryId, { title, body, message = "", type = "general" }) => {
  try {
    await MasonryNotification.create({
      title, body, message, type,
      notificationid: uuid(),
      userid: masonryId,
    });
  } catch (err) {
    console.error("notifyMasonry:", err.message);
  }
};
