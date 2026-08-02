const Project = require("../Model/Project");
const Milestone = require("../Model/Milestone");
const LedgerEntry = require("../Model/LedgerEntry");
const DailyLog = require("../Model/DailyLog");
const Approval = require("../Model/Approval");
const { visibleProjectFilter, callerId } = require("../Middleware/projectAccess");
const money = require("../Utils/money");

const ok = (res, data, s = 200) => res.status(s).json({ success: true, data });
const fail = (res, s, message) => res.status(s).json({ success: false, message });

/**
 * Construction Intelligence — what needs attention, and why.
 *
 * Not a score for its own sake. Each dimension is a question a builder already
 * asks, answered from data the app holds, with the reason attached — a health
 * number without a reason is decoration, and nobody acts on decoration.
 *
 *   Budget    is committed cost overtaking the budget?
 *   Schedule  are milestones slipping?
 *   Labour    is anyone reporting from site?
 *   Cash      is more owed to us than we owe, and is it moving?
 *   Approvals is a decision blocking work?
 *
 * ── Where a dimension has no data ────────────────────────────────────────────
 *
 * It returns `unknown`, not a default of "good". A site with no daily logs is
 * not a healthy site — it is a site nobody is reporting from, which is arguably
 * worse, and scoring it 100% would hide exactly the project most likely to be
 * in trouble.
 */

const GOOD = "good";
const WARN = "warn";
const BAD = "bad";
const UNKNOWN = "unknown";

/** Weights sum to 1. Cash and schedule dominate because they end projects. */
const WEIGHTS = { budget: 0.25, schedule: 0.25, labour: 0.15, cash: 0.25, approvals: 0.10 };
const SCORE = { [GOOD]: 1, [WARN]: 0.55, [BAD]: 0.15, [UNKNOWN]: 0.5 };

async function healthFor(project) {
    const pid = project._id;
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 864e5);

    const [milestones, ledgerRows, recentLogs, pendingApprovals] = await Promise.all([
        Milestone.find({ project_id: pid, is_delete: 0 }).lean(),
        LedgerEntry.aggregate([
            { $match: { project_id: pid, is_delete: 0, status: { $in: ["pending", "settled"] } } },
            { $group: { _id: { d: "$direction", s: "$status" }, paise: { $sum: "$amount_paise" } } },
        ]),
        DailyLog.countDocuments({ project_id: pid, is_delete: 0, log_date: { $gte: weekAgo } }),
        Approval.countDocuments({ project_id: pid, is_delete: 0, status: "pending" }),
    ]);

    let received = 0, receivable = 0, paid = 0, payable = 0;
    for (const r of ledgerRows) {
        const { d, s } = r._id;
        if (d === "in" && s === "settled") received += r.paise;
        if (d === "in" && s === "pending") receivable += r.paise;
        if (d === "out" && s === "settled") paid += r.paise;
        if (d === "out" && s === "pending") payable += r.paise;
    }

    const dims = {};

    /* ── Budget: committed cost against the budget ─────────────────────── */
    const budgetPaise = money.toPaise(project.budget || 0);
    const committed = paid + payable;
    if (!budgetPaise) {
        dims.budget = { state: UNKNOWN, reason: "No budget set for this project" };
    } else {
        const used = committed / budgetPaise;
        dims.budget = used > 1
            ? { state: BAD, reason: `Committed cost is ${Math.round(used * 100)}% of budget` }
            : used > 0.85
                ? { state: WARN, reason: `${Math.round(used * 100)}% of budget committed` }
                : { state: GOOD, reason: `${Math.round(used * 100)}% of budget committed` };
    }

    /* ── Schedule: milestones slipping ─────────────────────────────────── */
    const overdue = milestones.filter(
        (m) => !m.completed && m.due_date && new Date(m.due_date) < now);
    if (!milestones.length) {
        dims.schedule = { state: UNKNOWN, reason: "No milestones set, so nothing to track against" };
    } else {
        dims.schedule = overdue.length >= 3
            ? { state: BAD, reason: `${overdue.length} milestones overdue` }
            : overdue.length > 0
                ? { state: WARN, reason: `${overdue.length} milestone${overdue.length === 1 ? "" : "s"} overdue` }
                : { state: GOOD, reason: "All milestones on schedule" };
    }

    /* ── Labour: is anyone reporting? ──────────────────────────────────── */
    dims.labour = recentLogs === 0
        ? { state: UNKNOWN, reason: "No daily log in the last 7 days — nobody is reporting from site" }
        : recentLogs < 3
            ? { state: WARN, reason: `Only ${recentLogs} daily log${recentLogs === 1 ? "" : "s"} this week` }
            : { state: GOOD, reason: `${recentLogs} daily logs this week` };

    /* ── Cash: position and direction ──────────────────────────────────── */
    if (!received && !paid && !receivable && !payable) {
        dims.cash = { state: UNKNOWN, reason: "No money recorded on this project yet" };
    } else {
        const net = received - paid;
        dims.cash = net < 0 && payable > receivable
            ? { state: BAD, reason: `Spent ${money.formatRupees(-net)} more than received, and owe more than is owed` }
            : receivable > 0 && receivable > received
                ? { state: WARN, reason: `${money.formatRupees(receivable)} outstanding from the client` }
                : { state: GOOD, reason: `${money.formatRupees(net)} net position` };
    }

    /* ── Approvals: decisions blocking work ────────────────────────────── */
    dims.approvals = pendingApprovals === 0
        ? { state: GOOD, reason: "Nothing waiting on a decision" }
        : pendingApprovals > 2
            ? { state: BAD, reason: `${pendingApprovals} approvals blocking work` }
            : { state: WARN, reason: `${pendingApprovals} awaiting a decision` };

    /* ── Roll up ───────────────────────────────────────────────────────── */
    let score = 0;
    for (const [k, w] of Object.entries(WEIGHTS)) {
        score += (SCORE[dims[k].state] ?? 0.5) * w;
    }

    // What to do about it, worst first. Recommendations come from the same
    // reasons rather than a separate rule set, so the score and the advice can
    // never contradict each other.
    const order = { [BAD]: 0, [WARN]: 1, [UNKNOWN]: 2, [GOOD]: 3 };
    const recommendations = Object.entries(dims)
        .filter(([, v]) => v.state === BAD || v.state === WARN || v.state === UNKNOWN)
        .sort((a, b) => order[a[1].state] - order[b[1].state])
        .map(([k, v]) => ({ dimension: k, state: v.state, reason: v.reason, action: ACTIONS[k]?.[v.state] || null }))
        .filter((r) => r.action);

    return {
        project_id: pid,
        project_name: project.name,
        score: Math.round(score * 100),
        dimensions: dims,
        recommendations,
    };
}

