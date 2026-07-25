const jwt = require("jsonwebtoken");

/**
 * Realtime project rooms (Socket.IO).
 *
 * v2 used a raw FastAPI WebSocket with an in-memory room map and NO auth —
 * any client that knew a project id could subscribe to its feed. Here the
 * handshake is JWT-authenticated and membership is verified before a socket
 * is allowed to join a project room.
 *
 * Wire-up lives in index.js; this module is a no-op until `init(server)` runs,
 * so `emitToProject` is always safe to call (including under serverless, where
 * there is no long-lived server and emits are simply dropped).
 */

let io = null;

function init(server) {
    let Server;
    try {
        ({ Server } = require("socket.io"));
    } catch (e) {
        console.warn("realtime: socket.io not installed — realtime disabled");
        return null;
    }

    io = new Server(server, {
        cors: {
            origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(",") : "*",
            methods: ["GET", "POST"],
        },
        path: "/socket.io",
    });

    // Authenticate the socket itself — not just the room join.
    io.use((socket, next) => {
        const raw = socket.handshake.auth?.token || socket.handshake.query?.token;
        if (!raw) return next(new Error("unauthenticated"));
        const token = String(raw).startsWith("Bearer ") ? String(raw).split(" ")[1] : String(raw);
        jwt.verify(token, process.env.SECRET, (err, user) => {
            if (err) return next(new Error("unauthenticated"));
            socket.user = user;
            next();
        });
    });

    io.on("connection", (socket) => {
        const userId = socket.user?.id || socket.user?._id;

        socket.on("project:join", async (projectId, ack) => {
            try {
                const { resolveProjectRole } = require("../Middleware/projectAccess");
                const Project = require("../Model/Project");

                const project = await Project.findOne({ _id: projectId, is_delete: 0 });
                if (!project) return ack?.({ ok: false, message: "Project not found" });

                const { role } = await resolveProjectRole(project, userId, socket.user);
                if (!role) return ack?.({ ok: false, message: "Not allowed" });

                socket.join(`project:${projectId}`);
                ack?.({ ok: true, role });
            } catch (e) {
                console.error("project:join error:", e.message);
                ack?.({ ok: false, message: "Server error" });
            }
        });

        socket.on("project:leave", (projectId) => socket.leave(`project:${projectId}`));
    });

    console.log("realtime: socket.io ready");
    return io;
}

/**
 * Broadcast an event to everyone watching a project.
 * Safe to call when realtime was never initialised.
 */
function emitToProject(projectId, event, payload = {}) {
    if (!io || !projectId) return;
    try {
        io.to(`project:${projectId}`).emit(event, { project_id: String(projectId), ...payload });
    } catch (e) {
        console.error("emitToProject error (non-fatal):", e.message);
    }
}

module.exports = { init, emitToProject, get io() { return io; } };
