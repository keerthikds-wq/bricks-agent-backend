const Project         = require("../Model/Project");
const ProjectUpdate   = require("../Model/ProjectUpdate");
const Milestone       = require("../Model/Milestone");
const ProjectPayment  = require("../Model/ProjectPayment");
const Approval        = require("../Model/Approval");
const ProjectDocument = require("../Model/ProjectDocument");
const DailyLog        = require("../Model/DailyLog");
const User            = require("../Model/User");

const { callerId }      = require("../Middleware/projectAccess");
const { notifyProject } = require("../Utils/projectNotify");
const { emitToProject } = require("../Utils/realtime");

const ok   = (res, data, status = 200) => res.status(status).json({ success: true, data });
const fail = (res, status, message)    => res.status(status).json({ success: false, message });

/** Author snapshot for feed entries — denormalised on purpose. */
async function authorOf(req) {
    const id = callerId(req);
    const u  = await User.findById(id).select("name role staff_type").lean();
    return {
        author_id:         id,
        author_name:       u?.name || "",
        author_role:       req.projectRole || u?.role || "",
        author_staff_type: req.membership?.staff_type || u?.staff_type || "",
    };
}

/** Recompute Project.progress from milestone completion. */
async function recomputeProgress(projectId) {
    const all = await Milestone.find({ project_id: projectId, is_delete: 0 }).select("completed").lean();
    if (!all.length) return null;
    const done = all.filter((m) => m.completed).length;
    const pct  = Math.round((done * 100) / all.length);
    await Project.updateOne({ _id: projectId }, { $set: { progress: pct } });
    return pct;
}
exports.recomputeProgress = recomputeProgress;

/* ───────────────────────────── Site updates ─────────────────────────── */

// POST /api/projects/:pid/updates
exports.addUpdate = async (req, res) => {
    try {
        const { title, description, category, images } = req.body;
        if (!title) return fail(res, 400, "Title is required");

        const doc = await ProjectUpdate.create({
            project_id: req.project._id,
            title,
            description: description || "",
            category:    category || "progress",
            images:      Array.isArray(images) ? images : [],
            ...(await authorOf(req)),
        });

        emitToProject(req.project._id, "update:new", { update: doc });
        await notifyProject(req.project._id, {
            title: "Site update",
            body:  title,
            kind:  "progress",
            route: `/project/${req.project._id}?tab=feed`,
            excludeUserId: callerId(req),
        });

        return ok(res, doc, 201);
    } catch (err) {
        console.error("addUpdate error:", err);
        return fail(res, 500, "Server error");
    }
};

// GET /api/projects/:pid/updates
exports.listUpdates = async (req, res) => {
    try {
        const items = await ProjectUpdate.find({ project_id: req.project._id, is_delete: 0 })
            .sort({ createdAt: -1 })
            .limit(Number(req.query.limit) || 100)
            .lean();
        return ok(res, items);
    } catch (err) {
        console.error("listUpdates error:", err);
        return fail(res, 500, "Server error");
    }
};

/* ───────────────────────────── Milestones ───────────────────────────── */

// POST /api/projects/:pid/milestones
exports.addMilestone = async (req, res) => {
    try {
        const { title, due_date, description, phase_name } = req.body;
        if (!title) return fail(res, 400, "Title is required");

        const m = await Milestone.create({
            project_id:  req.project._id,
            title,
            due_date,
            description: description || "",
            phase_name:  phase_name || "",
            created_by:  callerId(req),
        });
        await recomputeProgress(req.project._id);
        return ok(res, m, 201);
    } catch (err) {
        console.error("addMilestone error:", err);
        return fail(res, 500, "Server error");
    }
};

// GET /api/projects/:pid/milestones
exports.listMilestones = async (req, res) => {
    try {
        const items = await Milestone.find({ project_id: req.project._id, is_delete: 0 })
            .sort({ due_date: 1 })
            .lean();
        return ok(res, items);
    } catch (err) {
        console.error("listMilestones error:", err);
        return fail(res, 500, "Server error");
    }
};

