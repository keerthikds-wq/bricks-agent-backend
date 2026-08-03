const mongoose = require("mongoose");
const Project        = require("../Model/Project");
const ProjectMember  = require("../Model/ProjectMember");
const Milestone      = require("../Model/Milestone");
const ProjectPayment = require("../Model/ProjectPayment");
const ProjectUpdate  = require("../Model/ProjectUpdate");
const Approval       = require("../Model/Approval");
const DailyLog       = require("../Model/DailyLog");
const User           = require("../Model/User");

const { visibleProjectFilter, callerId } = require("../Middleware/projectAccess");
const { notifyUsers, notifyProject }     = require("../Utils/projectNotify");
const invites   = require("../Utils/projectInvite");
const { emitToProject } = require("../Utils/realtime");

const ok   = (res, data, status = 200) => res.status(status).json({ success: true, data });
const fail = (res, status, message)    => res.status(status).json({ success: false, message });

/* ────────────────────────────── Projects ────────────────────────────── */

// POST /api/projects   (builder only, plan-gated)
exports.createProject = async (req, res) => {
    try {
        const builderId = callerId(req);
        const {
            name, description, address, pincode, project_type, area_sqft, floors,
            budget, start_date, expected_end_date, cover_image,
            client_phone, client_name, longitude, latitude,
        } = req.body;

        if (!name) return fail(res, 400, "Project name is required");

        const project = await Project.create({
            builder_id: builderId,
            name,
            description,
            address,
            pincode,
            project_type,
            area_sqft,
            floors,
            budget,
            start_date,
            expected_end_date,
            cover_image,
            client_phone: client_phone || "",
            client_name:  client_name  || "",
            status: "planning",
            location: {
                type: "Point",
                coordinates: [Number(longitude) || 0, Number(latitude) || 0],
            },
        });

        // If the owner already has an account, link them immediately so the
        // project shows up on their home screen without an invite round-trip.
        if (client_phone) {
            const existing = await User.findOne({ phone: client_phone, is_delete: 0 });
            if (existing) {
                project.client_id = existing._id;
                await project.save();
                await ProjectMember.updateOne(
                    { project_id: project._id, user_id: existing._id, role: "client" },
                    {
                        $set: {
                            ...ProjectMember.defaultCapabilities("client"),
                            status: "active",
                            invited_by: builderId,
                            accepted_at: new Date(),
                        },
                    },
                    { upsert: true }
                );
                await notifyUsers([existing._id], {
                    projectId: project._id,
                    title: "You've been added to a project",
                    body: `${name} — you can now follow progress live.`,
                    kind: "invite",
                    route: `/project/${project._id}`,
                });
            }
        }

        return ok(res, project, 201);
    } catch (err) {
        console.error("createProject error:", err);
        return fail(res, 500, "Server error");
    }
};

// GET /api/projects   — every project the caller can see, in any role
exports.listProjects = async (req, res) => {
    try {
        const userId = callerId(req);
        const filter = await visibleProjectFilter(userId, req.user);

        const projects = await Project.find(filter)
            .sort({ createdAt: -1 })
            .limit(200)
            .lean();

        // Vendors have no business seeing budgets on projects they supply to.
        const isVendor = req.user?.role === "vendor";
        const shaped = projects.map((p) => {
            if (!isVendor) return p;
            const { budget, spent, ...safe } = p;
            return safe;
        });

        return ok(res, shaped);
    } catch (err) {
        console.error("listProjects error:", err);
        return fail(res, 500, "Server error");
    }
};

// GET /api/projects/:pid   (projectAccess("any"))
exports.getProject = async (req, res) => {
    try {
        const p = req.project.toObject();
        p.my_role       = req.projectRole;
        p.my_capabilities = req.membership
            ? {
                  can_log_progress: req.membership.can_log_progress,
                  can_view_finance: req.membership.can_view_finance,
                  can_approve:      req.membership.can_approve,
              }
            : { can_log_progress: true, can_view_finance: true, can_approve: true };

        if (req.projectRole === "vendor") {
            delete p.budget;
            delete p.spent;
        }
        return ok(res, p);
    } catch (err) {
        console.error("getProject error:", err);
        return fail(res, 500, "Server error");
    }
};

