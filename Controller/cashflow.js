const LedgerEntry = require("../Model/LedgerEntry");
const Project = require("../Model/Project");
const { visibleProjectFilter, callerId } = require("../Middleware/projectAccess");
const money = require("../Utils/money");

const ok = (res, data, s = 200) => res.status(s).json({ success: true, data });
const fail = (res, s, message) => res.status(s).json({ success: false, message });

/**
 * Cash flow — what is coming in and going out, and when.
 *
 * Every builder question this answers is about timing, not totals. "Can I pay
 * wages on Saturday" is not answered by a profit figure; it is answered by
 * knowing that ₹6L lands on Thursday and ₹9L of bills fall due on Friday.
 *
 * ── Derived, never stored ────────────────────────────────────────────────────
 *
 * There is no forecast collection. Buckets are computed from pending ledger
 * entries and their due dates, so the forecast cannot drift from the ledger it
 * describes — settle a bill and it leaves the outflow the same instant.
 *
 * ── What counts as "when" ────────────────────────────────────────────────────
 *
 * A pending entry with a due date is scheduled on it. A pending entry WITHOUT
 * one is genuinely unscheduled — it is money that will move, on a date nobody
 * has committed to. Those are reported separately rather than being quietly
 * dropped or, worse, assumed to land today. Guessing a date would make the
 * forecast look precise while being made up, which is the one thing a cash
 * forecast must never be.
 */

/** Inclusive day count between two dates, ignoring clock time. */
function daysBetween(a, b) {
    const x = new Date(a); x.setHours(0, 0, 0, 0);
    const y = new Date(b); y.setHours(0, 0, 0, 0);
    return Math.round((y - x) / 864e5);
}

/**
 * The horizon, in weeks from today.
 *
 * Weekly and not daily: construction money does not move on a daily rhythm, and
 * a 90-bar daily chart on a phone is unreadable. Weekly buckets match how a
 * builder actually plans — "this week, next week, the week after".
 */
function buildBuckets(weeks) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const out = [];
    for (let i = 0; i < weeks; i++) {
        const from = new Date(today.getTime() + i * 7 * 864e5);
        const to = new Date(from.getTime() + 6 * 864e5);
        out.push({
            week: i,
            from,
            to,
            in_paise: 0,
            out_paise: 0,
            in_count: 0,
            out_count: 0,
        });
    }
    return out;
}

/**
 * GET /api/finance/cashflow?weeks=8
 *
 * Buckets, a running balance, and the first week the balance goes negative.
 */
