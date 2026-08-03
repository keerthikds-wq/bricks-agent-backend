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

    // ── 4. The master-OTP bypass is default-deny ─────────────────────────────
    //
    // Both directions matter. Armed by accident it is a full account-takeover
    // backdoor on a public URL; disarmed with no SMS provider it locks everyone
    // out of a test deployment, which is exactly what happened when the gate
    // was NODE_ENV and the host set that to production by itself.
    console.log('\n─── Master OTP is off unless deliberately armed ─────────────');
    const User = require(path.join(REPO, 'Model/User'));
    await User.create({
        name: 'Bypass Probe', phone: '9700000001', pincode: '500001',
        role: 'builder',
    });

    const tryOtp = () => request(app)
        .post('/api/auth/login/otp-verify')
        .send({ phone: '9700000001', otp: '0000' });

    delete process.env.ALLOW_MASTER_OTP;
    process.env.MASTER_OTP = '0000';
    let res = await tryOtp();
    check('MASTER_OTP alone does not arm the bypass',
        !(res.body && res.body.token),
        'a token was minted with ALLOW_MASTER_OTP unset — THIS IS AN AUTH BYPASS');

    process.env.ALLOW_MASTER_OTP = 'false';
    res = await tryOtp();
    check('ALLOW_MASTER_OTP=false does not arm it either',
        !(res.body && res.body.token),
        'a token was minted — only the exact string "true" may arm this');

    process.env.ALLOW_MASTER_OTP = 'true';
    delete process.env.MASTER_OTP;
    res = await tryOtp();
    check('the flag alone, with no code set, arms nothing',
        !(res.body && res.body.token),
        'a token was minted with no MASTER_OTP value');

    process.env.ALLOW_MASTER_OTP = 'true';
    process.env.MASTER_OTP = '0000';
    res = await tryOtp();
    check('both set together DOES let a tester in',
        !!(res.body && res.body.token),
        `no token — the escape hatch does not work, so a test deployment with ` +
        `no SMS provider is unusable. status ${res.status}`);

    res = await request(app).post('/api/auth/login/otp-verify')
        .send({ phone: '9700000001', otp: '1234' });
    check('and a wrong code is still refused while armed',
        !(res.body && res.body.token),
        'any OTP was accepted — the bypass is matching too loosely');

    delete process.env.ALLOW_MASTER_OTP;
    delete process.env.MASTER_OTP;

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