// PATCH /api/projects/:pid/milestones/:mid/toggle
exports.toggleMilestone = async (req, res) => {
    try {
        const m = await Milestone.findOne({ _id: req.params.mid, project_id: req.project._id });
        if (!m) return fail(res, 404, "Milestone not found");

        m.completed = !m.completed;
        m.completed_at = m.completed ? new Date() : null;
        m.completed_by = m.completed ? callerId(req) : null;
        await m.save();

        const progress = await recomputeProgress(req.project._id);

        emitToProject(req.project._id, "milestone:toggle", { milestone: m, progress });
        if (m.completed) {
            await notifyProject(req.project._id, {
                title: "Milestone completed",
                body:  m.title,
                kind:  "milestone",
                route: `/project/${req.project._id}?tab=milestones`,
                excludeUserId: callerId(req),
            });
        }
        return ok(res, { milestone: m, progress });
    } catch (err) {
        console.error("toggleMilestone error:", err);
        return fail(res, 500, "Server error");
    }
};

/* ────────────────────────────── Payments ────────────────────────────── */

// POST /api/projects/:pid/payments   (builder only)
exports.addPayment = async (req, res) => {
    try {
        const { amount, purpose, due_date, notes, status } = req.body;
        if (amount === undefined || !purpose) return fail(res, 400, "amount and purpose are required");

        const p = await ProjectPayment.create({
            project_id: req.project._id,
            amount:     Number(amount),
            purpose,
            notes:      notes || "",
            due_date,
            status:     status === "paid" ? "paid" : "pending",
            raised_by:  callerId(req),
            ...(status === "paid" ? { paid_at: new Date(), paid_offline: true } : {}),
        });

        if (p.status === "paid") {
            await Project.updateOne({ _id: req.project._id }, { $inc: { spent: p.amount } });
        }

        await notifyProject(req.project._id, {
            title: "Payment request",
            body:  `₹${Number(amount).toLocaleString("en-IN")} · ${purpose}`,
            kind:  "payment",
            route: `/project/${req.project._id}?tab=payments`,
            excludeUserId: callerId(req),
        });

        return ok(res, p, 201);
    } catch (err) {
        console.error("addPayment error:", err);
        return fail(res, 500, "Server error");
    }
};

// GET /api/projects/:pid/payments   (finance-gated)
exports.listPayments = async (req, res) => {
    try {
        const items = await ProjectPayment.find({ project_id: req.project._id, is_delete: 0 })
            .sort({ createdAt: -1 })
            .lean();
        return ok(res, items);
    } catch (err) {
        console.error("listPayments error:", err);
        return fail(res, 500, "Server error");
    }
};

// PATCH /api/projects/:pid/payments/:payId/mark-paid   (builder only — offline/cash)
exports.markPaid = async (req, res) => {
    try {
        const p = await ProjectPayment.findOne({ _id: req.params.payId, project_id: req.project._id });
        if (!p) return fail(res, 404, "Payment not found");
        if (p.status === "paid") return ok(res, p);

        p.status       = "paid";
        p.paid_at      = new Date();
        p.paid_offline = true;
        await p.save();

        await Project.updateOne({ _id: req.project._id }, { $inc: { spent: p.amount } });

        emitToProject(req.project._id, "payment:paid", { payment: p });
        await notifyProject(req.project._id, {
            title: "Payment recorded",
            body:  `₹${p.amount.toLocaleString("en-IN")} · ${p.purpose}`,
            kind:  "payment",
            route: `/project/${req.project._id}?tab=payments`,
            excludeUserId: callerId(req),
        });

        return ok(res, p);
    } catch (err) {
        console.error("markPaid error:", err);
        return fail(res, 500, "Server error");
    }
};

/* ────────────────────────────── Approvals ───────────────────────────── */

// POST /api/projects/:pid/approvals   (builder or client)
exports.createApproval = async (req, res) => {
    try {
        const { title, description, category, cost_delta, attachments } = req.body;
        if (!title) return fail(res, 400, "Title is required");

        const me = await User.findById(callerId(req)).select("name").lean();

        const a = await Approval.create({
            project_id:     req.project._id,
            title,
            description:    description || "",
            category:       category || "change",
            cost_delta:     Number(cost_delta) || 0,
            attachments:    Array.isArray(attachments) ? attachments : [],
            raised_by:      callerId(req),
            raised_by_name: me?.name || "",
            raised_by_role: req.projectRole,
        });

        await notifyProject(req.project._id, {
            title: "Approval requested",
            body:  `${title} needs a decision`,
            kind:  "approval",
            route: `/project/${req.project._id}?tab=approvals`,
            excludeUserId: callerId(req),
        });

        return ok(res, a, 201);
    } catch (err) {
        console.error("createApproval error:", err);
        return fail(res, 500, "Server error");
    }
};

