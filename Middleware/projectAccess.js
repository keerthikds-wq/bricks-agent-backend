const mongoose = require("mongoose");
const Project       = require("../Model/Project");
const ProjectMember = require("../Model/ProjectMember");

/**
 * Project access control — the single gate every project route goes through.
 *
 * This is the Express port of Bricks_agent_v2's `require_project_access`
 * (backend/deps.py). It is deliberately the ONLY place project permissions are
 * decided; controllers must not re-check ownership inline. The old code did
 * that (`project.builder_id.toString() !== userId.toString()`) in every handler
 * of Controller/project_timeline.js, which is how the masonry lockout bug
 * happened.
 *
 * Usage:
 *     router.post("/:pid/updates", Auth, projectAccess("builder", "field_staff"), ctrl.addUpdate)
 *     router.get ("/:pid",         Auth, projectAccess("any"),                     ctrl.getProject)
 *
 * On success it attaches:
 *     req.project    — the Project document
 *     req.membership — the caller's ProjectMember row (null when builder/admin)
 *     req.projectRole — "builder" | "client" | "field_staff" | "vendor" | "admin"
 */

const callerId = (req) =>
    (req.user && (req.user.id || req.user._id)) ||
    (req.builder && req.builder._id) ||
    (req.masonry && req.masonry._id);

const ALL_ROLES = ["builder", "client", "field_staff", "vendor"];

/**
 * Resolve what the caller is on this project. Returns null when unrelated.
 * Exported because controllers legitimately need it for read-shaping (e.g.
 * hiding cost fields from a vendor) without re-running the whole gate.
 */
async function resolveProjectRole(project, userId, user) {
    if (user && user.isAdmin) return { role: "admin", membership: null };

    if (project.builder_id && project.builder_id.toString() === userId.toString()) {
        return { role: "builder", membership: null };
    }

    const membership = await ProjectMember.findOne({
        project_id: project._id,
        user_id:    userId,
        status:     { $in: ["invited", "active"] },
    });

    if (!membership) {
        // Client may be pre-linked by phone before they ever accepted, so a
        // freshly-registered owner can still open their own project.
        if (project.client_id && project.client_id.toString() === userId.toString()) {
            return { role: "client", membership: null };
        }
        return { role: null, membership: null };
    }

    return { role: membership.role, membership };
}

/**
 * @param {...string} allowed  role names, or "any" for every linked party.
 */
function projectAccess(...allowed) {
    const allowAny = allowed.length === 0 || allowed.includes("any");
    const allowList = allowAny ? ALL_ROLES : allowed;

    return async (req, res, next) => {
        try {
            const userId = callerId(req);
            if (!userId) {
                return res.status(401).json({ status: 401, message: "You are not authenticated.", error: true });
            }

            const pid = req.params.pid || req.params.project_id || req.params.id || req.body.project_id;
            if (!pid || !mongoose.Types.ObjectId.isValid(pid)) {
                return res.status(400).json({ status: 400, message: "A valid project id is required.", error: true });
            }

            const project = await Project.findOne({ _id: pid, is_delete: 0 });
            if (!project) {
                return res.status(404).json({ status: 404, message: "Project not found.", error: true });
            }

            const { role, membership } = await resolveProjectRole(project, userId, req.user);

            if (!role) {
                return res.status(403).json({ status: 403, message: "You do not have access to this project.", error: true });
            }

            // Admin bypasses the allow-list but is still recorded accurately.
            if (role !== "admin" && !allowList.includes(role)) {
                return res.status(403).json({
                    status: 403,
                    message: `This action is not available to your role on this project.`,
                    error: true,
                });
            }

            req.project     = project;
            req.membership  = membership;
            req.projectRole = role;
            req.callerId    = userId;
            return next();
        } catch (err) {
            console.error("projectAccess error:", err);
            return res.status(500).json({ status: 500, message: "Server error", error: true });
        }
    };
}

/**
 * Secondary gate for capability flags on ProjectMember.
 * Builders and admins always pass. Chain it AFTER projectAccess.
 *
 *     projectAccess("any"), requireCapability("can_log_progress")
 */
function requireCapability(flag) {
    return (req, res, next) => {
        if (req.projectRole === "builder" || req.projectRole === "admin") return next();
        if (req.membership && req.membership[flag]) return next();
        return res.status(403).json({
            status: 403,
            message: "You do not have permission to perform this action on this project.",
            error: true,
        });
    };
}

/** Mongo filter for "projects this user can see", used by list endpoints. */
async function visibleProjectFilter(userId, user) {
    if (user && user.isAdmin) return { is_delete: 0 };

    const memberships = await ProjectMember.find({
        user_id: userId,
        status:  { $in: ["invited", "active"] },
    }).select("project_id");

    return {
        is_delete: 0,
        $or: [
            { builder_id: userId },
            { client_id:  userId },
            { _id: { $in: memberships.map((m) => m.project_id) } },
        ],
    };
}

module.exports = { projectAccess, requireCapability, resolveProjectRole, visibleProjectFilter, callerId };