// PATCH /api/projects/:pid   (builder only)
exports.updateProject = async (req, res) => {
    try {
        const allowed = [
            "name", "description", "address", "pincode", "project_type",
            "area_sqft", "floors", "budget", "start_date", "expected_end_date",
            "cover_image", "status", "client_phone", "client_name",
        ];
        const updates = {};
        for (const k of allowed) if (req.body[k] !== undefined) updates[k] = req.body[k];

        if (req.body.longitude !== undefined || req.body.latitude !== undefined) {
            updates.location = {
                type: "Point",
                coordinates: [
                    Number(req.body.longitude) || req.project.location?.coordinates?.[0] || 0,
                    Number(req.body.latitude)  || req.project.location?.coordinates?.[1] || 0,
                ],
            };
        }

        const updated = await Project.findByIdAndUpdate(
            req.project._id,
            { $set: updates },
            { new: true, runValidators: true }
        );

        emitToProject(req.project._id, "project:updated", { project: updated });
        return ok(res, updated);
    } catch (err) {
        console.error("updateProject error:", err);
        return fail(res, 500, "Server error");
    }
};

// DELETE /api/projects/:pid   (builder only) — soft delete, frees a plan slot
exports.deleteProject = async (req, res) => {
    try {
        await Project.updateOne({ _id: req.project._id }, { $set: { is_delete: 1, status: "archived" } });
        return ok(res, { deleted: true });
    } catch (err) {
        console.error("deleteProject error:", err);
        return fail(res, 500, "Server error");
    }
};

// PUT /api/projects/:pid/phase/:index   (builder or staff who can log)
exports.updatePhase = async (req, res) => {
    try {
        const idx = parseInt(req.params.index, 10);
        if (isNaN(idx) || idx < 0 || idx >= req.project.phases.length) {
            return fail(res, 400, "Invalid phase index");
        }
        const { status, notes } = req.body;
        const set = {};
        if (status !== undefined) {
            set[`phases.${idx}.status`] = status;
            if (status === "completed") set[`phases.${idx}.completed_at`] = new Date();
        }
        if (notes !== undefined) set[`phases.${idx}.notes`] = notes;

        const updated = await Project.findByIdAndUpdate(req.project._id, { $set: set }, { new: true });

        emitToProject(req.project._id, "project:phase", { index: idx, phase: updated.phases[idx] });
        if (status === "completed") {
            await notifyProject(req.project._id, {
                title: "Phase completed",
                body: `${updated.phases[idx].name} — ${updated.name}`,
                kind: "milestone",
                route: `/project/${req.project._id}`,
                excludeUserId: callerId(req),
            });
        }
        return ok(res, updated);
    } catch (err) {
        console.error("updatePhase error:", err);
        return fail(res, 500, "Server error");
    }
};

/* ────────────────────────────── Members ─────────────────────────────── */

// GET /api/projects/:pid/members
exports.listMembers = async (req, res) => {
    try {
        const members = await ProjectMember.find({
            project_id: req.project._id,
            status: { $ne: "removed" },
        })
            .populate("user_id", "name phone profile role staff_type trade")
            .lean();

        const builder = await User.findById(req.project.builder_id).select("name phone profile").lean();

        return ok(res, {
            builder: builder ? { ...builder, role: "builder" } : null,
            members,
        });
    } catch (err) {
        console.error("listMembers error:", err);
        return fail(res, 500, "Server error");
    }
};

// DELETE /api/projects/:pid/members/:memberId   (builder only)
exports.removeMember = async (req, res) => {
    try {
        const m = await ProjectMember.findOne({ _id: req.params.memberId, project_id: req.project._id });
        if (!m) return fail(res, 404, "Member not found");

        m.status = "removed";
        m.removed_at = new Date();
        await m.save();

        if (m.role === "client") {
            await Project.updateOne({ _id: req.project._id }, { $set: { client_id: null } });
        }
        return ok(res, { removed: true });
    } catch (err) {
        console.error("removeMember error:", err);
        return fail(res, 500, "Server error");
    }
};

// PATCH /api/projects/:pid/members/:memberId   (builder only) — tune capabilities
exports.updateMember = async (req, res) => {
    try {
        const allowed = ["can_log_progress", "can_view_finance", "can_approve", "staff_type", "trade"];
        const updates = {};
        for (const k of allowed) if (req.body[k] !== undefined) updates[k] = req.body[k];

        const m = await ProjectMember.findOneAndUpdate(
            { _id: req.params.memberId, project_id: req.project._id },
            { $set: updates },
            { new: true }
        );
        if (!m) return fail(res, 404, "Member not found");
        return ok(res, m);
    } catch (err) {
        console.error("updateMember error:", err);
        return fail(res, 500, "Server error");
    }
};

