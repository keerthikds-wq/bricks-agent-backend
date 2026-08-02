const Project = require("../Model/Project");
const Milestone = require("../Model/Milestone");
const Approval = require("../Model/Approval");
const DailyLog = require("../Model/DailyLog");
const LedgerEntry = require("../Model/LedgerEntry");
const User = require("../Model/User");
const { visibleProjectFilter, callerId } = require("../Middleware/projectAccess");
const money = require("../Utils/money");
const ai = require("../Utils/aiGuard");

const ok = (res, data, s = 200) => res.status(s).json({ success: true, data });
const fail = (res, s, message) => res.status(s).json({ success: false, message });

/**
 * Gathers the caller's real position — the facts the assistant is allowed to
 * talk about.
 *
 * This is the whole design of the feature. A construction assistant that
 * invents a number is worse than no assistant: a builder who is told
 * "₹4L is pending" and pays against it once, wrongly, never trusts the app
 * again. So the model is never asked to recall or estimate anything. It is
 * handed the figures and asked only to phrase them.
 */
async function gatherContext(userId, user) {
    const filter = await visibleProjectFilter(userId, user);
    const projects = await Project.find(filter)
        .select("_id name status progress budget client_name")
        .lean();
    const ids = projects.map((p) => p._id);

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [overdue, approvals, todayLogs, ledgerRows] = await Promise.all([
        ids.length
            ? Milestone.find({
                  project_id: { $in: ids },
                  completed: false,
                  is_delete: 0,
                  due_date: { $lt: new Date() },
              })
                  .select("title project_id due_date")
                  .lean()
            : [],
        ids.length
            ? Approval.countDocuments({
                  project_id: { $in: ids },
                  status: "pending",
                  is_delete: 0,
              })
            : 0,
        ids.length
            ? DailyLog.find({
                  project_id: { $in: ids },
                  log_date: { $gte: startOfDay },
                  is_delete: 0,
              })
                  .select("project_id labour total_workers materials issues")
                  .lean()
            : [],
        ids.length
            ? LedgerEntry.aggregate([
                  {
                      $match: {
                          project_id: { $in: ids },
                          is_delete: 0,
                          status: { $in: ["pending", "settled"] },
                      },
                  },
                  {
                      $group: {
                          _id: { direction: "$direction", status: "$status" },
                          paise: { $sum: "$amount_paise" },
                          count: { $sum: 1 },
                      },
                  },
              ])
            : [],
    ]);

    let receivable = 0, received = 0, payable = 0, paid = 0;
    let receivableCount = 0;
    for (const r of ledgerRows) {
        const { direction, status } = r._id;
        if (direction === "in" && status === "pending") {
            receivable += r.paise;
            receivableCount += r.count;
        }
        if (direction === "in" && status === "settled") received += r.paise;
        if (direction === "out" && status === "pending") payable += r.paise;
        if (direction === "out" && status === "settled") paid += r.paise;
    }

    const projectsWithOverdue = new Set(overdue.map((m) => String(m.project_id)));
    const workersToday = todayLogs.reduce(
        (s, l) => s + (l.total_workers || 0), 0);
    const sitesReportingToday = new Set(
        todayLogs.map((l) => String(l.project_id))).size;
    const issuesToday = todayLogs.filter(
        (l) => (l.issues || "").trim().length > 0).length;

    return {
        projects_total: projects.length,
        projects_active: projects.filter((p) => p.status === "active").length,
        projects_behind: projectsWithOverdue.size,
        overdue_milestones: overdue.length,
        pending_approvals: approvals,

        receivable: money.toRupees(receivable),
        receivable_paise: receivable,
        receivable_count: receivableCount,
        received: money.toRupees(received),
        payable: money.toRupees(payable),
        paid: money.toRupees(paid),
        net_position: money.toRupees(received - paid),

        workers_today: workersToday,
        sites_reporting_today: sitesReportingToday,
        logs_today: todayLogs.length,
        issues_today: issuesToday,

        project_names: projects.slice(0, 12).map((p) => ({
            name: p.name,
            status: p.status,
            progress: p.progress,
            behind: projectsWithOverdue.has(String(p._id)),
        })),
    };
}

/**
 * GET /api/assistant/summary
 *
 * The "Today's summary" block. Plain aggregation, no model involved — these are
 * counts, and running them through a language model could only make them wrong.
 */
