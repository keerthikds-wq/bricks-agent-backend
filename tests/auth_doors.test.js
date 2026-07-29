/**
 * Guards the auth surface.
 *
 * The bug this exists to prevent: `/builder/login` was retired from a
 * hand-written list while `/builder/sign-up` — same router, same silo — kept
 * creating accounts and signing 3-day JWTs with no OTP check. Closing doors by
 * name misses the ones nobody listed.
 *
 * So this test does not check a list either. It walks the route table, finds
 * every path that looks like an auth door, and asserts each one is either a
 * door we deliberately keep open or is answered 410. A new `/sign-up` added to
 * any legacy router fails this test the moment it is mounted.
 */
// Run with:  node tests/auth_doors.test.js
const path = require('path');
const REPO = path.join(__dirname, '..');

const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const mongoose = require('mongoose');

const { AUTH_DOOR } = require(path.join(REPO, 'Middleware', 'retiredAuth'));

let pass = 0, fail = 0;
const failures = [];
const ok = (n) => { pass++; console.log(`  PASS  ${n}`); };
const bad = (n, d) => { fail++; failures.push([n, d]); console.log(`  FAIL  ${n}\n          → ${d}`); };
const check = (n, c, d = '') => (c ? ok(n) : bad(n, d));

/**
 * The only auth doors allowed to answer. Adding to this list is a deliberate
 * act — that is the point. Each entry states why it lives.
 */
const OPEN_BY_DESIGN = new Map([
    ['/api/auth/login',            'phone entry — the one way in'],
    ['/api/auth/login/otp-verify', 'completes the OTP login'],
    ['/api/auth/register',         'creates the single account type'],
    ['/api/admin/login',           'admin panel publishes the catalogue'],
    ['/api/admin/otp-verify',      'admin login second factor'],
    ['/api/admin/forgot-password', 'admin recovery'],
    ['/api/admin/change-password', 'admin recovery'],
    ['/api/admin/email-verify',    'admin recovery'],
]);

/** Walk an Express router tree and collect every mounted path. */
function collectPaths(stack, prefix = '') {
    const found = [];
    for (const layer of stack || []) {
        if (layer.route) {
            const methods = Object.keys(layer.route.methods).filter((m) => layer.route.methods[m]);
            found.push({ path: prefix + layer.route.path, methods });
        } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
            // Recover the mount path from the layer's regexp.
            const src = layer.regexp && layer.regexp.source;
            let mount = '';
            if (src) {
                const m = src.match(/^\^\\\/(?:\?\(\?=\\\/\|\$\))?/) ? src : src;
                mount = m
                    .replace(/^\^/, '')
                    .replace(/\\\/\?\(\?=\\\/\|\$\)$/, '')
                    .replace(/\$$/, '')
                    .replace(/\\\//g, '/')
                    .replace(/\(\?:\(\[\^\\\/\]\+\?\)\)/g, ':param');
            }
            found.push(...collectPaths(layer.handle.stack, prefix + mount));
        }
    }
    return found;
}

(async () => {
    const mongo = await MongoMemoryServer.create();
    process.env.URL = mongo.getUri();
    process.env.SECRET = 'auth_doors_secret';
    process.env.SESSION_SECRET = 'auth_doors_session';
    process.env.NODE_ENV = 'test';
    process.env.ALLOWED_ORIGINS = '';

    await mongoose.connect(process.env.URL);
    // Require the real app AFTER env is set — index.js is what mounts /api.
    const { app } = require(path.join(REPO, 'index.js'));
    await new Promise((r) => setTimeout(r, 1500));

    console.log('\nAuth door audit\n' + '='.repeat(62));

    const all = collectPaths(app._router && app._router.stack);
    const doors = all.filter((r) => AUTH_DOOR.test(r.path));

    console.log(`\n  ${all.length} routes mounted, ${doors.length} look like auth doors\n`);

    // ── 1. Every auth-shaped route is accounted for ──────────────────────────
    console.log('─── Live behaviour of every auth-shaped route ───────────────');
    const seen = new Set();
    for (const door of doors) {
        if (seen.has(door.path)) continue;
        seen.add(door.path);

        const method = door.methods.includes('post') ? 'post' : door.methods[0];
        const res = await request(app)[method](door.path).send({});
        const intended = OPEN_BY_DESIGN.has(door.path);

        if (intended) {
            check(`${door.path} — open by design (${OPEN_BY_DESIGN.get(door.path)})`,
                res.status !== 410,
                `returned 410, but this door is required by the app`);
        } else {
            check(`${door.path} — retired`,
                res.status === 410,
                `returned ${res.status}, expected 410. An unlisted auth door is reachable.`);
        }
    }

    // ── 2. No retired door can ever hand back a token ────────────────────────
    console.log('\n─── No retired door mints a session ─────────────────────────');
    const mintAttempts = [
        ['/api/builder/sign-up', { name: 'ZZ', phone: '9990000001', pincode: '500001' }],
        ['/api/masonry/sign-up', { name: 'ZZ', phone: '9990000002', pincode: '500001' }],
        ['/api/seller/sign-up',  { name: 'ZZ', phone: '9990000003', pincode: '500001' }],
        ['/api/auth/sign-up',    { name: 'ZZ', phone: '9990000004', pincode: '500001' }],
        ['/api/admin/sign-up',   { name: 'ZZ', email: 'zz@zz.com', password: 'x' }],
    ];
    for (const [p, body] of mintAttempts) {
        const res = await request(app).post(p).send(body);
        check(`${p} hands back no token`,
            res.status === 410 && !(res.body && res.body.token),
            `status ${res.status}, token=${!!(res.body && res.body.token)} — THIS IS AN AUTH BYPASS`);
    }

    // ── 3. Non-auth routes on retired silos still work ───────────────────────
    console.log('\n─── Retiring auth did not break the rest ────────────────────');
    for (const p of ['/api/builder/nearby', '/api/masonry/nearby']) {
        const res = await request(app).get(p);
        check(`${p} still reachable`, res.status !== 410, `got 410 — the guard is too greedy`);
    }

    console.log('\n' + '='.repeat(62));
    console.log(`  ${pass} passed, ${fail} failed`);
    if (fail) {
        console.log('\n  FAILURES:');
        failures.forEach(([n, d]) => console.log(`   • ${n}\n     ${d}`));
    }

    await mongoose.disconnect();
    await mongo.stop();
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
