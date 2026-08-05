/**
 * The Firebase login door.
 *
 * This file exists for one assertion, stated several ways: the phone number
 * must come from the verified token and never from the request body. Everything
 * else here is scaffolding around that.
 *
 * The bug it guards against is not hypothetical. The `/register` endpoint it
 * replaces took `phone` from an unauthenticated body and, on a match with a
 * project's `client_phone`, attached the caller to that project — so anyone
 * could register a stranger's number and be handed their builder's contract,
 * payment history and site photos. A Firebase login that reads `req.body.phone`
 * would reintroduce exactly that, while looking like real authentication.
 *
 *   node tests/firebase_auth.test.js
 */
const path = require('path');
const REPO = path.join(__dirname, '..');

const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const mongoose = require('mongoose');

let pass = 0, fail = 0;
const failures = [];
const ok = (n) => { pass++; console.log(`  PASS  ${n}`); };
const bad = (n, d) => { fail++; failures.push([n, d]); console.log(`  FAIL  ${n}\n          -> ${d}`); };
const check = (n, c, d = '') => (c ? ok(n) : bad(n, d));
const eq = (n, a, e) => check(`${n} = ${e}`, a === e, `got ${JSON.stringify(a)}, expected ${JSON.stringify(e)}`);

(async () => {
    const mongo = await MongoMemoryServer.create();
    process.env.URL = mongo.getUri();
    process.env.SECRET = 'fb_secret';
    process.env.SESSION_SECRET = 'fb_session';
    process.env.NODE_ENV = 'test';
    process.env.ALLOWED_ORIGINS = '';

    await mongoose.connect(process.env.URL);

    // Stand in for Google.
    //
    // Verifying a real ID token needs Google's signing keys and a live network,
    // neither of which belongs in a unit test. What matters is what the
    // controller DOES with a verified result, so admin.auth() is replaced with
    // a decoder that accepts one known-good token and refuses everything else —
    // which is precisely the contract the real verifier offers.
    // Held at Utils/firebase.getAuth, not at admin.auth.
    //
    // firebase-admin exposes `auth` as a getter, so assigning to it is silently
    // ignored and the mock never fires — which is exactly what happened first
    // and produced a wall of 401s that looked like a controller bug.
    const fbUtil = require(path.join(REPO, 'Utils/firebase'));
    const VALID = 'valid-token-for-9632433346';
    let decode = async (t) => {
        if (t === VALID) return { uid: 'fbuid1', phone_number: '+919632433346' };
        if (t === 'valid-but-email-signin') return { uid: 'fbuid2', email: 'x@y.com' };
        const e = new Error('Decoding Firebase ID token failed');
        e.code = 'auth/argument-error';
        throw e;
    };
    fbUtil.getAuth = () => ({ verifyIdToken: (t) => decode(t) });

    const { app } = require(path.join(REPO, 'index.js'));
    const User = require(path.join(REPO, 'Model/User'));
    const Project = require(path.join(REPO, 'Model/Project'));
    const ProjectMember = require(path.join(REPO, 'Model/ProjectMember'));

    await new Promise((r) => setTimeout(r, 1200));
    const api = request(app);

    console.log('\nFirebase auth tests\n' + '='.repeat(60));

    // ── Phone normalisation ─────────────────────────────────────────────────
    console.log('\n--- Firebase E.164 and the stored ten digits are one number ---');
    const { toLocal, toE164 } = require(path.join(REPO, 'Utils/phone'));
    eq('+91 form', toLocal('+919632433346'), '9632433346');
    eq('91 prefix, no plus', toLocal('919632433346'), '9632433346');
    eq('leading zero', toLocal('09632433346'), '9632433346');
    eq('already local', toLocal('9632433346'), '9632433346');
    eq('spaced and hyphenated', toLocal('+91 96324-33346'), '9632433346');
    eq('back to E.164', toE164('9632433346'), '+919632433346');
    // A wrong-but-confident answer here signs somebody in as somebody else.
    eq('too short is refused', toLocal('96324'), null);
    eq('landline prefix is refused', toLocal('+911234567890'), null);
    eq('empty is refused', toLocal(''), null);

    // ── The rule ────────────────────────────────────────────────────────────
    console.log('\n--- The phone comes from the token, never the body ---');

    const victim = await User.create({
        name: 'Victim Owner', phone: '7013553652', pincode: '560068', role: 'client',
    });

    // Correct token, but the body names a DIFFERENT person's number. The body
    // must be ignored entirely.
    const spoof = await api.post('/api/auth/firebase')
        .send({ idToken: VALID, phone: '7013553652' });
    eq('answers 200', spoof.status, 200);
    check('does NOT return the account named in the body',
        String(spoof.body?.data?._id || '') !== String(victim._id),
        `got ${spoof.body?.data?.name}`);
    eq('reports the token phone instead', spoof.body.phone, '9632433346');
    eq('and says no account exists for it', spoof.body.exist, false);

    const forged = await api.post('/api/auth/firebase')
        .send({ idToken: 'not-a-real-token', phone: '7013553652' });
    eq('a forged token is refused', forged.status, 401);
    check('and hands back no session', !forged.body.token);

    const none = await api.post('/api/auth/firebase').send({ phone: '7013553652' });
    eq('a missing token is refused', none.status, 401);

    // A Google or email sign-in verifies perfectly and carries no phone. It
    // must not get past a door whose entire premise is a proven number.
    const emailTok = await api.post('/api/auth/firebase')
        .send({ idToken: 'valid-but-email-signin' });
    eq('a non-phone sign-in is refused', emailTok.status, 401);

    console.log('\n--- Registration obeys the same rule ---');
    const regSpoof = await api.post('/api/auth/firebase/register').send({
        idToken: VALID, phone: '7013553652', name: 'Impostor', role: 'client',
    });
    eq('registers, but not as the body said', regSpoof.status, 201);
    eq('the account created carries the token phone', regSpoof.body.data.phone, '9632433346');
    check('the victim still has exactly one account',
        (await User.countDocuments({ phone: '7013553652' })) === 1);

    const regForged = await api.post('/api/auth/firebase/register').send({
        idToken: 'nope', name: 'Impostor', role: 'client',
    });
    eq('registration with a forged token is refused', regForged.status, 401);

    // ── Returning users ─────────────────────────────────────────────────────
    console.log('\n--- A returning user is signed in, not duplicated ---');
    const again = await api.post('/api/auth/firebase').send({ idToken: VALID });
    eq('exist', again.body.exist, true);
    check('issues a session token', !!again.body.token);
    eq('same account', again.body.data.phone, '9632433346');

    const reReg = await api.post('/api/auth/firebase/register').send({
        idToken: VALID, name: 'Someone Else', role: 'builder',
    });
    eq('re-registering signs in rather than erroring', reReg.status, 200);
    eq('and does not change their role', reReg.body.data.role, 'client');
    check('still one account for that number',
        (await User.countDocuments({ phone: '9632433346' })) === 1);

    // ── The pre-link ────────────────────────────────────────────────────────
    console.log('\n--- A builder who named this number gets their client attached ---');
    const builder = await User.create({
        name: 'Ravi Constructions', phone: '9888800001', pincode: '560068',
        role: 'builder', plan: 'trial', trial_started_at: new Date(),
    });
    const proj = await Project.create({
        builder_id: builder._id, name: 'Villa 12', budget: 6200000,
        client_phone: '9776655443', client_name: 'New Owner',
    });

    decode = async () => ({ uid: 'fbuid3', phone_number: '+919776655443' });

    const preview = await api.post('/api/auth/firebase').send({ idToken: 'x' });
    eq('the app is told a project is waiting', preview.body.pending?.role, 'client');
    eq('and which one', preview.body.pending?.project_name, 'Villa 12');
    eq('and who is expecting them', preview.body.pending?.builder_name, 'Ravi Constructions');

    const joined = await api.post('/api/auth/firebase/register').send({
        idToken: 'x', name: 'New Owner', role: 'client',
    });
    eq('account created', joined.status, 201);
    const linked = await Project.findById(proj._id).lean();
    eq('the project now points at them', String(linked.client_id), String(joined.body.data._id));
    const mem = await ProjectMember.findOne({
        project_id: proj._id, user_id: joined.body.data._id,
    }).lean();
    check('and they are an active member', mem && mem.status === 'active',
        `got ${JSON.stringify(mem && mem.status)}`);
    check('who can see the money', mem && mem.can_view_finance === true);

    // ── Sessions that last, and can still be ended ──────────────────────────
    //
    // The experience wanted is Uber's: signed in until you sign out. The
    // mistake that experience invites is a token nothing can revoke, so both
    // halves are asserted here — it must survive, and it must die on command.
    console.log('\n--- The session lasts, and sign-out really ends it ---');

    decode = async (t) => {
        if (t === VALID) return { uid: 'fbuid1', phone_number: '+919632433346' };
        throw Object.assign(new Error('bad'), { code: 'auth/argument-error' });
    };

    const jwtLib = require('jsonwebtoken');
    const sess = await api.post('/api/auth/firebase').send({ idToken: VALID });
    const tok = sess.body.token;
    const claims = jwtLib.decode(tok);

    const days = Math.round((claims.exp - claims.iat) / 86400);
    eq('the token lasts 30 days, not 3', days, 30);
    check('and carries the session epoch', claims.epoch === 0,
        `got ${JSON.stringify(claims.epoch)}`);

    const me = await api.get('/api/projects/dashboard').set({ Authorization: `Bearer ${tok}` });
    eq('the session works', me.status, 200);

    // Expiry is not the end of the road: a fresh Firebase token buys a new JWT
    // with no user interaction, which is what makes it feel permanent.
    const renewed = await api.post('/api/auth/firebase').send({ idToken: VALID });
    check('a new JWT can be obtained silently', !!renewed.body.token);
    eq('without asking for a code', renewed.body.exist, true);

    const out = await api.post('/api/auth/signout').set({ Authorization: `Bearer ${tok}` }).send({});
    eq('sign-out succeeds', out.status, 200);

    const after = await api.get('/api/projects/dashboard').set({ Authorization: `Bearer ${tok}` });
    eq('the old token is dead immediately', after.status, 401);
    eq('and says why', after.body.code, 'SESSION_REVOKED');

    // Signing in again must work — revocation ends sessions, not accounts.
    const back = await api.post('/api/auth/firebase').send({ idToken: VALID });
    const tok2 = back.body.token;
    eq('signing back in works', back.status, 200);
    check('the new token carries the raised epoch', jwtLib.decode(tok2).epoch === 1,
        `got ${jwtLib.decode(tok2).epoch}`);
    const me2 = await api.get('/api/projects/dashboard').set({ Authorization: `Bearer ${tok2}` });
    eq('and it works', me2.status, 200);

    // A token minted before session_epoch existed carries no claim. Treating
    // that as a mismatch would sign out every existing user the moment this
    // deploys, which is a worse outage than the gap it closes.
    //
    // Uses an account that has NOT signed out — the first version of this test
    // used one that had, so its old token was revoked for the right reason and
    // the assertion was measuring the wrong thing.
    const legacy = jwtLib.sign(
        { id: String(builder._id), phone: builder.phone, isUser: true },
        process.env.SECRET, { expiresIn: '3d' });
    const legacyRes = await api.get('/api/projects/dashboard').set({ Authorization: `Bearer ${legacy}` });
    check('a pre-existing token without an epoch claim is not force-signed-out',
        legacyRes.status !== 401 || legacyRes.body.code !== 'SESSION_REVOKED',
        `got ${legacyRes.status} ${legacyRes.body.code}`);

    console.log('\n' + '='.repeat(60));
    console.log(`  ${pass} passed, ${fail} failed`);
    if (fail) {
        console.log('\n  FAILURES:');
        failures.forEach(([n, d]) => console.log(`   - ${n}\n     ${d}`));
    }

    await mongoose.disconnect();
    await mongo.stop();
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