exports.summary = async (req, res) => {
    try {
        const ctx = await gatherContext(callerId(req), req.user);

        // Only rows the data supports. The mockup shows "5 material deliveries
        // today, 2 delayed"; nothing in this system tracks deliveries, so that
        // row does not exist rather than being filled with a plausible number.
        const rows = [];

        rows.push({
            key: "projects",
            value: `${ctx.projects_active} project${ctx.projects_active === 1 ? "" : "s"} active`,
            note: ctx.projects_behind > 0
                ? `${ctx.projects_behind} behind schedule`
                : "all on schedule",
            tone: ctx.projects_behind > 0 ? "warn" : "ok",
        });

        if (ctx.receivable_paise > 0) {
            rows.push({
                key: "payments",
                // Formatted, not raw. "400000 pending" is a number a human has
                // to parse; "₹4,00,000 pending" is one they read.
                value: `${money.formatRupees(ctx.receivable_paise)} pending`,
                note: `${ctx.receivable_count} unpaid item${ctx.receivable_count === 1 ? "" : "s"}`,
                tone: "warn",
            });
        }

        if (ctx.logs_today > 0) {
            rows.push({
                key: "workers",
                value: `${ctx.workers_today} worker${ctx.workers_today === 1 ? "" : "s"} on site today`,
                note: `across ${ctx.sites_reporting_today} site${ctx.sites_reporting_today === 1 ? "" : "s"}`,
                tone: "ok",
            });
        }

        if (ctx.pending_approvals > 0) {
            rows.push({
                key: "approvals",
                value: `${ctx.pending_approvals} awaiting approval`,
                note: "needs a decision",
                tone: "warn",
            });
        }

        return ok(res, { rows, context: ctx });
    } catch (err) {
        console.error("assistant summary error:", err);
        return fail(res, 500, "Server error");
    }
};

/**
 * POST /api/assistant/ask   { question }
 *
 * Answers from the caller's own data and nothing else.
 *
 * The system prompt forbids inventing figures, and the only figures in the
 * conversation are the ones attached below it. If the context does not contain
 * an answer the model is told to say so — "I don't have that" is a good answer
 * from a business assistant and a confident wrong number is not.
 *
 * Not cached: the same question asked tomorrow has a different answer, and a
 * cache keyed on the question text would serve yesterday's position as today's.
 */
exports.ask = async (req, res) => {
    try {
        const question = `${req.body.question || ""}`.trim();
        if (!question) return fail(res, 400, "Ask a question first.");
        if (question.length > 500) {
            return fail(res, 400, "That question is too long — keep it under 500 characters.");
        }

        const userId = callerId(req);
        const user = await User.findById(userId).select("plan name").lean();
        const ctx = await gatherContext(userId, req.user);

        const system = [
            "You are the assistant inside Bricks Agent, an app Indian builders use to run",
            "construction projects. You answer questions about THIS builder's business.",
            "",
            "ABSOLUTE RULES:",
            "1. Use ONLY the figures in the DATA block. Never estimate, recall, or infer a",
            "   number that is not there. If the DATA does not answer the question, say so",
            "   plainly and name what is missing.",
            "2. Never invent project names, client names, dates or amounts.",
            "3. Amounts are Indian rupees. Write them as they appear in the DATA.",
            "4. Answer in at most four short sentences. A builder is reading this on a",
            "   phone, often on site.",
            "5. No preamble, no sign-off, no markdown headings. Plain sentences.",
            "6. If something needs action, say what to do and where in the app to do it.",
        ].join("\n");

        const prompt = [
            `QUESTION: ${question}`,
            "",
            "DATA (the only facts you may use):",
            JSON.stringify(ctx, null, 1),
        ].join("\n");

        const result = await ai.run({
            userId,
            plan: user?.plan || "free",
            system,
            prompt,
            maxTokens: 400,
            temperature: 0.2,
            // Answers depend on today's figures. A cache keyed on the question
            // would happily serve yesterday's position as today's.
            cache: false,
        });

        if (!result.ok) {
            return res.status(result.limitReached ? 429 : 503).json({
                success: false,
                message: result.message || "The assistant is unavailable right now.",
                limit_reached: !!result.limitReached,
                usage: result.usage,
            });
        }

        return ok(res, {
            answer: (result.text || "").trim(),
            usage: result.usage,
        });
    } catch (err) {
        console.error("assistant ask error:", err);
        return fail(res, 500, "Server error");
    }
};

module.exports.gatherContext = gatherContext;