/* ────────────────────────────── Invites ─────────────────────────────── */

// POST /api/projects/:pid/invite   (builder only)
exports.createInvite = async (req, res) => {
    try {
        const { role, staff_type = null, trade = "", phone = "" } = req.body;
        if (!["client", "field_staff"].includes(role)) {
            return fail(res, 400, "role must be 'client' or 'field_staff' (vendors are invited from the vendor roster)");
        }
        if (role === "field_staff" && !["site_engineer", "supervisor", "mason", "contractor"].includes(staff_type)) {
            return fail(res, 400, "staff_type is required for field staff");
        }

        const builder = await User.findById(callerId(req)).select("name").lean();

        const token = invites.createProjectInvite({
            projectId: req.project._id,
            role,
            staffType: staff_type,
            trade,
            invitedBy: callerId(req),
            phone,
        });

        const msg = invites.buildInviteMessage({
            token,
            inviterName: builder?.name || "Your builder",
            projectName: req.project.name,
            role,
            staffType: staff_type,
        });

        return ok(res, { token, role, staff_type, ...msg });
    } catch (err) {
        console.error("createInvite error:", err);
        return fail(res, 500, "Server error");
    }
};

// GET /api/projects/invite/:token   — public preview shown before login
exports.inviteInfo = async (req, res) => {
    try {
        const payload = invites.decodeInvite(req.params.token, "project_invite");
        const project = await Project.findOne({ _id: payload.project_id, is_delete: 0 })
            .select("name address cover_image builder_id")
            .lean();
        if (!project) return fail(res, 404, "That project no longer exists");

        const builder = await User.findById(project.builder_id).select("name profile").lean();

        return ok(res, {
            project_name: project.name,
            address:      project.address,
            cover_image:  project.cover_image,
            builder_name: builder?.name || "",
            role:         payload.role,
            staff_type:   payload.staff_type,
            role_label:   invites.roleLabel(payload.role, payload.staff_type),
        });
    } catch (err) {
        return fail(res, err.status || 500, err.message || "Server error");
    }
};

