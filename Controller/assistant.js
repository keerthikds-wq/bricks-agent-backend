const Project = require("../Model/Project");
const Milestone = require("../Model/Milestone");
const Approval = require("../Model/Approval");
const DailyLog = require("../Model/DailyLog");
const LedgerEntry = require("../Model/LedgerEntry");
const User = require("../Model/User");
const { visibleProjectFilter, callerId } = require("../Middleware/projectAccess");
const money = require("../Utils/money");
const ai = require("../Utils/aiGuard");
const intelligence = require("./intelligence");
const memory = require("./memory");

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
 * GET /api/assistant/suggestions?project_id=...
 *
 * The questions worth asking right now, derived from what is actually wrong.
 *
 * No model involved, deliberately. A generated list of prompts costs a call and
 * a wait to produce something that must then be checked against reality anyway;
 * these come from the same health engine that drives the home screen, so every
 * suggestion is guaranteed to be about a real condition of this builder's
 * business and to have an answer waiting in the data.
 *
 * Ordered worst-first and capped, because a wall of suggestions is a menu, and
 * a menu is the thing inline AI is supposed to replace.
 */
exports.suggestions = async (req, res) => {
    try {
        const userId = callerId(req);
        const ctx = await gatherContext(userId, req.user);
        const out = [];

        const push = (q, why) => {
            if (out.length < 4 && !out.some((s) => s.question === q)) {
                out.push({ question: q, why });
            }
        };

        // Worst first: money that is not moving, then schedule, then decisions.
        if (ctx.receivable_paise > 0) {
            push(
                `Who owes me money right now?`,
                `${money.formatRupees(ctx.receivable_paise)} across ${ctx.receivable_count} unpaid item${ctx.receivable_count === 1 ? "" : "s"}`,
            );
        }
        if (ctx.projects_behind > 0) {
            push(
                `Which of my sites are behind schedule, and why?`,
                `${ctx.projects_behind} site${ctx.projects_behind === 1 ? "" : "s"} with overdue milestones`,
            );
        }
        if (ctx.pending_approvals > 0) {
            push(
                `What is waiting on my decision?`,
                `${ctx.pending_approvals} pending approval${ctx.pending_approvals === 1 ? "" : "s"}`,
            );
        }
        if (ctx.logs_today === 0 && ctx.projects_active > 0) {
            push(
                `Which sites have not reported today?`,
                `no daily logs yet today`,
            );
        }
        if (ctx.issues_today > 0) {
            push(
                `What problems were reported on site today?`,
                `${ctx.issues_today} log${ctx.issues_today === 1 ? "" : "s"} raised an issue`,
            );
        }

        // A builder whose business is entirely healthy still gets somewhere to
        // start — an empty Copilot reads as broken rather than as good news.
        push(`How is my business doing overall?`, `across all your projects`);

        return ok(res, { suggestions: out });
    } catch (err) {
        console.error("assistant suggestions error:", err);
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

        // Optional project scope.
        //
        // Asked "why is Villa 27 over budget?", the cross-project context above
        // can only say that some site is — it holds portfolio totals. Attaching
        // that project's health and its recent timeline gives the model the
        // specifics, and the rule that it may use nothing else still holds.
        //
        // Scope is resolved through the caller's own visible-project filter, so
        // a project_id belonging to someone else simply is not found. It cannot
        // be used to read a project the caller could not already open.
        const pid = `${req.body.project_id || ""}`.trim();
        if (pid) {
            const filter = await visibleProjectFilter(userId, req.user);
            const project = await Project.findOne({ ...filter, _id: pid }).lean();
            if (project) {
                const [health, timeline] = await Promise.all([
                    intelligence.healthFor(project).catch(() => null),
                    memory.timelineFor(project._id, 25).catch(() => []),
                ]);
                ctx.focus_project = {
                    name: project.name,
                    status: project.status,
                    progress: project.progress,
                    health: health
                        ? { score: health.score, dimensions: health.dimensions }
                        : null,
                    recent_events: (timeline || []).map((e) => ({
                        at: e.at,
                        title: e.title,
                        detail: e.detail,
                    })),
                };
            }
        }

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
            "7. If DATA contains `focus_project`, the question is about that project.",
            "   Answer about it specifically, using its own health and recent events,",
            "   and do not substitute the portfolio totals for its figures.",
        ].join("\n");

        const prompt = [
            `QUESTION: ${question}`,
            "",
            "DATA (the only facts you may use):",
            JSON.stringify(ctx, null, 1),
        ].join("\n");

        // A provider failure is an outage, not a bug in this endpoint.
        //
        // ai.run reports refusals and quota as { ok: false }, but a transport or
        // credential failure throws — and that fell through to the catch below,
        // so a Groq hiccup reached the app as a blank 500 "Server error". The
        // builder cannot tell that apart from the app being broken. Normalised
        // to the same 503 the ok:false path already produces.
        let result;
        try {
            result = await ai.run({
                userId,
                plan: user?.plan || "free",
                system,
                prompt,
                maxTokens: 400,
                temperature: 0.2,
                // Answers depend on today's figures. A cache keyed on the
                // question would serve yesterday's position as today's.
                cache: false,
            });
        } catch (aiErr) {
            console.error("assistant ask — provider error:", aiErr.message);
            result = { ok: false, message: "The assistant is unavailable right now." };
        }

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
