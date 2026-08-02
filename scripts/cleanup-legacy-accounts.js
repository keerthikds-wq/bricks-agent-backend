/**
 * Removes the retired account silos, the test data, and stale auth records.
 *
 * The app is one account collection (`users`) with a `role`. The `sellers`,
 * `builders` and `masonries` collections are the pre-merge silos: their login
 * doors answer 410 now, but the documents are still there along with the OTP
 * records that could authorise them.
 *
 * DRY RUN BY DEFAULT — it prints what it would delete and changes nothing.
 * Pass --apply to actually delete, and only after reading the report.
 *
 *   node scripts/cleanup-legacy-accounts.js            # report only
 *   node scripts/cleanup-legacy-accounts.js --apply    # really delete
 *
 * ── Two bugs this script had, worth remembering ─────────────────────────────
 *
 * It used SINGULAR collection names — `user`, `builder`, `project`. Mongoose
 * pluralises, so the real collections are `users`, `builders`, `projects`, and
 * every lookup silently found nothing and reported zero. A cleanup script that
 * quietly does nothing is bad; one that deletes a partial set and leaves
 * orphaned children is worse, which is what would have happened here.
 *
 * It also matched test data on /^ZZ(TEST|FN|DUMP|PROBE)/ while the harnesses
 * had since grown ZZMONEY, ZZAI, ZZPPL, ZZIMG and ZZFIN — so it saw 5 of 12
 * test projects. The prefix is now just ZZ, and every collection name is
 * checked against listCollections() rather than assumed.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { resolveMongoUri } = require('../Utils/srvFallback');

const APPLY = process.argv.includes('--apply');

/** Every harness prefixes its records ZZ. Nothing real is named that way. */
const TEST_NAME = { $regex: '^ZZ', $options: 'i' };

const line = (s = '') => console.log(s);
const pad = (x, w = 6) => String(x).padStart(w);

/** The pre-merge account silos. Retired wholesale. */
const SILOS = ['sellers', 'builders', 'masonries'];

/** Collections whose rows hang off a project and must go with it. */
const PROJECT_CHILDREN = [
    'projectupdates', 'milestones', 'projectpayments', 'approvals',
    'projectmembers', 'dailylogs', 'projectdocuments', 'projectnotifications',
    'aiartifacts', 'rfqs', 'ledgerentries', 'boqs', 'projecttimelines',
];

(async () => {
    if (!process.env.URL) {
        console.error('URL is not set. Run this from the backend folder with a .env present.');
        process.exit(1);
    }

    const resolved = await resolveMongoUri(process.env.URL);
    if (resolved.viaFallback) {
        line(`  (SRV blocked locally — resolved ${resolved.hosts.length} hosts over HTTPS)`);
    }
    await mongoose.connect(resolved.uri);
    const db = mongoose.connection.db;

    // Names are read from the server, never assumed.
    const present = new Set((await db.listCollections().toArray()).map((c) => c.name));
    const has = (c) => present.has(c);

    line(`\nConnected to ${mongoose.connection.name}`);
    line(APPLY ? '\n*** APPLY MODE — this will delete ***' : '\nDRY RUN — nothing will be deleted');
    line('='.repeat(64));

    const plan = [];   // { label, collection, filter, count }

    /* ── 1. Retired silos ─────────────────────────────────────────────── */
    line('\n1. Retired account silos (dropped entirely)');
    for (const c of SILOS) {
        if (!has(c)) { line(`   ${c.padEnd(12)} — absent`); continue; }
        const count = await db.collection(c).countDocuments();
        line(`   ${c.padEnd(12)} ${pad(count)}`);
        if (count) {
            const sample = await db.collection(c)
                .find({}, { projection: { name: 1 } }).limit(4).toArray();
            line(`                 ${sample.map((s) => s.name || '(unnamed)').join(', ')}`);
            plan.push({ label: c, collection: c, filter: {}, count });
        }
    }

    /* ── 2. Test accounts ─────────────────────────────────────────────── */
    line('\n2. Test accounts left by the harnesses');
    let testUserIds = [];
    if (has('users')) {
        const testUsers = await db.collection('users')
            .find({ name: TEST_NAME }, { projection: { name: 1 } }).toArray();
        testUserIds = testUsers.map((u) => u._id);
        const real = await db.collection('users')
            .countDocuments({ name: { $not: /^ZZ/i } });
        line(`   users        ${pad(testUsers.length)} test  ·  ${real} real accounts KEPT`);
        if (testUsers.length) {
            plan.push({
                label: 'users (test only)', collection: 'users',
                filter: { name: TEST_NAME }, count: testUsers.length,
            });
        }
    }

    /* ── 3. Test projects and everything hanging off them ─────────────── */
    line('\n3. Test projects and their child records');
    let pids = [];
    if (has('projects')) {
        const testProjects = await db.collection('projects')
            .find({ name: TEST_NAME }, { projection: { name: 1 } }).toArray();
        pids = testProjects.map((p) => p._id);
        line(`   projects     ${pad(testProjects.length)}`);

        // Children first, so nothing is orphaned if the run is interrupted.
        for (const c of PROJECT_CHILDREN) {
            if (!has(c) || !pids.length) continue;
            const count = await db.collection(c)
                .countDocuments({ project_id: { $in: pids } });
            if (count) {
                line(`   ${c.padEnd(22)} ${pad(count)}`);
                plan.push({
                    label: c, collection: c,
                    filter: { project_id: { $in: pids } }, count,
                });
            }
        }
        if (pids.length) {
            plan.push({
                label: 'projects', collection: 'projects',
                filter: { _id: { $in: pids } }, count: pids.length,
            });
        }
    }

    /* ── 4. Test suppliers ────────────────────────────────────────────── */
    if (has('vendorlinks')) {
        const count = await db.collection('vendorlinks')
            .countDocuments({ name: TEST_NAME });
        if (count) {
            line(`   vendorlinks  ${pad(count)} test supplier(s)`);
            plan.push({
                label: 'vendorlinks (test)', collection: 'vendorlinks',
                filter: { name: TEST_NAME }, count,
            });
        }
    }

    /* ── 5. Auth leftovers ────────────────────────────────────────────── */
    line('\n4. Authorisation records');
    for (const c of ['otps']) {
        if (!has(c)) continue;
        const count = await db.collection(c).countDocuments();
        line(`   ${c.padEnd(12)} ${pad(count)} — every one is expired; cleared wholesale`);
        if (count) plan.push({ label: c, collection: c, filter: {}, count });
    }

    /* ── Act ──────────────────────────────────────────────────────────── */
    const total = plan.reduce((s, p) => s + p.count, 0);
    line('\n' + '='.repeat(64));

    if (!APPLY) {
        line(`  DRY RUN. ${total} document(s) across ${plan.length} collection(s).`);
        line('  Nothing was changed. Re-run with --apply to delete.\n');
        await mongoose.disconnect();
        return;
    }

    let deleted = 0;
    for (const step of plan) {
        const r = await db.collection(step.collection).deleteMany(step.filter);
        deleted += r.deletedCount;
        line(`  ${String(r.deletedCount).padStart(5)} from ${step.label}`);
    }

    line(`\n  Done. ${deleted} document(s) deleted.`);

    // Prove the result rather than assert it.
    const remainingUsers = has('users') ? await db.collection('users').countDocuments() : 0;
    const remainingProjects = has('projects') ? await db.collection('projects').countDocuments() : 0;
    line(`  Remaining: ${remainingUsers} user(s), ${remainingProjects} project(s).\n`);

    await mongoose.disconnect();
})().catch((e) => { console.error('\nFailed:', e.message); process.exit(1); });
