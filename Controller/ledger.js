const LedgerEntry = require("../Model/LedgerEntry");
const WageRate = require("../Model/WageRate");
const DailyLog = require("../Model/DailyLog");
const Project = require("../Model/Project");

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });
const fail = (res, status, message) => res.status(status).json({ success: false, message });

const callerId = (req) => req.user?.id || req.user?._id;

/* ─────────────────────────── Position (the rollup) ─────────────────────────── */

/**
 * The money position for a set of projects.
 *
 * One aggregation over the ledger rather than several counts against different
 * tables — a balance assembled from separate queries drifts the moment one of
 * them is updated and another is not.
 *
 * Definitions, stated once so the dashboard and the project screen cannot
 * disagree about them:
 *   received     money that has actually arrived      (in,  settled)
 *   receivable   money owed to the builder            (in,  pending)
 *   paid         money that has actually gone out     (out, settled)
 *   payable      money the builder owes               (out, pending)
 *   wages_due    the labour slice of payable          (out, pending, labour_wage)
 *   net_position received − paid: cash actually seen on this build
 *
 * Cancelled entries are excluded everywhere.
 */
async function positionFor(projectIds) {
    if (!projectIds || !projectIds.length) return emptyPosition();

    const rows = await LedgerEntry.aggregate([
        {
            $match: {
                project_id: { $in: projectIds },
                is_delete: 0,
                status: { $in: ["pending", "settled"] },
            },
        },
        {
            $group: {
                // Summed in paise. `$sum` over a double would accumulate the
                // same drift a float sum does in Node — integers cannot.
                _id: { direction: "$direction", status: "$status", category: "$category" },
                total: { $sum: "$amount_paise" },
                count: { $sum: 1 },
            },
        },
    ]);

    // Accumulate in paise, convert once at the end.
    const acc = {
        received: 0, receivable: 0, paid: 0, payable: 0, wages_due: 0,
        receivable_count: 0, payable_count: 0, by_category: {},
    };

    for (const r of rows) {
        const { direction, status, category } = r._id;
        const t = Math.trunc(r.total || 0);

        if (direction === "in" && status === "settled") acc.received += t;
        if (direction === "in" && status === "pending") {
            acc.receivable += t;
            acc.receivable_count += r.count;
        }
        if (direction === "out" && status === "settled") acc.paid += t;
        if (direction === "out" && status === "pending") {
            acc.payable += t;
            acc.payable_count += r.count;
            if (category === "labour_wage") acc.wages_due += t;
        }
        if (direction === "out") {
            acc.by_category[category] = (acc.by_category[category] || 0) + t;
        }
    }

    return shapePosition(acc);
}

/**
 * Presents a paise accumulator as the response body.
 *
 * Both units go out: `*_paise` is exact and is what any further arithmetic must
 * use, while the rupee fields are for display and keep the existing screens
 * working. Converting is one division of an exact integer, done once at the
 * boundary — the rule is that nothing accumulates in rupees.
 */
function shapePosition(acc) {
    const money = require("../Utils/money");
    const r = money.toRupees;

    const by_category = {};
    const by_category_paise = {};
    for (const [k, v] of Object.entries(acc.by_category || {})) {
        by_category_paise[k] = v;
        by_category[k] = r(v);
    }

    return {
        received: r(acc.received),
        receivable: r(acc.receivable),
        paid: r(acc.paid),
        payable: r(acc.payable),
        wages_due: r(acc.wages_due),
        net_position: r(acc.received - acc.paid),

        received_paise: acc.received,
        receivable_paise: acc.receivable,
        paid_paise: acc.paid,
        payable_paise: acc.payable,
        wages_due_paise: acc.wages_due,
        net_position_paise: acc.received - acc.paid,

        receivable_count: acc.receivable_count,
        payable_count: acc.payable_count,
        by_category,
        by_category_paise,
    };
}

function emptyPosition() {
    return shapePosition({
        received: 0, receivable: 0, paid: 0, payable: 0, wages_due: 0,
        receivable_count: 0, payable_count: 0, by_category: {},
    });
}

/* ───────────────────────────── Mirroring helpers ───────────────────────────── */

/**
 * Keeps a ledger entry in step with a document that owns the money elsewhere
 * (today: ProjectPayment).
 *
 * Updates in place keyed on `source_ref` rather than inserting, so a retried
 * request or a double tap cannot book the same payment twice. That is also what
 * the unique index on (source, source_ref) enforces.
 *
 * Failures here are logged and swallowed: a ledger mirror must never be the
 * reason a builder cannot record a payment. The reconcile endpoint below exists
 * to repair anything that slipped.
 */
