const ProjectNotification = require("../Model/ProjectNotification");
const { callerId } = require("../Middleware/projectAccess");

const ok   = (res, data) => res.status(200).json({ success: true, data });
const fail = (res, s, m) => res.status(s).json({ success: false, message: m });

/** In-app notification inbox for project events (bell icon). */

// GET /api/project-notifications
exports.list = async (req, res) => {
    try {
        const userId = callerId(req);
        const q = { user_id: userId };
        if (req.query.project_id) q.project_id = req.query.project_id;
        if (req.query.unread === "true") q.read = false;

        const [items, unread] = await Promise.all([
            ProjectNotification.find(q).sort({ createdAt: -1 }).limit(Number(req.query.limit) || 100).lean(),
            ProjectNotification.countDocuments({ user_id: userId, read: false }),
        ]);

        return ok(res, { items, unread });
    } catch (err) {
        console.error("notification list error:", err);
        return fail(res, 500, "Server error");
    }
};

// PATCH /api/project-notifications/:id/read
exports.markRead = async (req, res) => {
    try {
        await ProjectNotification.updateOne(
            { _id: req.params.id, user_id: callerId(req) },
            { $set: { read: true, read_at: new Date() } }
        );
        return ok(res, { read: true });
    } catch (err) {
        console.error("markRead error:", err);
        return fail(res, 500, "Server error");
    }
};

// PATCH /api/project-notifications/read-all
exports.markAllRead = async (req, res) => {
    try {
        await ProjectNotification.updateMany(
            { user_id: callerId(req), read: false },
            { $set: { read: true, read_at: new Date() } }
        );
        return ok(res, { read: true });
    } catch (err) {
        console.error("markAllRead error:", err);
        return fail(res, 500, "Server error");
    }
};
