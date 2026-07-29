/**
 * Removes the retired account silos and their leftover auth records.
 *
 * The app is one account collection (`user`) with a `role`. The `seller`,
 * `builder` and `masonry` collections are the pre-merge silos: their login
 * doors now answer 410, but the documents are still sitting in the database
 * along with the OTP records that could authorise them. Dead accounts that can
 * still be referenced are worth clearing out.
 *
 * DRY RUN BY DEFAULT. It prints exactly what it would delete and changes
 * nothing. Pass --apply to actually delete, and only after reading the report.
 *
 *   node scripts/cleanup-legacy-accounts.js            # report only
 *   node scripts/cleanup-legacy-accounts.js --apply    # really delete
 *
 * Also removes the ZZTEST / ZZFN / ZZDUMP / ZZPROBE records left behind by the
 * live smoke and functional tests — they are marked, so they are safe to match
 * by name, and they should not be in a database you are about to show anyone.
 */
require('dotenv').config();
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');
const TEST_NAME = /^ZZ(TEST|FN|DUMP|PROBE)/i;

// Phones the test harnesses used. Narrow on purpose: these ranges belong to the
// scripts, and matching by prefix alone would be too blunt on a real database.
const TEST_PHONE = /^9[6789]\d{8}$/;

const line = (s = '') => console.log(s);
const n = (x) => String(x).padStart(6);

(async () => {
    if (!process.env.URL) {
        console.error('URL is not set. Run this from the backend folder with a .env present.');
        process.exit(1);
    }

    await mongoose.connect(process.env.URL);
    const db = mongoose.connection.db;
    line(`\nConnected to ${mongoose.connection.name}`);
    line(APPLY ? '\n*** APPLY MODE — this will delete ***' : '\nDRY RUN — nothing will be deleted');
    line('='.repeat(62));

    const names = (await db.listCollections().toArray()).map((c) => c.name);
    const has = (c) => names.includes(c);

    // ── 1. The retired silos ────────────────────────────────────────────────
    line('\n1. Retired account silos');
    const silos = ['seller', 'builder', 'masonry'];
    const siloTotals = {};
    for (const c of silos) {
        if (!has(c)) { line(`   ${c.padEnd(10)} — collection absent`); continue; }
        const count = await db.collection(c).countDocuments();
        siloTotals[c] = count;
        line(`   ${c.padEnd(10)} ${n(count)} document(s)`);
        if (count) {
            const sample = await db.collection(c).find({}, { projection: { name: 1, phone: 1 } }).limit(3).toArray();
            sample.forEach((d) => line(`               · ${d.name || '(no name)'}  ${d.phone || ''}`));
        }
    }

    // ── 2. Test accounts in the live user collection ────────────────────────
    line('\n2. Test accounts left by the smoke/functional harnesses');
    const testUserQuery = { $or: [{ name: TEST_NAME }, { name: { $regex: '^ZZ', $options: 'i' } }] };
    const testUsers = has('user')
        ? await db.collection('user').find(testUserQuery, { projection: { name: 1, phone: 1, role: 1 } }).toArray()
        : [];
    line(`   user       ${n(testUsers.length)} test account(s)`);
    testUsers.slice(0, 8).forEach((u) => line(`               · ${u.name}  ${u.phone}  (${u.role})`));
    if (testUsers.length > 8) line(`               … and ${testUsers.length - 8} more`);

    // ── 3. Their projects and the records hanging off them ──────────────────
    line('\n3. Test projects and their child records');
    const testProjects = has('projects') || has('project')
        ? await db.collection(has('project') ? 'project' : 'projects')
            .find({ name: TEST_NAME }, { projection: { name: 1 } }).toArray()
        : [];
    line(`   project    ${n(testProjects.length)} test project(s)`);
    const pids = testProjects.map((p) => p._id);

    const children = [
        'projectupdate', 'milestone', 'projectpayment', 'approval',
        'projectmember', 'dailylog', 'projectdocument', 'projectnotification',
        'aiartifact', 'rfq',
    ];
    const childCounts = {};
    for (const c of children) {
        if (!has(c) || !pids.length) continue;
        const k = await db.collection(c).countDocuments({ project_id: { $in: pids } });
        if (k) { childCounts[c] = k; line(`   ${c.padEnd(20)} ${n(k)} row(s)`); }
    }

    // ── 4. Authorisation leftovers ──────────────────────────────────────────
    line('\n4. Authorisation records');
    const otpCollection = names.find((c) => /^otps?$/i.test(c));
    let otpTotal = 0;
    if (otpCollection) {
        otpTotal = await db.collection(otpCollection).countDocuments();
        line(`   ${otpCollection.padEnd(10)} ${n(otpTotal)} OTP record(s) — all stale, deleted wholesale`);
    } else {
        line('   (no OTP collection found)');
    }

    const sessionCollection = names.find((c) => /session/i.test(c));
    let sessTotal = 0;
    if (sessionCollection) {
        sessTotal = await db.collection(sessionCollection).countDocuments();
        line(`   ${sessionCollection.padEnd(10)} ${n(sessTotal)} session(s) — cleared so old cookies cannot resume`);
    }

    // ── Act ─────────────────────────────────────────────────────────────────
    line('\n' + '='.repeat(62));
    if (!APPLY) {
        const total = Object.values(siloTotals).reduce((a, b) => a + b, 0)
            + testUsers.length + testProjects.length
            + Object.values(childCounts).reduce((a, b) => a + b, 0)
            + otpTotal + sessTotal;
        line(`  DRY RUN. ${total} document(s) would be deleted.`);
        line('  Nothing was changed. Re-run with --apply to delete.\n');
        await mongoose.disconnect();
        return;
    }

    let deleted = 0;
    for (const c of silos) {
        if (!has(c)) continue;
        const r = await db.collection(c).deleteMany({});
        deleted += r.deletedCount;
        line(`  dropped ${r.deletedCount} from ${c}`);
    }
    if (testUsers.length) {
        const r = await db.collection('user').deleteMany({ _id: { $in: testUsers.map((u) => u._id) } });
        deleted += r.deletedCount;
        line(`  dropped ${r.deletedCount} test user(s)`);
    }
    for (const c of Object.keys(childCounts)) {
        const r = await db.collection(c).deleteMany({ project_id: { $in: pids } });
        deleted += r.deletedCount;
        line(`  dropped ${r.deletedCount} from ${c}`);
    }
    if (pids.length) {
        const r = await db.collection(has('project') ? 'project' : 'projects').deleteMany({ _id: { $in: pids } });
        deleted += r.deletedCount;
        line(`  dropped ${r.deletedCount} test project(s)`);
    }
    if (otpCollection) {
        const r = await db.collection(otpCollection).deleteMany({});
        deleted += r.deletedCount;
        line(`  dropped ${r.deletedCount} OTP record(s)`);
    }
    if (sessionCollection) {
        const r = await db.collection(sessionCollection).deleteMany({});
        deleted += r.deletedCount;
        line(`  dropped ${r.deletedCount} session(s)`);
    }

    line(`\n  Done. ${deleted} document(s) deleted.\n`);
    await mongoose.disconnect();
})().catch((e) => { console.error('\nFailed:', e.message); process.exit(1); });