/** The one thing worth doing about each state. Kept short — it is a nudge. */
const ACTIONS = {
    budget: {
        [BAD]: "Review committed costs before approving more spend",
        [WARN]: "Check remaining bills against the budget",
        [UNKNOWN]: "Set a budget so overruns can be caught early",
    },
    schedule: {
        [BAD]: "Reschedule or close out the overdue milestones",
        [WARN]: "Chase the overdue milestone",
        [UNKNOWN]: "Add milestones so slippage is visible",
    },
    labour: {
        [WARN]: "Ask the site team to post daily logs",
        [UNKNOWN]: "Nobody has logged from this site in a week — check in",
    },
    cash: {
        [BAD]: "Collect outstanding payments before settling more bills",
        [WARN]: "Follow up the client on the outstanding amount",
        [UNKNOWN]: "Record payments and bills to see the cash position",
    },
    approvals: {
        [BAD]: "Clear the pending approvals — they are blocking work",
        [WARN]: "One decision is waiting on you",
    },
};

/** GET /api/projects/:pid/health */
exports.projectHealth = async (req, res) => {
    try {
        return ok(res, await healthFor(req.project));
    } catch (err) {
        console.error("projectHealth error:", err);
        return fail(res, 500, "Server error");
    }
};

/**
 * GET /api/intelligence/attention
 *
 * Every project the caller can see, worst first — the answer to "which site has
 * a problem?" without opening any of them.
 */
exports.needsAttention = async (req, res) => {
    try {
        const filter = await visibleProjectFilter(callerId(req), req.user);
        const projects = await Project.find(filter)
            .select("_id name budget status progress").lean();

        const health = await Promise.all(projects.map((p) => healthFor(p)));
        health.sort((a, b) => a.score - b.score);

        return ok(res, {
            projects: health,
            worst: health[0] || null,
            needing_attention: health.filter((h) => h.score < 70).length,
        });
    } catch (err) {
        console.error("needsAttention error:", err);
        return fail(res, 500, "Server error");
    }
};

module.exports.healthFor = healthFor;
