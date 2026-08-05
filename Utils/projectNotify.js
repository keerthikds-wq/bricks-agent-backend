const admin = require("firebase-admin");
const ProjectNotification = require("../Model/ProjectNotification");
const ProjectMember       = require("../Model/ProjectMember");
const Project             = require("../Model/Project");
const User                = require("../Model/User");

/**
 * Project notification fan-out.
 *
 * v2 wrote in-app rows only (deps.py notify) and had no push at all; the live
 * app has push but no per-project inbox. This does both, and is the single
 * place project events get announced.
 *
 * Every function here is fire-and-forget and must never throw into a request
 * handler — a failed notification must not fail the write that triggered it.
 */

// Credential resolution lives in Utils/firebase.js — see the note there on why
// this stopped being `require("./config.json")` and why "initialised" is not
// the same thing as "able to authenticate".
const { getApp } = require("./firebase");
function _initFcm() {
    return getApp() !== null;
}

async function _push(token, title, body, data = {}) {
    if (!token || token === "user_logged_out") return false;
    if (!_initFcm()) return false;
    try {
        await admin.messaging().send({
            notification: { title, body },
            data: {
                title,
                body,
                click_action: "FLUTTER_NOTIFICATION_CLICK",
                ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
            },
            token,
        });
        return true;
    } catch (e) {
        console.error("projectNotify _push (non-fatal):", e.message);
        return false;
    }
}

/**
 * Everyone linked to a project: builder + client + active members.
 * @returns {Promise<string[]>} user ids
 */
async function projectStakeholders(projectId, { excludeUserId = null } = {}) {
    try {
        const project = await Project.findById(projectId).select("builder_id client_id");
        if (!project) return [];

        const ids = new Set();
        if (project.builder_id) ids.add(project.builder_id.toString());
        if (project.client_id)  ids.add(project.client_id.toString());

        const members = await ProjectMember.find({
            project_id: projectId,
            status:     { $in: ["invited", "active"] },
        }).select("user_id");

        members.forEach((m) => ids.add(m.user_id.toString()));

        if (excludeUserId) ids.delete(excludeUserId.toString());
        return [...ids];
    } catch (e) {
        console.error("projectStakeholders error (non-fatal):", e.message);
        return [];
    }
}

/**
 * Notify a specific set of users.
 *
 * @param {string[]} userIds
 * @param {object}   opts  { projectId, title, body, kind, route }
 */
async function notifyUsers(userIds, { projectId = null, title, body = "", kind = "info", route = "" } = {}) {
    if (!userIds || !userIds.length || !title) return;
    try {
        const docs = userIds.map((uid) => ({
            user_id:    uid,
            project_id: projectId,
            title,
            body,
            kind,
            route,
        }));
        const created = await ProjectNotification.insertMany(docs, { ordered: false });

        // Push in parallel; a failure on one device must not block the rest.
        const users = await User.find({ _id: { $in: userIds } }).select("_id fcm_token");
        const tokenByUser = new Map(users.map((u) => [u._id.toString(), u.fcm_token]));

        await Promise.allSettled(
            created.map(async (n) => {
                const ok = await _push(tokenByUser.get(n.user_id.toString()), title, body, {
                    project_id: projectId || "",
                    kind,
                    route,
                });
                if (ok) await ProjectNotification.updateOne({ _id: n._id }, { $set: { pushed: true } });
            })
        );
    } catch (e) {
        console.error("notifyUsers error (non-fatal):", e.message);
    }
}

/** Notify every stakeholder on a project, optionally excluding the actor. */
async function notifyProject(projectId, { title, body = "", kind = "info", route = "", excludeUserId = null } = {}) {
    const ids = await projectStakeholders(projectId, { excludeUserId });
    return notifyUsers(ids, { projectId, title, body, kind, route });
}

module.exports = { notifyUsers, notifyProject, projectStakeholders };
