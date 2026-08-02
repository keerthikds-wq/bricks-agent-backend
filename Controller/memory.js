const Project = require("../Model/Project");
const ProjectUpdate = require("../Model/ProjectUpdate");
const Milestone = require("../Model/Milestone");
const LedgerEntry = require("../Model/LedgerEntry");
const DailyLog = require("../Model/DailyLog");
const Approval = require("../Model/Approval");
const ProjectDocument = require("../Model/ProjectDocument");
const { visibleProjectFilter, callerId } = require("../Middleware/projectAccess");
const money = require("../Utils/money");

const ok = (res, data, s = 200) => res.status(s).json({ success: true, data });
const fail = (res, s, message) => res.status(s).json({ success: false, message });

/**
 * Construction Memory — one timeline per project.
 *
 * The app already records everything that happens on a build: site updates,
 * milestones reached, money in and out, daily logs, approvals, documents. What
 * it never did was put them in one order. A builder asking "when did the owner
 * approve the tiles?" had to guess which screen it lived on and scroll.
 *
 * This assembles them into a single stream. Deliberately DERIVED rather than a
 * new events collection: a second copy of the same facts drifts from the first
 * the moment anything is edited, and the sources here are already the truth.
 * The cost is a fan-out read; the benefit is that memory cannot disagree with
 * the ledger.
 *
 * Everything else the product needs stands on this — project health is computed
 * from the stream, the home screen is the slice of it that needs a decision
 * today, and the assistant reads it rather than being told facts separately.
 */

/** One shape for every kind of thing that happened. */
function evt({ at, kind, icon, title, detail = "", amount = null, actor = "", ref = null, tone = "neutral" }) {
    return { at, kind, icon, title, detail, amount, actor, ref, tone };
}

/**
 * Builds the timeline for one project.
 *
 * @param {ObjectId} pid
 * @param {number} limit how many events to return, newest first
 */
async function timelineFor(pid, limit = 80) {
    const [updates, milestones, ledger, logs, approvals, docs] = await Promise.all([
        ProjectUpdate.find({ project_id: pid, is_delete: 0 })
            .sort({ createdAt: -1 }).limit(limit).lean(),
        Milestone.find({ project_id: pid, is_delete: 0 })
            .sort({ updatedAt: -1 }).limit(limit).lean(),
        LedgerEntry.find({ project_id: pid, is_delete: 0 })
            .sort({ occurred_on: -1 }).limit(limit).lean(),
        DailyLog.find({ project_id: pid, is_delete: 0 })
            .sort({ log_date: -1 }).limit(limit).lean(),
        Approval.find({ project_id: pid, is_delete: 0 })
            .sort({ updatedAt: -1 }).limit(limit).lean(),
        ProjectDocument.find({ project_id: pid, is_delete: 0 })
            .sort({ createdAt: -1 }).limit(limit).lean(),
    ]);

    const events = [];

    for (const u of updates) {
        events.push(evt({
            at: u.createdAt,
            kind: "update",
            icon: u.category === "delay" || u.category === "issue" ? "warning" : "progress",
            title: u.title,
            detail: u.description || "",
            actor: u.author_name || "",
            ref: { type: "update", id: u._id },
            tone: u.category === "delay" || u.category === "issue" ? "bad" : "good",
        }));
    }

    for (const m of milestones) {
        // Only completed or overdue milestones are events. One that is merely
        // scheduled has not happened yet, and a timeline of things that have not
        // happened is a plan, not a memory.
        if (m.completed) {
            events.push(evt({
                at: m.updatedAt || m.due_date,
                kind: "milestone",
                icon: "check",
                title: `${m.title} completed`,
                actor: "",
                ref: { type: "milestone", id: m._id },
                tone: "good",
            }));
        } else if (m.due_date && new Date(m.due_date) < new Date()) {
            events.push(evt({
                at: m.due_date,
                kind: "milestone",
                icon: "warning",
                title: `${m.title} overdue`,
                detail: "Was due on this date",
                ref: { type: "milestone", id: m._id },
                tone: "bad",
            }));
        }
    }

    for (const l of ledger) {
        const inbound = l.direction === "in";
        const settled = l.status === "settled";
        events.push(evt({
            at: l.settled_on || l.occurred_on,
            kind: "money",
            icon: inbound ? "money_in" : "money_out",
            title: settled
                ? `${inbound ? "Received" : "Paid"} ${money.formatRupees(l.amount_paise)}`
                : `${inbound ? "Invoiced" : "Bill received"} ${money.formatRupees(l.amount_paise)}`,
            detail: l.description || l.party_name || "",
            amount: money.toRupees(l.amount_paise),
            actor: l.party_name || "",
            ref: { type: "ledger", id: l._id },
            tone: settled ? (inbound ? "good" : "neutral") : "warn",
        }));
    }

    for (const g of logs) {
        const trades = (g.labour || [])
            .filter((x) => x.count)
            .map((x) => `${x.trade} × ${x.count}`)
            .join(", ");
        events.push(evt({
            at: g.log_date,
            kind: "site",
            icon: g.issues ? "warning" : "people",
            title: g.work_done || "Daily log posted",
            detail: [
                trades ? `${g.total_workers} on site — ${trades}` : "",
                g.issues ? `Issue: ${g.issues}` : "",
            ].filter(Boolean).join(" · "),
            actor: g.author_name || "",
            ref: { type: "daily_log", id: g._id },
            tone: g.issues ? "bad" : "neutral",
        }));
    }

    for (const a of approvals) {
        if (a.status === "pending") continue;
        events.push(evt({
            at: a.updatedAt,
            kind: "approval",
            icon: a.status === "approved" ? "check" : "cross",
            title: `${a.title} ${a.status}`,
            detail: a.description || "",
            ref: { type: "approval", id: a._id },
            tone: a.status === "approved" ? "good" : "bad",
        }));
    }

    for (const d of docs) {
        events.push(evt({
            at: d.createdAt,
            kind: "document",
            icon: "document",
            title: `${d.name || "Document"} added`,
            detail: d.category || "",
            ref: { type: "document", id: d._id },
        }));
    }

    return events
        .filter((e) => e.at)
        .sort((a, b) => new Date(b.at) - new Date(a.at))
        .slice(0, limit);
}

/**
 * GET /api/projects/:pid/memory?limit=80
 *
 * The project's timeline. Grouped by day on the client; returned flat here
 * because the grouping a screen wants ("Today", "Yesterday", a date) depends on
 * the reader's timezone, which the server does not know.
 */
exports.projectMemory = async (req, res) => {
    try {
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 80, 1), 300);
        const events = await timelineFor(req.project._id, limit);
        return ok(res, {
            project_id: req.project._id,
            project_name: req.project.name,
            events,
            count: events.length,
        });
    } catch (err) {
        console.error("projectMemory error:", err);
        return fail(res, 500, "Server error");
    }
};

module.exports.timelineFor = timelineFor;