async function mirror(source, sourceRef, doc) {
    try {
        await LedgerEntry.findOneAndUpdate(
            { source, source_ref: sourceRef },
            { $set: doc },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
    } catch (err) {
        console.error(`ledger mirror failed (${source} ${sourceRef}):`, err.message);
    }
}

/** Mirror a ProjectPayment — a stage payment owed by, or received from, the client. */
async function mirrorProjectPayment(payment, project) {
    if (!payment) return;
    const money = require("../Utils/money");
    // Both units set explicitly: findOneAndUpdate does not run the pre-save
    // hook that normally derives one from the other.
    const paise = money.toPaise(payment.amount || 0);

    await mirror("project_payment", payment._id, {
        project_id: payment.project_id,
        builder_id: project?.builder_id,
        direction: "in",
        category: "client_payment",
        amount_paise: paise,
        amount: money.toRupees(paise),
        status: payment.status === "paid" ? "settled"
            : payment.status === "cancelled" ? "cancelled" : "pending",
        description: payment.purpose || "Stage payment",
        party_name: project?.client_name || "",
        party_phone: project?.client_phone || "",
        occurred_on: payment.createdAt || new Date(),
        due_date: payment.due_date,
        settled_on: payment.paid_at,
        payment_mode: payment.razorpay_payment_id ? "razorpay"
            : payment.paid_offline ? "cash" : "",
        reference_no: payment.razorpay_payment_id || "",
        source: "project_payment",
        source_ref: payment._id,
        created_by: payment.raised_by,
    });
}

/**
 * Value a daily log's labour and record it as accrued wages.
 *
 * This is what makes "every wage captured" true without asking the supervisor
 * to do arithmetic: they count heads, the builder sets rates once, and the cost
 * follows. An explicit rate on a row wins over the configured default so a
 * one-off payment is still recordable.
 *
 * Trades with no rate configured are reported back rather than valued at zero —
 * a silent zero understates the build's cost, which is the failure mode that
 * matters here.
 */
async function accrueWagesForLog(log, project) {
    const money = require("../Utils/money");
    const missing = [];
    const rowTotals = [];

    for (const row of log.labour || []) {
        const count = Math.trunc(Number(row.count) || 0);
        if (count <= 0) continue;

        let ratePaise = row.rate ? money.toPaise(row.rate) : 0;
        let stdHours = 8;
        let otMult = 1;

        if (!ratePaise) {
            const wr = await WageRate.rateFor(project.builder_id, row.trade, log.log_date);
            if (!wr) { missing.push(row.trade); continue; }
            ratePaise = money.toPaise(wr.daily_rate);
            stdHours = wr.standard_hours || 8;
            otMult = wr.overtime_multiplier || 1;
        }

        const hours = Number(row.hours) || stdHours;
        const normal = Math.min(hours, stdHours);
        const over = Math.max(0, hours - stdHours);

        // Rounded once per row, after both the pro-rata and the overtime
        // premium — not per worker, which would multiply the rounding error by
        // the headcount, and not at the end, which would hide which row a
        // discrepancy came from.
        const normalPaise = money.scale(ratePaise, normal, stdHours);
        const overPaise = over > 0 ? money.scale(ratePaise, over * otMult, stdHours) : 0;
        const perHead = normalPaise + overPaise;

        rowTotals.push(money.scale(perHead, count, 1));
    }

    const total = money.sum(rowTotals);

    if (total > 0) {
        await mirror("daily_log", log._id, {
            project_id: log.project_id,
            builder_id: project.builder_id,
            direction: "out",
            category: "labour_wage",
            amount_paise: total,
            amount: money.toRupees(total),
            status: "pending",
            description: `Labour — ${(log.labour || [])
                .filter((l) => l.count)
                .map((l) => `${l.trade} × ${l.count}`)
                .join(", ")}`,
            occurred_on: log.log_date,
            source: "daily_log",
            source_ref: log._id,
            created_by: log.author_id,
        });
    }

    const money2 = require("../Utils/money");
    return {
        accrued: money2.toRupees(total),
        accrued_paise: total,
        missing_rates: [...new Set(missing)],
    };
}

/* ──────────────────────────────── Endpoints ──────────────────────────────── */

/** GET /api/projects/:pid/ledger — the entries, newest first. */
exports.listEntries = async (req, res) => {
    try {
        const { direction, category, status, from, to } = req.query;
        const q = { project_id: req.project._id, is_delete: 0 };
        if (direction) q.direction = direction;
        if (category) q.category = category;
        if (status) q.status = status;
        if (from || to) {
            q.occurred_on = {};
            if (from) q.occurred_on.$gte = new Date(from);
            if (to) q.occurred_on.$lte = new Date(to);
        }

        const entries = await LedgerEntry.find(q)
            .sort({ occurred_on: -1, createdAt: -1 })
            .limit(Math.min(Number(req.query.limit) || 200, 500))
            .lean();

        return ok(res, entries);
    } catch (err) {
        console.error("listEntries error:", err);
        return fail(res, 500, "Server error");
    }
};

/** GET /api/projects/:pid/ledger/summary — this project's position. */
exports.projectSummary = async (req, res) => {
    try {
        const position = await positionFor([req.project._id]);
        const budget = req.project.budget || 0;

        return ok(res, {
            ...position,
            budget,
            // Committed cost, whether or not it has been paid yet. This is the
            // number that tells a builder they are heading over budget, which
            // `spent` (paid only) cannot.
            committed: position.paid + position.payable,
            budget_remaining: budget - (position.paid + position.payable),
            over_budget: budget > 0 && (position.paid + position.payable) > budget,
        });
    } catch (err) {
        console.error("projectSummary error:", err);
        return fail(res, 500, "Server error");
    }
};

/** POST /api/projects/:pid/ledger — record a bill, a payment, or an expense. */
exports.addEntry = async (req, res) => {
    try {
        const {
            direction, category, amount, status, party_name, party_phone,
            description, line_items, occurred_on, due_date, payment_mode,
            reference_no, attachments,
        } = req.body;

        if (!["in", "out"].includes(direction)) {
            return fail(res, 400, "direction must be 'in' or 'out'");
        }
        if (!category) return fail(res, 400, "category is required");

        const money = require("../Utils/money");
        const hasItems = Array.isArray(line_items) && line_items.length > 0;

        // Parsed to exact paise here, at the edge, so nothing downstream ever
        // handles a rupee float. A malformed amount is a 400 with the reason,
        // never a silent rounding — see Utils/money.js.
        let amountPaise = 0;
        if (!hasItems) {
            try {
                amountPaise = money.toPaise(amount);
            } catch (err) {
                return fail(res, 400, err.message);
            }
            if (amountPaise <= 0) {
                return fail(res, 400, "amount must be greater than zero, or send line_items");
            }
        }

        const entry = await LedgerEntry.create({
            project_id: req.project._id,
            builder_id: req.project.builder_id,
            direction,
            category,
            amount_paise: amountPaise,
            status: ["pending", "settled", "cancelled"].includes(status) ? status : "pending",
            party_name: party_name || "",
            party_phone: party_phone || "",
            description: description || "",
            line_items: hasItems ? line_items : [],
            occurred_on: occurred_on ? new Date(occurred_on) : new Date(),
            due_date: due_date ? new Date(due_date) : undefined,
            payment_mode: payment_mode || "",
            reference_no: reference_no || "",
            attachments: Array.isArray(attachments) ? attachments : [],
            source: "manual",
            created_by: callerId(req),
        });

        await syncProjectSpent(req.project._id);
        return ok(res, entry, 201);
    } catch (err) {
        if (err.name === "ValidationError") {
            return fail(res, 400, Object.values(err.errors).map((e) => e.message).join("; "));
        }
        console.error("addEntry error:", err);
        return fail(res, 500, "Server error");
    }
};

/** PATCH /api/projects/:pid/ledger/:entryId/settle — the money moved. */
exports.settleEntry = async (req, res) => {
    try {
        const entry = await LedgerEntry.findOne({
            _id: req.params.entryId, project_id: req.project._id, is_delete: 0,
        });
        if (!entry) return fail(res, 404, "Entry not found");
        if (entry.status === "settled") return fail(res, 409, "Already settled");
        if (entry.status === "cancelled") return fail(res, 409, "This entry was cancelled");

        entry.status = "settled";
        entry.settled_on = req.body.settled_on ? new Date(req.body.settled_on) : new Date();
        if (req.body.payment_mode) entry.payment_mode = req.body.payment_mode;
        if (req.body.reference_no) entry.reference_no = req.body.reference_no;
        await entry.save();

        await syncProjectSpent(req.project._id);
        return ok(res, entry);
    } catch (err) {
        console.error("settleEntry error:", err);
        return fail(res, 500, "Server error");
    }
};

/** PATCH /api/projects/:pid/ledger/:entryId/cancel — written off. */
exports.cancelEntry = async (req, res) => {
    try {
        const entry = await LedgerEntry.findOneAndUpdate(
            { _id: req.params.entryId, project_id: req.project._id, is_delete: 0 },
            { $set: { status: "cancelled" } },
            { new: true }
        );
        if (!entry) return fail(res, 404, "Entry not found");
        await syncProjectSpent(req.project._id);
        return ok(res, entry);
    } catch (err) {
        console.error("cancelEntry error:", err);
        return fail(res, 500, "Server error");
    }
};

/**
 * Keeps the legacy `Project.spent` field in step with the ledger.
 *
 * Existing screens read `spent`, so it cannot simply be abandoned. It now means
 * "money actually paid out", derived from the ledger rather than incremented by
 * hand — which is what let it drift in the first place.
 */
async function syncProjectSpent(projectId) {
    try {
        const [row] = await LedgerEntry.aggregate([
            { $match: { project_id: projectId, direction: "out", status: "settled", is_delete: 0 } },
            { $group: { _id: null, total: { $sum: "$amount_paise" } } },
        ]);
        // Summed in paise, stored in rupees: `Project.spent` is a legacy display
        // field that existing screens read, so its unit cannot change. The
        // conversion is one division of an exact integer, at the boundary.
        const money = require("../Utils/money");
        await Project.updateOne(
            { _id: projectId },
            { $set: { spent: money.toRupees(row?.total || 0) } }
        );
    } catch (err) {
        console.error("syncProjectSpent failed:", err.message);
    }
}

/* ──────────────────────────────── Wage rates ──────────────────────────────── */

/** GET /api/wage-rates */
exports.listWageRates = async (req, res) => {
    try {
        const rates = await WageRate.find({ builder_id: callerId(req), is_delete: 0 })
            .sort({ trade: 1, effective_from: -1 }).lean();
        return ok(res, rates);
    } catch (err) {
        console.error("listWageRates error:", err);
        return fail(res, 500, "Server error");
    }
};

/** POST /api/wage-rates */
exports.setWageRate = async (req, res) => {
    try {
        const { trade, daily_rate, standard_hours, overtime_multiplier, effective_from, notes } = req.body;
        if (!trade) return fail(res, 400, "trade is required");
        const rate = Number(daily_rate);
        if (!Number.isFinite(rate) || rate <= 0) return fail(res, 400, "daily_rate must be greater than zero");

        const doc = await WageRate.create({
            builder_id: callerId(req),
            trade,
            daily_rate: rate,
            standard_hours: Number(standard_hours) || 8,
            overtime_multiplier: Number(overtime_multiplier) || 1,
            effective_from: effective_from ? new Date(effective_from) : new Date(),
            notes: notes || "",
        });
        return ok(res, doc, 201);
    } catch (err) {
        console.error("setWageRate error:", err);
        return fail(res, 500, "Server error");
    }
};

/** DELETE /api/wage-rates/:id */
exports.removeWageRate = async (req, res) => {
    try {
        const r = await WageRate.findOneAndUpdate(
            { _id: req.params.id, builder_id: callerId(req) },
            { $set: { is_delete: 1 } },
            { new: true }
        );
        if (!r) return fail(res, 404, "Rate not found");
        return ok(res, { removed: true });
    } catch (err) {
        console.error("removeWageRate error:", err);
        return fail(res, 500, "Server error");
    }
};

/**
 * POST /api/projects/:pid/ledger/reconcile
 *
 * Rebuilds the mirrored entries from their source documents. Needed because the
 * ledger arrived after the data did: existing ProjectPayments and daily logs
 * predate it and would otherwise be invisible to every total. Idempotent, so it
 * is also the repair path if a mirror ever fails.
 */
exports.reconcile = async (req, res) => {
    try {
        const ProjectPayment = require("../Model/ProjectPayment");
        const project = req.project;

        const payments = await ProjectPayment.find({ project_id: project._id, is_delete: 0 });
        for (const p of payments) await mirrorProjectPayment(p, project);

        const logs = await DailyLog.find({ project_id: project._id, is_delete: 0 });
        let wages = 0;
        const missing = new Set();
        for (const l of logs) {
            const r = await accrueWagesForLog(l, project);
            wages += r.accrued;
            r.missing_rates.forEach((t) => missing.add(t));
        }

        await syncProjectSpent(project._id);
        const position = await positionFor([project._id]);

        return ok(res, {
            payments_mirrored: payments.length,
            logs_valued: logs.length,
            wages_accrued: wages,
            trades_without_rates: [...missing],
            position,
        });
    } catch (err) {
        console.error("reconcile error:", err);
        return fail(res, 500, "Server error");
    }
};

module.exports.positionFor = positionFor;
module.exports.mirrorProjectPayment = mirrorProjectPayment;
module.exports.accrueWagesForLog = accrueWagesForLog;
module.exports.syncProjectSpent = syncProjectSpent;
