/**
 * Ledger tests — arithmetic, not status codes.
 *
 * A money endpoint that returns 200 while computing the wrong balance is worse
 * than one that fails, so these assert the actual figures: that a receivable is
 * not counted as received, that wages accrue at the configured rate, that
 * mirroring is idempotent, and that field staff cannot read the position.
 *
 * Run with:  node tests/ledger.test.js
 */
const path = require('path');
const REPO = path.join(__dirname, '..');

const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

let pass = 0, fail = 0;
const failures = [];
const ok = (n, extra = '') => { pass++; console.log(`  PASS  ${n}${extra ? '  ' + extra : ''}`); };
const bad = (n, d) => { fail++; failures.push([n, d]); console.log(`  FAIL  ${n}\n          → ${d}`); };
const check = (n, c, d = '') => (c ? ok(n) : bad(n, d));
const eq = (n, actual, expected) =>
    check(`${n} = ${expected}`, actual === expected, `got ${actual}, expected ${expected}`);

(async () => {
    const mongo = await MongoMemoryServer.create();
    process.env.URL = mongo.getUri();
    process.env.SECRET = 'ledger_secret';
    process.env.SESSION_SECRET = 'ledger_session';
    process.env.NODE_ENV = 'test';
    process.env.ALLOWED_ORIGINS = '';

    await mongoose.connect(process.env.URL);
    const { app } = require(path.join(REPO, 'index.js'));

    const User = require(path.join(REPO, 'Model/User'));
    const Project = require(path.join(REPO, 'Model/Project'));
    const LedgerEntry = require(path.join(REPO, 'Model/LedgerEntry'));
    const WageRate = require(path.join(REPO, 'Model/WageRate'));

    await new Promise((r) => setTimeout(r, 1200));

    const builder = await User.create({
        name: 'Ravi Builder', phone: '9100000001', pincode: '500001',
        role: 'builder', plan: 'pro', trial_started_at: new Date(),
    });
    const client = await User.create({
        name: 'Sita Owner', phone: '9100000002', pincode: '500001', role: 'client',
    });
    const staff = await User.create({
        name: 'Kumar Engg', phone: '9100000003', pincode: '500001',
        role: 'field_staff', staff_type: 'site_engineer',
    });

    const project = await Project.create({
        builder_id: builder._id, client_id: client._id, client_phone: client.phone,
        name: 'Ledger Test Villa', address: 'Site', area_sqft: 2000, floors: 2,
        budget: 1000000,
    });
    const ProjectMember = require(path.join(REPO, 'Model/ProjectMember'));
    // Built through defaultCapabilities(), the way acceptInvite does it. Setting
    // the fields by hand here silently left can_log_progress false, and the
    // daily-log route is capability-gated — so the fixture, not the app, was
    // what rejected the site engineer.
    await ProjectMember.create({
        project_id: project._id, user_id: staff._id, role: 'field_staff',
        staff_type: 'site_engineer', status: 'active',
        ...ProjectMember.defaultCapabilities('field_staff', 'site_engineer'),
    });

    const tok = (u) => jwt.sign(
        { id: u._id.toString(), phone: u.phone, isUser: true },
        process.env.SECRET, { expiresIn: '1d' });
    const B = tok(builder), C = tok(client), S = tok(staff);
    const api = request(app);
    const auth = (t) => ({ Authorization: `Bearer ${t}` });
    const P = `/api/projects/${project._id}`;

    console.log('\nLedger tests\n' + '='.repeat(60));

    // ── Direction and status semantics ──────────────────────────────────────
    console.log('\n─── A receivable is not revenue ─────────────────────────────');
    const bill = await api.post(`${P}/ledger`).set(auth(B)).send({
        direction: 'in', category: 'client_payment', amount: 300000,
        description: 'Foundation stage', status: 'pending',
        occurred_on: new Date().toISOString(),
    });
    check('records a pending receivable', bill.status === 201, `got ${bill.status} ${JSON.stringify(bill.body).slice(0, 120)}`);

    let sum = (await api.get(`${P}/ledger/summary`).set(auth(B))).body.data;
    eq('receivable', sum.receivable, 300000);
    eq('received (nothing has arrived yet)', sum.received, 0);
    eq('net_position', sum.net_position, 0);

    console.log('\n─── Settling moves it from owed to received ─────────────────');
    await api.patch(`${P}/ledger/${bill.body.data._id}/settle`).set(auth(B))
        .send({ payment_mode: 'upi', reference_no: 'UTR123' });
    sum = (await api.get(`${P}/ledger/summary`).set(auth(B))).body.data;
    eq('receivable after settling', sum.receivable, 0);
    eq('received after settling', sum.received, 300000);
    eq('net_position after settling', sum.net_position, 300000);

    console.log('\n─── Money out: a supplier bill ──────────────────────────────');
    const matBill = await api.post(`${P}/ledger`).set(auth(B)).send({
        direction: 'out', category: 'material_bill',
        party_name: 'Sri Cement Depot',
        line_items: [
            { name: 'OPC cement', qty: 100, unit: 'bag', rate: 400 },
            { name: 'River sand', qty: 2, unit: 'trip', rate: 9000 },
        ],
        occurred_on: new Date().toISOString(),
    });
    eq('line items set the amount (100×400 + 2×9000)', matBill.body.data?.amount, 58000);

    sum = (await api.get(`${P}/ledger/summary`).set(auth(B))).body.data;
    eq('payable', sum.payable, 58000);
    eq('paid (bill not settled yet)', sum.paid, 0);
    eq('committed cost includes the unpaid bill', sum.committed, 58000);
    eq('budget remaining', sum.budget_remaining, 1000000 - 58000);

    console.log('\n─── An amount is required when there are no line items ──────');
    const bogus = await api.post(`${P}/ledger`).set(auth(B))
        .send({ direction: 'out', category: 'expense' });
    check('rejects an entry with no amount (400, not 500)',
        bogus.status === 400, `got ${bogus.status} — money endpoints must not 500 on bad input`);

    // ── Wages ───────────────────────────────────────────────────────────────
    console.log('\n─── Wages accrue from the daily log ─────────────────────────');
    await WageRate.create({ builder_id: builder._id, trade: 'mason', daily_rate: 900, standard_hours: 8 });
    await WageRate.create({ builder_id: builder._id, trade: 'helper', daily_rate: 600, standard_hours: 8 });

    const log = await api.post(`${P}/daily-logs`).set(auth(S)).send({
        log_date: new Date().toISOString(), weather: 'clear',
        labour: [
            { trade: 'mason', count: 4, hours: 8 },
            { trade: 'helper', count: 3, hours: 8 },
        ],
        work_done: 'Brickwork', issues: '',
    });
    check('field staff can post a log', log.status === 201, `got ${log.status}`);
    // 4×900 + 3×600 = 3600 + 1800
    eq('wages accrued at the configured rates', log.body.data?.wages?.accrued, 5400);

    sum = (await api.get(`${P}/ledger/summary`).set(auth(B))).body.data;
    eq('wages_due', sum.wages_due, 5400);
    eq('payable now includes wages', sum.payable, 58000 + 5400);

    // Regression: a rate created through the API, priced against a log posted
    // the same day. The earlier fixtures created WageRate directly and inherited
    // the schema default of epoch, so they could never catch this — the live
    // server accrued zero because effective_from carried the wall clock and the
    // log had been normalised to midnight.
    console.log('\n─── A rate set today prices today\'s log ─────────────────────');
    const p3 = await Project.create({
        builder_id: builder._id, name: 'Same Day Site', address: 'S',
        area_sqft: 100, floors: 1, budget: 500000,
    });
    const rateRes = await api.post('/api/wage-rates').set(auth(B))
        .send({ trade: 'painter', daily_rate: '750', standard_hours: 8 });
    check('rate created through the API', rateRes.status === 201, `got ${rateRes.status}`);

    const sameDay = await api.post(`/api/projects/${p3._id}/daily-logs`).set(auth(B)).send({
        log_date: new Date().toISOString(),
        labour: [{ trade: 'painter', count: 2, hours: 8 }],
        work_done: 'Painting',
    });
    eq('today\'s log prices against a rate set today (2 x 750)',
        sameDay.body.data?.wages?.accrued_paise, 150000);
    check('and the trade is not reported as missing a rate',
        (sameDay.body.data?.wages?.missing_rates || []).isEmpty !== false &&
            (sameDay.body.data?.wages?.missing_rates || []).length === 0,
        `got ${JSON.stringify(sameDay.body.data?.wages?.missing_rates)}`);

    console.log('\n─── A trade with no rate is reported, not valued at zero ────');
    const log2 = await api.post(`${P}/daily-logs`).set(auth(B)).send({
        log_date: new Date(Date.now() - 864e5).toISOString(),
        labour: [{ trade: 'crane_operator', count: 1, hours: 8 }],
        work_done: 'Lifting',
    });
    check('names the trade with no configured rate',
        (log2.body.data?.wages?.missing_rates || []).includes('crane_operator'),
        `got ${JSON.stringify(log2.body.data?.wages)}`);

    console.log('\n─── An explicit rate overrides the default ──────────────────');
    const log3 = await api.post(`${P}/daily-logs`).set(auth(B)).send({
        log_date: new Date(Date.now() - 2 * 864e5).toISOString(),
        labour: [{ trade: 'mason', count: 2, hours: 8, rate: 1200 }],
        work_done: 'Overtime crew',
    });
    eq('uses the per-row rate (2×1200)', log3.body.data?.wages?.accrued, 2400);

    // ── Mirroring ───────────────────────────────────────────────────────────
    console.log('\n─── Stage payments mirror once, not twice ───────────────────');
    const stage = await api.post(`${P}/payments`).set(auth(B))
        .send({ amount: 200000, purpose: 'Slab stage', status: 'pending' });
    check('creates a stage payment', stage.status === 201, `got ${stage.status}`);

    let mirrors = await LedgerEntry.countDocuments({
        source: 'project_payment', source_ref: stage.body.data._id, is_delete: 0,
    });
    eq('exactly one mirrored entry', mirrors, 1);

    await api.patch(`${P}/payments/${stage.body.data._id}/mark-paid`).set(auth(B)).send({});
    mirrors = await LedgerEntry.countDocuments({
        source: 'project_payment', source_ref: stage.body.data._id, is_delete: 0,
    });
    eq('still one entry after marking paid (updated, not duplicated)', mirrors, 1);

    const mirrored = await LedgerEntry.findOne({ source_ref: stage.body.data._id });
    check('the mirror is now settled', mirrored?.status === 'settled', `got ${mirrored?.status}`);

    console.log('\n─── Client receipts are not counted as spending ─────────────');
    const proj = await Project.findById(project._id).lean();
    // Only the outgoing settled entries count. Nothing out has been settled yet.
    eq('project.spent excludes money received', proj.spent, 0);

    sum = (await api.get(`${P}/ledger/summary`).set(auth(B))).body.data;
    eq('received includes both stage payments', sum.received, 300000 + 200000);

    console.log('\n─── Settling a supplier bill is real spending ───────────────');
    await api.patch(`${P}/ledger/${matBill.body.data._id}/settle`).set(auth(B))
        .send({ payment_mode: 'bank_transfer' });
    const proj2 = await Project.findById(project._id).lean();
    eq('project.spent now reflects the paid bill', proj2.spent, 58000);
    sum = (await api.get(`${P}/ledger/summary`).set(auth(B))).body.data;
    eq('net_position = received − paid', sum.net_position, 500000 - 58000);

    console.log('\n─── Cancelled entries leave every total ─────────────────────');
    const junk = await api.post(`${P}/ledger`).set(auth(B))
        .send({ direction: 'out', category: 'expense', amount: 77777 });
    const before = (await api.get(`${P}/ledger/summary`).set(auth(B))).body.data.payable;
    await api.patch(`${P}/ledger/${junk.body.data._id}/cancel`).set(auth(B)).send({});
    const after = (await api.get(`${P}/ledger/summary`).set(auth(B))).body.data.payable;
    eq('payable drops back after cancelling', after, before - 77777);

    // ── Access control ──────────────────────────────────────────────────────
    console.log('\n─── Who can see the money ───────────────────────────────────');
    const staffPeek = await api.get(`${P}/ledger/summary`).set(auth(S));
    check('field staff cannot read the position (403)',
        staffPeek.status === 403, `got ${staffPeek.status} — LEAK: staff would see the commercials`);

    const staffWrite = await api.post(`${P}/ledger`).set(auth(S))
        .send({ direction: 'out', category: 'expense', amount: 100 });
    check('field staff cannot write entries (403)', staffWrite.status === 403, `got ${staffWrite.status}`);

    const clientRead = await api.get(`${P}/ledger/summary`).set(auth(C));
    check('client can see their own project position', clientRead.status === 200, `got ${clientRead.status}`);

    const clientWrite = await api.post(`${P}/ledger`).set(auth(C))
        .send({ direction: 'in', category: 'client_payment', amount: 1 });
    check('client cannot write entries (403)', clientWrite.status === 403, `got ${clientWrite.status}`);

    console.log('\n─── Wage rates are builder-only ─────────────────────────────');
    const staffRates = await api.get('/api/wage-rates').set(auth(S));
    check('field staff cannot read wage rates (403)', staffRates.status === 403, `got ${staffRates.status}`);
    const builderRates = await api.get('/api/wage-rates').set(auth(B));
    check('builder can read wage rates', builderRates.status === 200, `got ${builderRates.status}`);

    // ── Dashboard rollup ────────────────────────────────────────────────────
    console.log('\n─── The dashboard reports the position ──────────────────────');
    const dash = (await api.get('/api/projects/dashboard').set(auth(B))).body.data;
    for (const f of ['total_receivable', 'total_paid', 'total_received', 'outstanding', 'wages_due', 'net_position']) {
        check(`dashboard exposes ${f}`, dash[f] !== undefined, 'absent');
    }
    // Across every project the builder can see: 5400 + 2400 on the main site,
    // plus 1500 from the same-day-rate regression project.
    eq('dashboard wages_due sums every project', dash.wages_due, 5400 + 2400 + 1500);
    eq('dashboard total_paid matches', dash.total_paid, 58000);

    // ── Exactness end to end ────────────────────────────────────────────────
    console.log('\n─── Paise survive the round trip ────────────────────────────');
    const M = require(path.join(REPO, 'Utils/money'));

    // The eight bills whose float sum drifts. Booked through the API, the
    // aggregated total must be exact — this is the whole point of the ledger
    // storing paise.
    const drifty = ['1234.56', '8790.45', '233.33', '45678.91', '999.99', '12.15', '6543.21', '88.88'];
    const p2 = await Project.create({
        builder_id: builder._id, name: 'Exactness Site', address: 'S',
        area_sqft: 100, floors: 1, budget: 100000,
    });
    for (const amt of drifty) {
        const r = await api.post(`/api/projects/${p2._id}/ledger`).set(auth(B))
            .send({ direction: 'out', category: 'material_bill', amount: amt });
        if (r.status !== 201) bad(`booking ${amt}`, `got ${r.status} ${JSON.stringify(r.body).slice(0, 100)}`);
    }
    const s2 = (await api.get(`/api/projects/${p2._id}/ledger/summary`).set(auth(B))).body.data;
    eq('eight bills sum exactly (paise)', s2.payable_paise, 6358148);
    eq('and read back as rupees', s2.payable, 63581.48);
    check('the float sum would have been wrong',
        drifty.reduce((a, b) => a + Number(b), 0) !== 63581.48,
        'the chosen amounts no longer demonstrate float drift');

    console.log('\n─── Paise-level amounts are not silently rounded ────────────');
    const paisa = await api.post(`/api/projects/${p2._id}/ledger`).set(auth(B))
        .send({ direction: 'out', category: 'expense', amount: '0.07' });
    eq('7 paise is stored as 7 paise', paisa.body.data?.amount_paise, 7);

    const tooPrecise = await api.post(`/api/projects/${p2._id}/ledger`).set(auth(B))
        .send({ direction: 'out', category: 'expense', amount: 12.345 });
    check('a third decimal is refused with an explanation (400)',
        tooPrecise.status === 400 && /decimal/i.test(tooPrecise.body.message || ''),
        `got ${tooPrecise.status} ${tooPrecise.body.message}`);

    console.log('\n─── Line items reconcile in paise ───────────────────────────');
    const frac = await api.post(`/api/projects/${p2._id}/ledger`).set(auth(B)).send({
        direction: 'out', category: 'material_bill',
        line_items: [
            { name: 'Steel', qty: 2.5, unit: 'ton', rate: '4150.75' },
            { name: 'Binding wire', qty: 3, unit: 'kg', rate: '82.33' },
        ],
    });
    // 2.5 × 4150.75 = 10376.875 → 1037688 paise (half away from zero)
    // 3   ×   82.33 =   246.99  →   24699 paise
    eq('fractional quantity is exact to the paisa', frac.body.data?.line_items?.[0]?.amount_paise, 1037688);
    eq('second line exact', frac.body.data?.line_items?.[1]?.amount_paise, 24699);
    eq('bill total is the sum of its lines', frac.body.data?.amount_paise, 1037688 + 24699);

    // ── Finance overview ────────────────────────────────────────────────────
    console.log('\n─── Finance overview (the Finance screen) ───────────────────');
    const fin = await api.get('/api/finance/overview?months=6').set(auth(B));
    check('overview responds', fin.status === 200, `got ${fin.status}`);
    const F = fin.body.data;

    eq('series has one point per month', F?.series?.length, 6);
    check('empty months are still present',
        (F?.series || []).every((m) => m.income !== undefined && m.expense !== undefined),
        'a month came back without figures — dropping quiet months compresses time '
        + 'and makes a slow period look busy');

    // The three headline figures must agree with each other, which is the whole
    // reason they come from one request.
    eq('income matches the position', F?.position?.received, 500000);
    eq('expenses match the position', F?.position?.paid, 58000);
    eq('profit is income minus expenses',
        F?.position?.net_position, 500000 - 58000);

    check('top expenses sorted largest first',
        (F?.top_expenses || []).every((e, i, a) => i === 0 || a[i - 1].amount_paise >= e.amount_paise),
        'out of order');
    const shareSum = (F?.top_expenses || []).reduce((a, e) => a + e.share_pct, 0);
    check('shares add up to the outgoing total', shareSum >= 99 && shareSum <= 101,
        `shares summed to ${shareSum}`);

    const staffFin = await api.get('/api/finance/overview').set(auth(S));
    check('field staff cannot see finance (403)',
        staffFin.status === 403, `got ${staffFin.status} — LEAK`);

    // ── Assistant grounding ─────────────────────────────────────────────────
    //
    // The summary must be plain aggregation. If a language model ever gets
    // between these counts and the screen, this is the test that should fail.
    console.log('\n─── Assistant summary is real data ──────────────────────────');
    const asum = await api.get('/api/assistant/summary').set(auth(B));
    check('summary responds', asum.status === 200, `got ${asum.status}`);
    const A = asum.body.data;

    check('summary carries rows', Array.isArray(A?.rows) && A.rows.length > 0,
        'no rows returned');

    // Every figure must trace back to the ledger and project state.
    const ctx = A?.context;
    eq('context receivable matches the ledger', ctx?.receivable, 0);
    eq('context paid matches the ledger', ctx?.paid, 58000);
    check('context counts the builder\'s projects',
        (ctx?.projects_total || 0) >= 2,
        `got ${ctx?.projects_total}`);

    // The mockup has a "material deliveries" row. Nothing tracks deliveries, so
    // it must be absent rather than filled with a plausible number.
    check('no row is invented for data we do not have',
        !(A?.rows || []).some((r) => /deliver/i.test(r.value || '')),
        'a deliveries row appeared — nothing in the system tracks deliveries');

    const askEmpty = await api.post('/api/assistant/ask').set(auth(B)).send({});
    check('an empty question is refused (400)', askEmpty.status === 400,
        `got ${askEmpty.status}`);

    const askLong = await api.post('/api/assistant/ask').set(auth(B))
        .send({ question: 'x'.repeat(600) });
    check('an oversized question is refused (400)', askLong.status === 400,
        `got ${askLong.status}`);

    // ── Copilot suggestions ─────────────────────────────────────────────────
    //
    // These drive the inline Copilot, so they must be derived from real
    // conditions rather than generated. A suggestion the data cannot answer is
    // worse than no suggestion: the builder taps it and gets "I don't have
    // that", which teaches them the feature does not work.
    console.log('\n─── Copilot suggestions are grounded ────────────────────────');
    const sug = await api.get('/api/assistant/suggestions').set(auth(B));
    check('suggestions respond', sug.status === 200, `got ${sug.status}`);
    const SUG = sug.body.data?.suggestions || [];

    check('suggestions are never empty', SUG.length > 0,
        'a builder with nothing wrong still needs somewhere to start');
    check('suggestions stay a short list, not a menu', SUG.length <= 4,
        `got ${SUG.length}`);
    check('every suggestion carries the reason it is being offered',
        SUG.every((s) => s.question && s.why),
        'a suggestion arrived with no question or no reason');
    check('suggestions do not repeat',
        new Set(SUG.map((s) => s.question)).size === SUG.length,
        'the same question was offered twice');

    // This builder's outgoings are settled and nothing is receivable, so the
    // "who owes me money" prompt must NOT appear. Deriving them from the data
    // is the entire point — a generated list would offer it regardless.
    check('no money-owed prompt when nothing is owed',
        !SUG.some((s) => /owes me money/i.test(s.question)),
        'offered to chase payments that do not exist');

    // Scope: suggestions come from visibleProjectFilter, same as everything
    // else, so field staff get their own rather than the builder's position.
    const sugS = await api.get('/api/assistant/suggestions').set(auth(S));
    check('field staff get their own suggestions (200)', sugS.status === 200,
        `got ${sugS.status}`);

    // A project_id the caller cannot reach must be ignored, not honoured — it
    // is resolved through the caller's own filter, so scoping can only narrow.
    // The request must still be handled rather than throwing.
    const askForeign = await api.post('/api/assistant/ask').set(auth(S))
        .send({
            question: 'How is it going?',
            project_id: new mongoose.Types.ObjectId(),
        });
    check('an unreachable project_id is ignored, not fatal',
        askForeign.status !== 500,
        `got ${askForeign.status} — scoping should skip it, not throw`);

    // With no AI key configured in tests, ask must degrade to "unavailable"
    // rather than a bare 500. A builder cannot tell a provider outage from a
    // broken app, so the distinction has to survive to the response.
    const askDown = await api.post('/api/assistant/ask').set(auth(B))
        .send({ question: 'How is my business doing?' });
    check('an AI outage reads as unavailable, not as a server error',
        askDown.status !== 500,
        `got ${askDown.status} — a provider failure leaked as a 500`);

    // ── Attendance ──────────────────────────────────────────────────────────
    //
    // The thing worth testing here is not that a sheet saves. It is that a day
    // recorded two ways is charged once.
    console.log('\n─── Attendance: roster and wages ────────────────────────────');

    const w1 = await api.post('/api/workers').set(auth(B))
        .send({ name: 'Ramesh', trade: 'mason' });
    check('builder can add a worker', w1.status === 201, `got ${w1.status}`);

    const w2 = await api.post('/api/workers').set(auth(B))
        .send({ name: 'Suresh', trade: 'helper', daily_rate: 700 });
    check('a per-person rate override is accepted', w2.status === 201,
        `got ${w2.status}`);

    const staffRoster = await api.get('/api/workers').set(auth(S));
    check('field staff cannot read the roster (403)', staffRoster.status === 403,
        `got ${staffRoster.status} — per-person pay is commercial`);

    // A fresh project, so this day's wages are not tangled with the fixtures
    // already posted against `project`.
    const pA = await Project.create({
        builder_id: builder._id, name: 'Attendance Site', address: 'A',
        area_sqft: 900, floors: 1, budget: 800000,
    });
    const PA = `/api/projects/${pA._id}`;
    const today = new Date().toISOString();

    const sheet = await api.post(`${PA}/attendance`).set(auth(B)).send({
        date: today,
        entries: [
            { worker_id: w1.body.data._id, status: 'present' },       // mason 900
            { worker_id: w2.body.data._id, status: 'half_day' },      // 700 / 2
        ],
    });
    check('a day can be marked', sheet.status === 201, `got ${sheet.status}`);
    // 900 + 350. The override wins over the helper trade rate of 600.
    eq('wages use the per-person rate where set',
        sheet.body.data?.accrued_paise, 125000);

    // Re-marking must replace, not append. A supervisor on a bad connection
    // tapping Save twice is the common case, not the edge case.
    const again = await api.post(`${PA}/attendance`).set(auth(B)).send({
        date: today,
        entries: [
            { worker_id: w1.body.data._id, status: 'present' },
            { worker_id: w2.body.data._id, status: 'half_day' },
        ],
    });
    eq('re-marking the same day does not double the wages',
        again.body.data?.accrued_paise, 125000);

    const wageEntries = await LedgerEntry.countDocuments({
        project_id: pA._id, category: 'labour_wage', is_delete: 0,
    });
    eq('and leaves exactly one wage entry for the day', wageEntries, 1);

    // THE double-count rule: a daily log posted for a date that already has
    // attendance must not accrue a second wage bill.
    const dupLog = await api.post(`${PA}/daily-logs`).set(auth(B)).send({
        log_date: today,
        labour: [{ trade: 'mason', count: 10, hours: 8 }],
        work_done: 'Same day, counted twice',
    });
    check('the log still posts', dupLog.status === 201, `got ${dupLog.status}`);
    eq('but accrues nothing, because attendance already priced the day',
        dupLog.body.data?.wages?.accrued_paise, 0);
    eq('and says why', dupLog.body.data?.wages?.superseded_by, 'attendance');

    const stillOne = await LedgerEntry.countDocuments({
        project_id: pA._id, category: 'labour_wage', is_delete: 0,
    });
    eq('the day is still charged exactly once', stillOne, 1);

    // Absent is a fact, not a gap.
    const absentDay = new Date(Date.now() - 864e5).toISOString();
    const abs = await api.post(`${PA}/attendance`).set(auth(B)).send({
        date: absentDay,
        entries: [{ worker_id: w1.body.data._id, status: 'absent' }],
    });
    eq('an absent day costs nothing', abs.body.data?.accrued_paise, 0);

    const future = await api.post(`${PA}/attendance`).set(auth(B)).send({
        date: new Date(Date.now() + 3 * 864e5).toISOString(),
        entries: [{ worker_id: w1.body.data._id, status: 'present' }],
    });
    check('attendance cannot be marked for the future (400)',
        future.status === 400, `got ${future.status}`);

    const sheetGet = await api.get(`${PA}/attendance`).set(auth(B))
        .query({ date: today });
    check('the sheet lists every active worker, marked or not',
        (sheetGet.body.data?.sheet || []).length >= 2,
        `got ${(sheetGet.body.data?.sheet || []).length}`);
    eq('and totals the day', sheetGet.body.data?.total_paise, 125000);

    const summ = await api.get(`${PA}/attendance/summary`).set(auth(B));
    check('per-worker summary responds', summ.status === 200, `got ${summ.status}`);
    check('half days count as half a day worked',
        (summ.body.data?.people || []).some((p) => p.days_worked === 0.5),
        `got ${JSON.stringify((summ.body.data?.people || []).map((p) => p.days_worked))}`);

    const summStaff = await api.get(`${PA}/attendance/summary`).set(auth(S));
    check('field staff cannot read the payroll summary (403)',
        summStaff.status === 403, `got ${summStaff.status} — it names earnings`);

    // ── Cash flow ───────────────────────────────────────────────────────────
    console.log('\n─── Cash flow forecasts from due dates ──────────────────────');

    // Baseline first. Cash flow spans every project the builder can see, and
    // earlier fixtures already left undated pending bills on other sites — so
    // absolute totals here would assert the fixtures, not the forecast.
    const cfBase = (await api.get('/api/finance/cashflow').set(auth(B))
        .query({ weeks: 8 })).body.data;

    const inTwoWeeks = new Date(Date.now() + 14 * 864e5).toISOString();
    await api.post(`${PA}/ledger`).set(auth(B)).send({
        direction: 'in', category: 'client_payment', amount: 500000,
        status: 'pending', due_date: inTwoWeeks,
        occurred_on: new Date().toISOString(),
    });
    // No due date — real money, no committed date.
    await api.post(`${PA}/ledger`).set(auth(B)).send({
        direction: 'out', category: 'material_bill', amount: 120000,
        status: 'pending', occurred_on: new Date().toISOString(),
    });
    // Already late.
    await api.post(`${PA}/ledger`).set(auth(B)).send({
        direction: 'out', category: 'transport', amount: 40000,
        status: 'pending', due_date: new Date(Date.now() - 10 * 864e5).toISOString(),
        occurred_on: new Date(Date.now() - 20 * 864e5).toISOString(),
    });

    const cf = await api.get('/api/finance/cashflow').set(auth(B)).query({ weeks: 8 });
    check('cash flow responds', cf.status === 200, `got ${cf.status}`);
    const CF = cf.body.data;
    eq('one bucket per week of the horizon', (CF?.series || []).length, 8);
    // Compared in paise, not rupees.
    //
    // Subtracting the rupee doubles gave 120000.00000000001 — the exact float
    // drift this codebase carries integer paise to avoid. A test that reaches
    // for the display field instead of the authoritative one is reintroducing
    // the bug it is meant to guard.
    eq('an amount due in a fortnight lands in week 2',
        (CF?.series?.[2]?.in_paise || 0) - (cfBase?.series?.[2]?.in_paise || 0),
        50000000);
    eq('money already past due is reported as overdue, not forecast',
        (CF?.overdue?.outgoing_paise || 0) - (cfBase?.overdue?.outgoing_paise || 0),
        4000000);
    eq('and a bill with no due date is unscheduled, not assumed to be today',
        (CF?.unscheduled?.outgoing_paise || 0) - (cfBase?.unscheduled?.outgoing_paise || 0),
        12000000);
    eq('the undated bill never reaches a forecast bucket',
        (CF?.series?.[0]?.out_paise || 0) - (cfBase?.series?.[0]?.out_paise || 0), 0);

    const cfStaff = await api.get('/api/finance/cashflow').set(auth(S));
    check('field staff cannot see the cash forecast (403)',
        cfStaff.status === 403, `got ${cfStaff.status}`);

    // ── Invoice ─────────────────────────────────────────────────────────────
    console.log('\n─── Invoice is derived from the ledger ──────────────────────');
    const inv = await api.get(`${P}/invoice`).set(auth(B));
    check('invoice responds', inv.status === 200, `got ${inv.status}`);
    const INV = inv.body.data;

    check('only client-facing money appears',
        (INV?.lines || []).length > 0, 'no lines');
    const derived = (INV?.lines || []).reduce((s, l) => s + l.amount_paise, 0);
    eq('the total equals the sum of its lines', INV?.billed_paise, derived);
    eq('balance is billed minus received',
        INV?.balance_paise, (INV?.billed_paise || 0) - (INV?.received_paise || 0));
    check('no supplier bill leaks onto the client statement',
        !(INV?.lines || []).some((l) => /material|transport|wage/i.test(l.description || '')),
        `got ${JSON.stringify((INV?.lines || []).map((l) => l.description))}`);

    const invStaff = await api.get(`${P}/invoice`).set(auth(S));
    check('field staff cannot pull the client invoice (403)',
        invStaff.status === 403, `got ${invStaff.status}`);

    // ── Material market intelligence ────────────────────────────────────────
    //
    // The point is not that it returns prices. It is that it compares the
    // market to what THIS builder actually pays, and never substitutes one for
    // the other.
    console.log('\n─── Materials: my rate vs the market ────────────────────────');
    const PriceTrend = require(path.join(REPO, 'Model/PriceTrend'));

    // plywood, because earlier fixtures in this file already buy cement, steel
    // and sand — asserting on those would be asserting on the fixtures.
    await PriceTrend.create({
        material: 'plywood', price: 100, unit: 'per sheet',
        recorded_at: new Date(Date.now() - 60 * 864e5),
    });
    await PriceTrend.create({
        material: 'plywood', price: 110, unit: 'per sheet',
        recorded_at: new Date(),
    });
    // Tracked by the market, never bought by this builder.
    await PriceTrend.create({
        material: 'paint', price: 250, unit: 'per litre', recorded_at: new Date(),
    });
    // Priced per kg by the market, bought per bundle by the builder.
    await PriceTrend.create({
        material: 'tmt_bars', price: 52, unit: 'per kg', recorded_at: new Date(),
    });

    await api.post(`${PA}/ledger`).set(auth(B)).send({
        direction: 'out', category: 'material_bill', status: 'settled',
        occurred_on: new Date().toISOString(),
        description: 'Site materials',
        line_items: [
            // 50 sheets at 121 — above the 110 market, same unit.
            { name: 'Plywood 12mm board', qty: 50, unit: 'sheet', rate: '121.00' },
            // Bundles against a per-kg market price: not comparable.
            { name: 'TMT bars 12mm', qty: 4, unit: 'bundle', rate: '4150.00' },
        ],
    });

    const mi = await api.get('/api/materials/intelligence').set(auth(B))
        .query({ days: 90 });
    check('materials intelligence responds', mi.status === 200, `got ${mi.status}`);
    const MI = mi.body.data;
    const ply = (MI?.materials || []).find((m) => m.material === 'plywood');

    check('a free-text bill line is matched to its material',
        !!ply && ply.bill_lines === 1, `got ${JSON.stringify(ply)}`);
    eq('my rate is what I actually paid, not the market rate',
        ply?.my_rate_paise, 12100);
    eq('market price is tracked separately', ply?.market_paise, 11000);
    // Movement is computed, but not asserted to an exact figure: the app seeds
    // its own price history on boot, so the earliest point in the window is not
    // necessarily the one this test inserted. Asserting 10% here would be
    // asserting the seeder.
    check('market movement is computed over the window',
        typeof ply?.change_pct === 'number',
        `got ${ply?.change_pct}`);
    eq('and the variance says I am paying over the odds',
        ply?.variance_pct, 10);                                   // 121 vs 110
    check('overpayment is surfaced as a headline',
        (MI?.overpaying || []).some((m) => m.material === 'plywood'),
        `got ${JSON.stringify(MI?.overpaying)}`);

    // The rule that matters most: a material the builder has never itemised
    // must report null, not the market price dressed up as their own.
    const paint = (MI?.materials || []).find((m) => m.material === 'paint');
    check('a never-purchased material reports no rate of my own',
        !!paint && paint.my_rate_paise === null,
        `got ${JSON.stringify(paint)}`);
    check('and says why rather than leaving a bare null',
        (paint?.note || '').length > 0, `got "${paint?.note}"`);
    check('its variance is null, not zero',
        paint?.variance_pct === null, `got ${paint?.variance_pct}`);

    // Regression: without a unit check this reported the builder as 7882% over
    // market, because ₹4,150 per bundle was divided by ₹52 per kg. A confident
    // wrong number on the headline would have sunk trust in the whole screen.
    const tmt = (MI?.materials || []).find((m) => m.material === 'tmt_bars');
    check('rates in different units are not compared',
        !!tmt && tmt.variance_pct === null,
        `got ${JSON.stringify(tmt)}`);
    check('and the reason names both units',
        /bundle/.test(tmt?.note || '') && /kg/.test(tmt?.note || ''),
        `got "${tmt?.note}"`);
    check('an incomparable material never reaches the overpaying headline',
        !(MI?.overpaying || []).some((m) => m.material === 'tmt_bars'),
        `got ${JSON.stringify(MI?.overpaying)}`);

    console.log('\n─── Reconcile is idempotent ─────────────────────────────────');
    const before2 = await LedgerEntry.countDocuments({ project_id: project._id, is_delete: 0 });
    await api.post(`${P}/ledger/reconcile`).set(auth(B)).send({});
    await api.post(`${P}/ledger/reconcile`).set(auth(B)).send({});
    const after2 = await LedgerEntry.countDocuments({ project_id: project._id, is_delete: 0 });
    eq('running reconcile twice adds nothing', after2, before2);

    // ── What the owner is allowed to see ────────────────────────────────────
    //
    // The product depends on builders being willing to hand their clients a
    // login. They will not, if the client can read what was paid for cement and
    // subtract it from the contract to get the margin. So the owner's view is
    // the SHARED ledger — contract value, what they have paid, what is being
    // asked for next — and nothing about the builder's costs.
    console.log('\n─── The owner sees the contract, not the cost sheet ─────────');

    const cSum = (await api.get(`${P}/ledger/summary`).set(auth(C))).body.data;
    for (const leak of ['paid', 'payable', 'wages_due', 'by_category',
                        'by_category_paise', 'committed', 'net_position']) {
        check(`summary withholds "${leak}"`, cSum[leak] === undefined,
            `got ${JSON.stringify(cSum[leak])}`);
    }
    check('summary still answers what they have paid',
        typeof cSum.paid_by_me === 'number', `got ${JSON.stringify(cSum)}`);
    check('summary still answers what is being asked for',
        typeof cSum.due_from_me === 'number', `got ${JSON.stringify(cSum)}`);
    eq('and states the contract value', cSum.contract_value, 1000000);

    const bSum = (await api.get(`${P}/ledger/summary`).set(auth(B))).body.data;
    check('the builder still sees their own costs',
        typeof bSum.paid === 'number' && bSum.by_category !== undefined,
        `got ${JSON.stringify(bSum).slice(0, 160)}`);

    const cRows = (await api.get(`${P}/ledger`).set(auth(C))).body.data || [];
    check('the entry list hands the owner no outgoing rows',
        cRows.every((r) => r.direction === 'in'),
        `got ${cRows.filter((r) => r.direction !== 'in').length} "out" rows`);
    check('and there is something left to show them', cRows.length > 0);

    // The filter is applied after the query string is read, so asking for the
    // supplier bills by name must not produce them either.
    const cForced = (await api.get(`${P}/ledger?direction=out`).set(auth(C))).body.data || [];
    check('asking for direction=out does not step around it',
        cForced.every((r) => r.direction === 'in'),
        `got ${cForced.filter((r) => r.direction !== 'in').length} "out" rows`);

    const bRows = (await api.get(`${P}/ledger?direction=out`).set(auth(B))).body.data || [];
    check('the builder can still list their own bills', bRows.length > 0,
        `got ${bRows.length}`);

    console.log('\n' + '='.repeat(60));
    console.log(`  ${pass} passed, ${fail} failed`);
    if (fail) {
        console.log('\n  FAILURES:');
        failures.forEach(([n, d]) => console.log(`   • ${n}\n     ${d}`));
    }

    await mongoose.disconnect();
    await mongo.stop();
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
