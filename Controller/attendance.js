const Worker = require("../Model/Worker");
const Attendance = require("../Model/Attendance");
const WageRate = require("../Model/WageRate");
const LedgerEntry = require("../Model/LedgerEntry");
const money = require("../Utils/money");
const { callerId } = require("../Middleware/projectAccess");

const ok = (res, data, s = 200) => res.status(s).json({ success: true, data });
const fail = (res, s, message) => res.status(s).json({ success: false, message });

const startOfDay = (d) => {
    const x = d ? new Date(d) : new Date();
    x.setHours(0, 0, 0, 0);
    return x;
};

/**
 * Attendance — named people, and what their day costs.
 *
 * ── The double-count rule ────────────────────────────────────────────────────
 *
 * There are now two ways to record labour on a day: the daily log's headcounts
 * ("mason × 4") and this, per person. Both accrue wages, so naively both would
 * post to the ledger and the builder would be charged twice for one day's work.
 *
 * The rule is that ATTENDANCE WINS. Where a project has attendance for a date,
 * the daily log's labour rows do not accrue for that date. Attendance is
 * strictly more information — it knows who, and can carry per-person rates — so
 * the more precise record is the one that counts.
 *
 * Both ledger entries are keyed by (source, source_ref) and posted through the
 * same idempotent mirror, so switching a date from counts to attendance
 * replaces the entry rather than adding to it.
 */

/** The rate for one worker on one date, in paise, or null when unknown. */
async function rateForWorker(worker, builderId, onDate) {
    if (worker.daily_rate !== null && worker.daily_rate !== undefined) {
        return {
            paise: money.toPaise(worker.daily_rate),
            standardHours: 8,
            overtimeMultiplier: 1,
        };
    }
    const wr = await WageRate.rateFor(builderId, worker.trade, onDate);
    if (!wr) return null;
    return {
        paise: money.toPaise(wr.daily_rate),
        standardHours: wr.standard_hours || 8,
        overtimeMultiplier: wr.overtime_multiplier || 1,
    };
}

/**
 * What one marked day costs, in exact paise.
 *
 * Rounded once, after the pro-rata and the overtime premium — the same rule the
 * headcount path uses, so the two roads to a wage figure cannot disagree by a
 * rounding step.
 */
function costOf({ status, hours, overtimeHours, rate }) {
    if (status === "absent") return 0;

    const std = rate.standardHours;
    const worked = hours === null || hours === undefined
        ? (status === "half_day" ? std / 2 : std)
        : Number(hours);

    const normal = Math.min(worked, std);
    const over = Number(overtimeHours) || 0;

    const normalPaise = money.scale(rate.paise, normal, std);
    const overPaise = over > 0
        ? money.scale(rate.paise, over * rate.overtimeMultiplier, std)
        : 0;

    return normalPaise + overPaise;
}

/**
 * Re-posts the wage entry for one project-day from its attendance.
 *
 * Derived from the stored per-record amounts rather than recomputed from rates,
 * so the ledger total always equals the sum of the sheet a builder can read.
 */