// POST /api/projects/invite/:token/accept   (any authenticated user)
exports.acceptInvite = async (req, res) => {
    try {
        const userId  = callerId(req);
        const payload = invites.decodeInvite(req.params.token, "project_invite");

        const project = await Project.findOne({ _id: payload.project_id, is_delete: 0 });
        if (!project) return fail(res, 404, "That project no longer exists");

        if (project.builder_id.toString() === userId.toString()) {
            return fail(res, 400, "You are the builder on this project.");
        }

        const caps = ProjectMember.defaultCapabilities(payload.role, payload.staff_type);

        const member = await ProjectMember.findOneAndUpdate(
            { project_id: project._id, user_id: userId, role: payload.role },
            {
                $set: {
                    staff_type:  payload.staff_type || null,
                    trade:       payload.trade || "",
                    ...caps,
                    status:      "active",
                    invited_by:  payload.invited_by,
                    accepted_at: new Date(),
                },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        // A project has exactly one client — record it on the project too.
        if (payload.role === "client") {
            await Project.updateOne({ _id: project._id }, { $set: { client_id: userId } });
        }

        // Align the user's global role if they were still on the default.
        const user = await User.findById(userId);
        if (user && payload.role === "field_staff" && user.role === "client") {
            user.role = "field_staff";
            user.staff_type = payload.staff_type || user.staff_type;
            if (payload.trade) user.trade = payload.trade;
            await user.save();
        }

        await notifyUsers([project.builder_id], {
            projectId: project._id,
            title: "Invite accepted",
            body: `${user?.name || "Someone"} joined ${project.name}`,
            kind: "success",
            route: `/project/${project._id}`,
        });

        return ok(res, { joined: true, project_id: project._id, role: member.role, member });
    } catch (err) {
        console.error("acceptInvite error:", err);
        return fail(res, err.status || 500, err.message || "Server error");
    }
};

/* ───────────────────────────── Dashboard ────────────────────────────── */

// GET /api/projects/dashboard   — role-aware home screen payload
exports.dashboard = async (req, res) => {
    try {
        const userId = callerId(req);
        const role   = req.user?.role || "client";
        const filter = await visibleProjectFilter(userId, req.user);

        const projects = await Project.find(filter).sort({ createdAt: -1 }).limit(50).lean();
        const ids = projects.map((p) => p._id);

        const [recentUpdates, upcomingMilestones, pendingPayments, pendingApprovals] = await Promise.all([
            ProjectUpdate.find({ project_id: { $in: ids }, is_delete: 0 })
                .sort({ createdAt: -1 }).limit(10).lean(),
            Milestone.find({ project_id: { $in: ids }, completed: false, is_delete: 0 })
                .sort({ due_date: 1 }).limit(10).lean(),
            ProjectPayment.countDocuments({ project_id: { $in: ids }, status: "pending", is_delete: 0 }),
            Approval.countDocuments({ project_id: { $in: ids }, status: "pending", is_delete: 0 }),
        ]);

        // Per-project headcount and next milestone.
        //
        // A project card that shows only progress and budget is a progress bar
        // with a name on it. What makes it worth looking at is whether anyone
        // is on that site today and what is due next — and neither lives on the
        // Project document, so the card could not show them however it was
        // designed.
        //
        // Two grouped aggregations for the whole set rather than a query per
        // card: at 50 projects the naive version is 100 round trips to render
        // one screen.
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const [todayLogs, nextMilestones] = await Promise.all([
            ids.length
                ? DailyLog.aggregate([
                      { $match: { project_id: { $in: ids }, is_delete: 0, log_date: { $gte: startOfToday } } },
                      { $group: { _id: "$project_id", workers: { $sum: "$total_workers" } } },
                  ])
                : [],
            ids.length
                ? Milestone.find({
                      project_id: { $in: ids }, completed: false, is_delete: 0,
                      due_date: { $ne: null },
                  }).sort({ due_date: 1 }).select("project_id title due_date").lean()
                : [],
        ]);

        const workersBy = new Map(todayLogs.map((r) => [String(r._id), r.workers || 0]));
        const nextBy = new Map();
        for (const m of nextMilestones) {
            // Sorted by due date, so the first one seen per project is the next
            // one due.
            const k = String(m.project_id);
            if (!nextBy.has(k)) nextBy.set(k, { title: m.title, due_date: m.due_date });
        }

        const decorate = (p) => ({
            ...p,
            // Absent rather than 0 when nobody logged: "no report yet" and
            // "nobody turned up" are different facts, and the card says so.
            workers_today: workersBy.has(String(p._id)) ? workersBy.get(String(p._id)) : null,
            next_milestone: nextBy.get(String(p._id)) || null,
            // The phase actually underway, so the card can name the stage
            // without the app re-deriving it from the phases array.
            current_stage: (p.phases || []).find((ph) => ph.status === "in_progress")?.name || null,
        });

        const payload = {
            role,
            projects_count:  projects.length,
            active_projects: projects.filter((p) => p.status === "active").length,
            recent_updates:  recentUpdates,
            upcoming_milestones: upcomingMilestones,
            pending_approvals:   pendingApprovals,
            projects: projects.slice(0, 5).map(decorate),
        };

        // Money is builder + client only.
        if (role === "builder" || role === "client") {
            payload.total_budget    = projects.reduce((s, p) => s + (p.budget || 0), 0);
            payload.total_spent     = projects.reduce((s, p) => s + (p.spent  || 0), 0);
            payload.pending_payments = pendingPayments;

            // The business position, across every project the caller can see.
            //
            // `total_budget` and `total_spent` alone cannot answer the questions
            // a builder actually has — what am I owed, what do I owe, are wages
            // outstanding, am I heading over budget on committed cost rather
            // than on cash already gone. All of it comes from one aggregation
            // over the ledger so the figures cannot disagree with each other.
            const { positionFor } = require("./ledger");
            const position = await positionFor(ids);

            payload.finance = {
                ...position,
                // Cost committed whether or not it has been paid. This is the
                // number that warns of an overrun; `spent` reports it too late.
                committed: position.paid + position.payable,
                budget_remaining: payload.total_budget - (position.paid + position.payable),
            };

            // Flat aliases so a screen can read a single figure without
            // destructuring, and so the names match what the app asks for.
            payload.total_received   = position.received;
            payload.total_receivable = position.receivable;
            payload.total_paid       = position.paid;
            payload.total_payable    = position.payable;
            payload.outstanding      = position.receivable;
            payload.wages_due        = position.wages_due;
            payload.net_position     = position.net_position;
        }

        if (role === "builder") {
            const { getStatus } = require("../Utils/subscription");
            const user = await User.findById(userId);
            payload.subscription = await getStatus(user);
        }

        return ok(res, payload);
    } catch (err) {
        console.error("dashboard error:", err);
        return fail(res, 500, "Server error");
    }
};