// GET /api/projects/:pid/approvals
exports.listApprovals = async (req, res) => {
    try {
        const items = await Approval.find({ project_id: req.project._id, is_delete: 0 })
            .sort({ createdAt: -1 })
            .lean();
        return ok(res, items);
    } catch (err) {
        console.error("listApprovals error:", err);
        return fail(res, 500, "Server error");
    }
};

// PATCH /api/projects/:pid/approvals/:aid/decide
// Rule: whoever raised it cannot decide it.
exports.decideApproval = async (req, res) => {
    try {
        const { decision, note } = req.body;
        if (!["approved", "rejected"].includes(decision)) {
            return fail(res, 400, "decision must be 'approved' or 'rejected'");
        }

        const a = await Approval.findOne({ _id: req.params.aid, project_id: req.project._id });
        if (!a) return fail(res, 404, "Approval not found");
        if (a.status !== "pending") return fail(res, 400, "This has already been decided");

        const me = callerId(req).toString();
        if (a.raised_by.toString() === me) {
            return fail(res, 403, "You cannot decide an approval you raised");
        }

        // Builder-raised ⇒ the client decides. Client- or staff-raised ⇒ the
        // builder decides. A supervisor with can_approve may also act.
        const isBuilder   = req.projectRole === "builder";
        const isClient    = req.projectRole === "client";
        const canApprove  = req.membership?.can_approve === true;

        if (a.raised_by_role === "builder" && !(isClient || canApprove)) {
            return fail(res, 403, "Only the project owner can decide this");
        }
        if (a.raised_by_role !== "builder" && !(isBuilder || canApprove)) {
            return fail(res, 403, "Only the builder can decide this");
        }

        a.status        = decision;
        a.decided_by    = callerId(req);
        a.decided_at    = new Date();
        a.decision_note = note || "";
        await a.save();

        // An approved cost change moves the budget — otherwise the number the
        // client agreed to and the number they're billed against diverge.
        if (decision === "approved" && a.cost_delta) {
            await Project.updateOne({ _id: req.project._id }, { $inc: { budget: a.cost_delta } });
        }

        emitToProject(req.project._id, "approval:decided", { approval: a });
        await notifyProject(req.project._id, {
            title: `Approval ${decision}`,
            body:  a.title,
            kind:  "approval",
            route: `/project/${req.project._id}?tab=approvals`,
            excludeUserId: callerId(req),
        });

        return ok(res, a);
    } catch (err) {
        console.error("decideApproval error:", err);
        return fail(res, 500, "Server error");
    }
};

/* ────────────────────────────── Documents ───────────────────────────── */

// POST /api/projects/:pid/documents
// Expects a Cloudinary URL from the existing upload flow — never raw base64.
exports.addDocument = async (req, res) => {
    try {
        const { name, doc_type, file_url, file_public_id, mime_type, size_bytes, visible_to_client } = req.body;
        if (!name || !file_url) return fail(res, 400, "name and file_url are required");

        const me = await User.findById(callerId(req)).select("name").lean();

        const d = await ProjectDocument.create({
            project_id:     req.project._id,
            name,
            doc_type:       doc_type || "other",
            file_url,
            file_public_id: file_public_id || "",
            mime_type:      mime_type || "application/pdf",
            size_bytes:     Number(size_bytes) || 0,
            visible_to_client: visible_to_client !== false,
            uploaded_by:      callerId(req),
            uploaded_by_name: me?.name || "",
        });

        await notifyProject(req.project._id, {
            title: "Document added",
            body:  name,
            kind:  "document",
            route: `/project/${req.project._id}?tab=documents`,
            excludeUserId: callerId(req),
        });

        return ok(res, d, 201);
    } catch (err) {
        console.error("addDocument error:", err);
        return fail(res, 500, "Server error");
    }
};

