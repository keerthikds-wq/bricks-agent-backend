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

    console.log('\n─── Reconcile is idempotent ─────────────────────────────────');
    const before2 = await LedgerEntry.countDocuments({ project_id: project._id, is_delete: 0 });
    await api.post(`${P}/ledger/reconcile`).set(auth(B)).send({});
    await api.post(`${P}/ledger/reconcile`).set(auth(B)).send({});
    const after2 = await LedgerEntry.countDocuments({ project_id: project._id, is_delete: 0 });
    eq('running reconcile twice adds nothing', after2, before2);

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