async function accrueAttendanceFor(projectId, builderId, date, userId) {
    const day = startOfDay(date);
    const next = new Date(day.getTime() + 864e5);

    const rows = await Attendance.find({
        project_id: projectId,
        date: { $gte: day, $lt: next },
        is_delete: 0,
    }).lean();

    const total = money.sum(rows.map((r) => r.amount_paise || 0));
    const presentCount = rows.filter((r) => r.status !== "absent").length;

    // Keyed on the day, not a source document — a day's wages are the sum of
    // one record per worker, so there is no single doc to point at. See the
    // partial unique index on LedgerEntry.
    const key = {
        source: "attendance",
        project_id: projectId,
        occurred_on: day,
        is_delete: 0,
    };

    // Attendance supersedes the daily log's headcount wages for this date.
    // Without retiring the log's entry, a project that marked counts in the
    // morning and attendance in the evening would carry both.
    await LedgerEntry.updateMany(
        {
            project_id: projectId,
            source: "daily_log",
            category: "labour_wage",
            occurred_on: { $gte: day, $lt: next },
            is_delete: 0,
        },
        { $set: { is_delete: 1 } }
    );

    if (total <= 0) {
        // Everyone absent, or every rate missing. Remove any entry a previous
        // marking left behind rather than leaving a stale wage bill standing.
        await LedgerEntry.updateOne(key, { $set: { is_delete: 1 } });
        return { accrued_paise: 0, workers: presentCount };
    }

    await LedgerEntry.findOneAndUpdate(
        key,
        {
            $set: {
                builder_id: builderId,
                direction: "out",
                category: "labour_wage",
                amount_paise: total,
                amount: money.toRupees(total),
                status: "pending",
                description: `Attendance — ${presentCount} worker${presentCount === 1 ? "" : "s"}`,
                created_by: userId || null,
            },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return { accrued_paise: total, workers: presentCount };
}

/** Has this project got attendance on this date? Used to suppress log accrual. */
async function hasAttendance(projectId, date) {
    const day = startOfDay(date);
    const next = new Date(day.getTime() + 864e5);
    return (
        (await Attendance.countDocuments({
            project_id: projectId,
            date: { $gte: day, $lt: next },
            is_delete: 0,
        })) > 0
    );
}

/* ──────────────────────────────── Roster ─────────────────────────────────── */

/** GET /api/workers */
exports.listWorkers = async (req, res) => {
    try {
        const q = { builder_id: callerId(req), is_delete: 0 };
        if (req.query.active !== "all") q.active = true;
        if (req.query.trade) q.trade = String(req.query.trade).toLowerCase();

        const workers = await Worker.find(q).sort({ trade: 1, name: 1 }).lean();
        return ok(res, workers);
    } catch (err) {
        console.error("listWorkers error:", err);
        return fail(res, 500, "Server error");
    }
};

/** POST /api/workers */
exports.addWorker = async (req, res) => {
    try {
        const name = `${req.body.name || ""}`.trim();
        const trade = `${req.body.trade || ""}`.trim().toLowerCase();
        if (!name) return fail(res, 400, "The worker needs a name.");
        if (!trade) return fail(res, 400, "Which trade does this worker do?");

        // null when absent, so "no override" stays distinct from a real zero.
        const raw = req.body.daily_rate;
        const dailyRate =
            raw === undefined || raw === null || raw === ""
                ? null
                : Number(raw);
        if (dailyRate !== null && (!Number.isFinite(dailyRate) || dailyRate < 0)) {
            return fail(res, 400, "That daily rate is not a valid amount.");
        }

        const worker = await Worker.create({
            builder_id: callerId(req),
            name,
            trade,
            phone: `${req.body.phone || ""}`.trim(),
            daily_rate: dailyRate,
            project_ids: Array.isArray(req.body.project_ids) ? req.body.project_ids : [],
            notes: `${req.body.notes || ""}`.trim(),
        });

        return ok(res, worker, 201);
    } catch (err) {
        console.error("addWorker error:", err);
        return fail(res, 500, "Server error");
    }
};

/** PATCH /api/workers/:id */
exports.updateWorker = async (req, res) => {
    try {
        const set = {};
        for (const f of ["name", "phone", "notes"]) {
            if (req.body[f] !== undefined) set[f] = `${req.body[f]}`.trim();
        }
        if (req.body.trade !== undefined) {
            set.trade = `${req.body.trade}`.trim().toLowerCase();
        }
        if (req.body.active !== undefined) set.active = !!req.body.active;
        if (req.body.daily_rate !== undefined) {
            set.daily_rate =
                req.body.daily_rate === null || req.body.daily_rate === ""
                    ? null
                    : Number(req.body.daily_rate);
        }

        const worker = await Worker.findOneAndUpdate(
            { _id: req.params.id, builder_id: callerId(req), is_delete: 0 },
            { $set: set },
            { new: true }
        ).lean();

        if (!worker) return fail(res, 404, "Worker not found.");
        return ok(res, worker);
    } catch (err) {
        console.error("updateWorker error:", err);
        return fail(res, 500, "Server error");
    }
};

/** DELETE /api/workers/:id — soft, so past attendance keeps its name. */
exports.removeWorker = async (req, res) => {
    try {
        const r = await Worker.updateOne(
            { _id: req.params.id, builder_id: callerId(req), is_delete: 0 },
            { $set: { is_delete: 1, active: false } }
        );
        if (!r.matchedCount) return fail(res, 404, "Worker not found.");
        return ok(res, { removed: true });
    } catch (err) {
        console.error("removeWorker error:", err);
        return fail(res, 500, "Server error");
    }
};

/* ────────────────────────────── Attendance ───────────────────────────────── */

/** GET /api/projects/:pid/attendance?date=YYYY-MM-DD */
exports.getSheet = async (req, res) => {
    try {
        const project = req.project;
        const day = startOfDay(req.query.date);
        const next = new Date(day.getTime() + 864e5);

        const [marked, roster] = await Promise.all([
            Attendance.find({
                project_id: project._id,
                date: { $gte: day, $lt: next },
                is_delete: 0,
            }).lean(),
            Worker.find({
                builder_id: project.builder_id,
                is_delete: 0,
                active: true,
            }).sort({ trade: 1, name: 1 }).lean(),
        ]);

        const byWorker = new Map(marked.map((m) => [String(m.worker_id), m]));

        // Every active worker, with their mark if there is one. Returning only
        // the marked ones would mean the app had to fetch the roster separately
        // and join it, and would make "not yet marked" indistinguishable from
        // "not on the roster".
        const sheet = roster.map((w) => {
            const m = byWorker.get(String(w._id));
            return {
                worker_id: w._id,
                name: w.name,
                trade: w.trade,
                phone: w.phone,
                has_own_rate: w.daily_rate !== null && w.daily_rate !== undefined,
                marked: !!m,
                status: m ? m.status : null,
                hours: m ? m.hours : null,
                overtime_hours: m ? m.overtime_hours : 0,
                amount: m ? money.toRupees(m.amount_paise || 0) : null,
                amount_paise: m ? m.amount_paise || 0 : null,
            };
        });

        const total = money.sum(marked.map((m) => m.amount_paise || 0));

        return ok(res, {
            project_id: project._id,
            date: day,
            sheet,
            present: marked.filter((m) => m.status === "present").length,
            half_day: marked.filter((m) => m.status === "half_day").length,
            absent: marked.filter((m) => m.status === "absent").length,
            unmarked: sheet.filter((s) => !s.marked).length,
            total: money.toRupees(total),
            total_paise: total,
        });
    } catch (err) {
        console.error("getSheet error:", err);
        return fail(res, 500, "Server error");
    }
};

/**
 * POST /api/projects/:pid/attendance
 * { date, entries: [{ worker_id, status, hours, overtime_hours }] }
 *
 * Marks a whole day at once. A supervisor marks a crew, not a person, and one
 * request per worker over a patchy site connection is how half a day ends up
 * recorded.
 */
exports.markSheet = async (req, res) => {
    try {
        const project = req.project;
        const day = startOfDay(req.body.date);
        const entries = Array.isArray(req.body.entries) ? req.body.entries : [];

        if (!entries.length) return fail(res, 400, "No attendance to record.");
        if (day > startOfDay(new Date())) {
            // Marking the future is always a mistake — usually a mis-set device
            // clock — and it would accrue wages for work nobody has done.
            return fail(res, 400, "You cannot mark attendance for a future date.");
        }

        const ids = entries.map((e) => e.worker_id).filter(Boolean);
        const workers = await Worker.find({
            _id: { $in: ids },
            builder_id: project.builder_id,
            is_delete: 0,
        }).lean();
        const byId = new Map(workers.map((w) => [String(w._id), w]));

        const missingRates = [];
        const saved = [];

        for (const e of entries) {
            const worker = byId.get(String(e.worker_id));
            // Silently skipping an unknown id would let a typo delete nobody
            // and report success; it is reported instead.
            if (!worker) continue;

            const status = ["present", "half_day", "absent"].includes(e.status)
                ? e.status
                : "present";

            let amount = 0;
            if (status !== "absent") {
                const rate = await rateForWorker(worker, project.builder_id, day);
                if (!rate) {
                    // Recorded anyway, costed at zero, and reported. Refusing
                    // the mark would lose the fact that the person was there,
                    // which is worth more than the wage figure.
                    missingRates.push(worker.trade);
                } else {
                    amount = costOf({
                        status,
                        hours: e.hours,
                        overtimeHours: e.overtime_hours,
                        rate,
                    });
                }
            }

            const doc = await Attendance.findOneAndUpdate(
                { project_id: project._id, worker_id: worker._id, date: day, is_delete: 0 },
                {
                    $set: {
                        project_id: project._id,
                        builder_id: project.builder_id,
                        worker_id: worker._id,
                        date: day,
                        status,
                        hours: e.hours === undefined || e.hours === null ? null : Number(e.hours),
                        overtime_hours: Number(e.overtime_hours) || 0,
                        amount_paise: amount,
                        marked_by: callerId(req),
                        is_delete: 0,
                    },
                },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            ).lean();

            saved.push(doc);
        }

        const accrual = await accrueAttendanceFor(
            project._id, project.builder_id, day, callerId(req));

        return ok(res, {
            date: day,
            marked: saved.length,
            accrued: money.toRupees(accrual.accrued_paise),
            accrued_paise: accrual.accrued_paise,
            missing_rates: [...new Set(missingRates)],
        }, 201);
    } catch (err) {
        console.error("markSheet error:", err);
        return fail(res, 500, "Server error");
    }
};

/**
 * GET /api/projects/:pid/attendance/summary?days=30
 *
 * Per worker: days present, and what they have earned over the window.
 */
exports.summary = async (req, res) => {
    try {
        const project = req.project;
        const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 180);
        const from = startOfDay(new Date(Date.now() - (days - 1) * 864e5));

        const rows = await Attendance.find({
            project_id: project._id,
            date: { $gte: from },
            is_delete: 0,
        }).lean();

        const workers = await Worker.find({
            _id: { $in: [...new Set(rows.map((r) => String(r.worker_id)))] },
        }).lean();
        const byId = new Map(workers.map((w) => [String(w._id), w]));

        const acc = new Map();
        for (const r of rows) {
            const k = String(r.worker_id);
            const cur = acc.get(k) || {
                worker_id: r.worker_id,
                name: byId.get(k)?.name || "Unknown",
                trade: byId.get(k)?.trade || "",
                present: 0, half_day: 0, absent: 0, paise: 0,
            };
            if (r.status === "present") cur.present++;
            else if (r.status === "half_day") cur.half_day++;
            else cur.absent++;
            cur.paise += r.amount_paise || 0;
            acc.set(k, cur);
        }

        const people = [...acc.values()]
            .map((p) => ({
                ...p,
                // Half days count as half a day worked, which is what the word
                // means and what the wage was calculated on.
                days_worked: p.present + p.half_day / 2,
                earned: money.toRupees(p.paise),
                earned_paise: p.paise,
            }))
            .sort((a, b) => b.paise - a.paise);

        const total = money.sum(people.map((p) => p.paise));

        return ok(res, {
            project_id: project._id,
            days,
            from,
            people,
            total: money.toRupees(total),
            total_paise: total,
        });
    } catch (err) {
        console.error("attendance summary error:", err);
        return fail(res, 500, "Server error");
    }
};

module.exports.hasAttendance = hasAttendance;
module.exports.accrueAttendanceFor = accrueAttendanceFor;