exports.cashflow = async (req, res) => {
    try {
        const weeks = Math.min(Math.max(parseInt(req.query.weeks, 10) || 8, 2), 26);

        const userId = callerId(req);
        const filter = await visibleProjectFilter(userId, req.user);
        const projects = await Project.find(filter).select("_id").lean();
        const ids = projects.map((p) => p._id);

        const pending = ids.length
            ? await LedgerEntry.find({
                  project_id: { $in: ids },
                  is_delete: 0,
                  status: "pending",
              })
                  .select("direction amount_paise due_date party_name description project_id")
                  .lean()
            : [];

        const buckets = buildBuckets(weeks);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const horizonEnd = buckets[buckets.length - 1].to;

        let overdueIn = 0, overdueOut = 0, overdueInCount = 0, overdueOutCount = 0;
        let unscheduledIn = 0, unscheduledOut = 0;
        let beyondIn = 0, beyondOut = 0;

        for (const e of pending) {
            const amt = e.amount_paise || 0;
            const inbound = e.direction === "in";

            if (!e.due_date) {
                if (inbound) unscheduledIn += amt; else unscheduledOut += amt;
                continue;
            }

            const due = new Date(e.due_date);
            const offset = daysBetween(today, due);

            // Already due and unpaid. Not folded into week 0: a bill that was
            // due three weeks ago is a different problem from one due Friday,
            // and averaging them into "this week" hides how late things are.
            if (offset < 0) {
                if (inbound) { overdueIn += amt; overdueInCount++; }
                else { overdueOut += amt; overdueOutCount++; }
                continue;
            }

            if (due > horizonEnd) {
                if (inbound) beyondIn += amt; else beyondOut += amt;
                continue;
            }

            const b = buckets[Math.floor(offset / 7)];
            if (!b) continue;
            if (inbound) { b.in_paise += amt; b.in_count++; }
            else { b.out_paise += amt; b.out_count++; }
        }

        // Running balance across the horizon.
        //
        // Starts at zero, so this is the CHANGE in cash rather than a bank
        // balance — the app does not know what is in the account and will not
        // pretend to. "You go ₹4L down in week 3" is true and useful without it.
        let running = 0;
        const series = buckets.map((b) => {
            const net = b.in_paise - b.out_paise;
            running += net;
            return {
                week: b.week,
                from: b.from,
                to: b.to,
                in: money.toRupees(b.in_paise),
                in_paise: b.in_paise,
                in_count: b.in_count,
                out: money.toRupees(b.out_paise),
                out_paise: b.out_paise,
                out_count: b.out_count,
                net: money.toRupees(net),
                net_paise: net,
                balance: money.toRupees(running),
                balance_paise: running,
            };
        });

        const firstNegative = series.find((s) => s.balance_paise < 0) || null;

        return ok(res, {
            weeks,
            series,
            // Money that has already slipped. Surfaced at the top level because
            // it is the most actionable number here: it is not a forecast, it
            // has already happened.
            overdue: {
                incoming: money.toRupees(overdueIn),
                incoming_paise: overdueIn,
                incoming_count: overdueInCount,
                outgoing: money.toRupees(overdueOut),
                outgoing_paise: overdueOut,
                outgoing_count: overdueOutCount,
            },
            // Real money with no committed date. Reported, never guessed onto
            // the chart.
            unscheduled: {
                incoming: money.toRupees(unscheduledIn),
                incoming_paise: unscheduledIn,
                outgoing: money.toRupees(unscheduledOut),
                outgoing_paise: unscheduledOut,
            },
            beyond_horizon: {
                incoming: money.toRupees(beyondIn),
                incoming_paise: beyondIn,
                outgoing: money.toRupees(beyondOut),
                outgoing_paise: beyondOut,
            },
            // The week it goes wrong, or null. This is the whole point of the
            // endpoint: a builder wants the date, not the curve.
            first_shortfall: firstNegative
                ? { week: firstNegative.week, from: firstNegative.from, balance: firstNegative.balance }
                : null,
        });
    } catch (err) {
        console.error("cashflow error:", err);
        return fail(res, 500, "Server error");
    }
};

/**
 * GET /api/projects/:pid/invoice?status=pending
 *
 * The data an invoice is rendered from — never a stored document.
 *
 * An invoice is a statement of what the ledger says at the moment it is asked
 * for. Storing it would create a second copy of the same figures that silently
 * disagrees the first time an entry is edited, and a client holding an invoice
 * that no longer matches the books is worse than having no invoice at all.
 */
exports.projectInvoice = async (req, res) => {
    try {
        const project = req.project;

        // Client-facing money only. A material bill from a supplier has no
        // business appearing on the statement sent to the person paying for
        // the house — it is the builder's cost, not the client's line item.
        const entries = await LedgerEntry.find({
            project_id: project._id,
            is_delete: 0,
            direction: "in",
            status: { $in: ["pending", "settled"] },
        })
            .sort({ occurred_on: 1 })
            .lean();

        let billed = 0, received = 0;
        const lines = entries.map((e) => {
            const amt = e.amount_paise || 0;
            billed += amt;
            if (e.status === "settled") received += amt;
            return {
                id: e._id,
                date: e.occurred_on,
                due_date: e.due_date || null,
                description: e.description || e.category || "Payment",
                status: e.status,
                amount: money.toRupees(amt),
                amount_paise: amt,
                settled_on: e.settled_on || null,
            };
        });

        return ok(res, {
            project_id: project._id,
            project_name: project.name,
            client_name: project.client_name || "",
            client_phone: project.client_phone || "",
            address: project.address || "",
            generated_at: new Date(),
            lines,
            billed: money.toRupees(billed),
            billed_paise: billed,
            received: money.toRupees(received),
            received_paise: received,
            // Derived here rather than trusting a stored total, so it can never
            // disagree with the lines printed above it.
            balance: money.toRupees(billed - received),
            balance_paise: billed - received,
        });
    } catch (err) {
        console.error("projectInvoice error:", err);
        return fail(res, 500, "Server error");
    }
};