// GET /api/projects/:pid/documents
exports.listDocuments = async (req, res) => {
    try {
        const q = { project_id: req.project._id, is_delete: 0 };
        if (req.projectRole === "client") q.visible_to_client = true;

        const items = await ProjectDocument.find(q).sort({ createdAt: -1 }).lean();
        return ok(res, items);
    } catch (err) {
        console.error("listDocuments error:", err);
        return fail(res, 500, "Server error");
    }
};

// DELETE /api/projects/:pid/documents/:docId   (builder only)
exports.deleteDocument = async (req, res) => {
    try {
        const d = await ProjectDocument.findOne({ _id: req.params.docId, project_id: req.project._id });
        if (!d) return fail(res, 404, "Document not found");

        await ProjectDocument.updateOne({ _id: d._id }, { $set: { is_delete: 1 } });

        // Best-effort remote cleanup; a failure here must not fail the request.
        if (d.file_public_id) {
            try {
                const { cloudinary } = require("../config");
                await cloudinary.uploader.destroy(d.file_public_id);
            } catch (e) {
                console.error("cloudinary destroy (non-fatal):", e.message);
            }
        }
        return ok(res, { deleted: true });
    } catch (err) {
        console.error("deleteDocument error:", err);
        return fail(res, 500, "Server error");
    }
};

/* ────────────────────────────── Daily logs ──────────────────────────── */

// POST /api/projects/:pid/daily-logs
exports.addDailyLog = async (req, res) => {
    try {
        const { log_date, weather, labour, materials, work_done, issues, images } = req.body;

        const date = log_date ? new Date(log_date) : new Date();
        date.setHours(0, 0, 0, 0);

        const author = await authorOf(req);

        const log = await DailyLog.create({
            project_id: req.project._id,
            log_date:   date,
            weather:    weather || "clear",
            labour:     Array.isArray(labour) ? labour : [],
            materials:  Array.isArray(materials) ? materials : [],
            work_done:  work_done || "",
            issues:     issues || "",
            images:     Array.isArray(images) ? images : [],
            author_id:         author.author_id,
            author_name:       author.author_name,
            author_staff_type: author.author_staff_type,
        });

        // Mirror onto the feed so the client sees activity without being shown
        // the raw labour breakdown.
        const trades = (log.labour || [])
            .filter((l) => l.count)
            .map((l) => `${l.trade} × ${l.count}`)
            .join(", ") || "no labour recorded";

        const parts = [
            work_done || `Daily log for ${date.toISOString().slice(0, 10)}.`,
            `Weather: ${log.weather}. Labour: ${trades} (${log.total_workers} workers).`,
        ];
        if (log.materials.length) {
            parts.push("Materials: " + log.materials.map((m) => `${m.name} ${m.quantity}`.trim()).join(", "));
        }
        if (issues) parts.push(`Issues: ${issues}`);

        const update = await ProjectUpdate.create({
            project_id:   req.project._id,
            title:        `Daily log — ${date.toISOString().slice(0, 10)}`,
            description:  parts.join("\n"),
            category:     issues || ["rain", "storm"].includes(log.weather) ? "delay" : "progress",
            images:       log.images,
            daily_log_id: log._id,
            ...author,
        });

        emitToProject(req.project._id, "update:new", { update });
        await notifyProject(req.project._id, {
            title: "Daily log posted",
            body:  `${date.toISOString().slice(0, 10)} · ${log.total_workers} workers`,
            kind:  "progress",
            route: `/project/${req.project._id}?tab=feed`,
            excludeUserId: callerId(req),
        });

        return ok(res, log, 201);
    } catch (err) {
        if (err.code === 11000) {
            return fail(res, 409, "You have already posted a log for this date. Edit that one instead.");
        }
        console.error("addDailyLog error:", err);
        return fail(res, 500, "Server error");
    }
};

// GET /api/projects/:pid/daily-logs
exports.listDailyLogs = async (req, res) => {
    try {
        const items = await DailyLog.find({ project_id: req.project._id, is_delete: 0 })
            .sort({ log_date: -1 })
            .limit(Number(req.query.limit) || 100)
            .lean();
        return ok(res, items);
    } catch (err) {
        console.error("listDailyLogs error:", err);
        return fail(res, 500, "Server error");
    }
};
