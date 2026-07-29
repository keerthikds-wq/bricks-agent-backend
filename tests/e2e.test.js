/**
 * End-to-end integration test for the builder-centric merge.
 *
 * Boots the REAL Express app against an in-memory MongoDB and drives the
 * actual flows over HTTP. No mocks of our own code — the point is to catch the
 * contract bugs that static analysis cannot see.
 *
 * Tokens are minted with the exact payload shape the production login
 * controllers use ({ id, phone, email, isUser|isBuilder }) so we test what the
 * app will really receive, not an idealised token.
 */
// Run with:  node tests/e2e.test.js
// Requires the devDependencies mongodb-memory-server + supertest.
const path = require('path');
const REPO = path.join(__dirname, '..');

const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

let pass = 0, fail = 0;
const results = [];
const ok = (name) => { pass++; results.push(['PASS', name, '']); console.log(`  PASS  ${name}`); };
const bad = (name, detail) => { fail++; results.push(['FAIL', name, detail]); console.log(`  FAIL  ${name}\n          → ${detail}`); };

function check(name, cond, detail = '') {
  cond ? ok(name) : bad(name, detail);
}

(async () => {
  const mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri();

  process.env.URL = uri;
  process.env.SECRET = 'e2e_test_secret';
  process.env.SESSION_SECRET = 'e2e_session';
  process.env.NODE_ENV = 'test';
  process.env.ALLOWED_ORIGINS = '';

  await mongoose.connect(uri);

  // Require the real app AFTER env is set.
  const { app } = require(path.join(REPO, 'index.js'));

  const User = require(path.join(REPO, 'Model/User'));
  const Project = require(path.join(REPO, 'Model/Project'));
  const RFQ = require(path.join(REPO, 'Model/RFQ'));

  // ── Fixtures: users created the way the app really stores them ──────────
  const mk = async (name, phone, extra) =>
    User.create({ name, phone, pincode: '500001', ...extra });

  const builder  = await mk('Ravi Builder', '9000000001', { role: 'builder', plan: 'trial', trial_started_at: new Date() });
  const client   = await mk('Sita Owner',   '9000000002', { role: 'client' });
  const engineer = await mk('Kumar Engg',   '9000000003', { role: 'field_staff', staff_type: 'site_engineer' });
  const vendor   = await mk('Cement Depot', '9000000004', { role: 'vendor' });
  const outsider = await mk('Random Person','9000000005', { role: 'client' });

  // Production token shape — deliberately WITHOUT `role`.
  const tok = (u, extra = {}) => jwt.sign(
    { id: u._id.toString(), phone: u.phone, email: u.email, isUser: true, ...extra },
    process.env.SECRET, { expiresIn: '1d' });

  const T = {
    builder:  tok(builder,  { isBuilder: true }),
    client:   tok(client),
    engineer: tok(engineer),
    vendor:   tok(vendor),
    outsider: tok(outsider),
  };

  const api = request(app);
  const auth = (t) => ({ Authorization: `Bearer ${t}` });

  console.log('\n─── 1. Project creation & plan gate ──────────────────');

  let r = await api.post('/api/projects').set(auth(T.builder)).send({
    name: 'Sharma Residence', address: 'Kukatpally, Hyderabad',
    area_sqft: 2400, floors: 2, budget: 4500000,
    client_phone: '9000000002', client_name: 'Sita Owner',
  });
  check('builder can create a project', r.status === 201, `got ${r.status}: ${JSON.stringify(r.body).slice(0,200)}`);
  const pid = r.body?.data?._id;

  check('pre-existing owner auto-linked by phone',
    r.body?.data?.client_id === client._id.toString(),
    `client_id=${r.body?.data?.client_id} expected=${client._id}`);

  r = await api.post('/api/projects').set(auth(T.client)).send({ name: 'X' });
  check('non-builder blocked from creating (403)', r.status === 403, `got ${r.status}`);

  console.log('\n─── 2. Access control ────────────────────────────────');

  r = await api.get(`/api/projects/${pid}`).set(auth(T.builder));
  check('builder can open own project', r.status === 200, `got ${r.status}`);
  check('my_role is builder', r.body?.data?.my_role === 'builder', `got ${r.body?.data?.my_role}`);

  r = await api.get(`/api/projects/${pid}`).set(auth(T.client));
  check('linked owner can open project', r.status === 200, `got ${r.status}`);
  check('my_role is client for owner', r.body?.data?.my_role === 'client', `got ${r.body?.data?.my_role}`);

  r = await api.get(`/api/projects/${pid}`).set(auth(T.outsider));
  check('unrelated user blocked (403)', r.status === 403, `got ${r.status}`);

  r = await api.patch(`/api/projects/${pid}`).set(auth(T.client)).send({ name: 'Hacked' });
  check('owner cannot edit project details (403)', r.status === 403, `got ${r.status}`);

  console.log('\n─── 3. Invite → accept ───────────────────────────────');

  r = await api.post(`/api/projects/${pid}/invite`).set(auth(T.builder))
        .send({ role: 'field_staff', staff_type: 'site_engineer' });
  check('builder can mint an invite', r.status === 200, `got ${r.status}: ${JSON.stringify(r.body).slice(0,150)}`);
  const inviteToken = r.body?.data?.token;
  check('invite carries a whatsapp url', !!r.body?.data?.whatsapp_url, 'missing');

  r = await api.get(`/api/projects/invite/${inviteToken}`);
  check('invite preview is public (no auth)', r.status === 200, `got ${r.status}`);
  check('preview names the project',
    r.body?.data?.project_name === 'Sharma Residence', `got ${r.body?.data?.project_name}`);

  r = await api.post(`/api/projects/invite/${inviteToken}/accept`).set(auth(T.engineer));
  check('engineer accepts invite', r.status === 200, `got ${r.status}: ${JSON.stringify(r.body).slice(0,150)}`);

  r = await api.get(`/api/projects/${pid}`).set(auth(T.engineer));
  check('engineer can now open the project', r.status === 200, `got ${r.status}`);
  check('engineer my_role is field_staff',
    r.body?.data?.my_role === 'field_staff', `got ${r.body?.data?.my_role}`);
  check('engineer has can_log_progress',
    r.body?.data?.my_capabilities?.can_log_progress === true,
    `got ${JSON.stringify(r.body?.data?.my_capabilities)}`);

  console.log('\n─── 4. Field work ────────────────────────────────────');

  r = await api.post(`/api/projects/${pid}/updates`).set(auth(T.engineer))
        .send({ title: 'Slab shuttering done', category: 'progress' });
  check('engineer can post a site update', r.status === 201, `got ${r.status}: ${JSON.stringify(r.body).slice(0,150)}`);

  r = await api.post(`/api/projects/${pid}/updates`).set(auth(T.client))
        .send({ title: 'Owner tries to post' });
  check('owner cannot post site updates (403)', r.status === 403, `got ${r.status}`);

  r = await api.post(`/api/projects/${pid}/daily-logs`).set(auth(T.engineer)).send({
    weather: 'clear', work_done: 'Column casting',
    labour: [{ trade: 'mason', count: 6 }, { trade: 'helper', count: 4 }],
    materials: [{ name: 'Cement', quantity: '20 bags' }],
  });
  check('engineer can post a daily log', r.status === 201, `got ${r.status}: ${JSON.stringify(r.body).slice(0,200)}`);
  check('daily log computed total_workers = 10',
    r.body?.data?.total_workers === 10, `got ${r.body?.data?.total_workers}`);

  r = await api.get(`/api/projects/${pid}/updates`).set(auth(T.client));
  const feedTitles = (r.body?.data || []).map(u => u.title);
  check('daily log mirrored onto the owner-visible feed',
    feedTitles.some(t => t.startsWith('Daily log')), `feed=${JSON.stringify(feedTitles)}`);

  r = await api.post(`/api/projects/${pid}/daily-logs`).set(auth(T.engineer))
        .send({ weather: 'clear', work_done: 'Duplicate same day' });
  check('duplicate daily log for same day rejected (409)', r.status === 409, `got ${r.status}`);

  console.log('\n─── 5. Approvals (raiser cannot decide) ──────────────');

  r = await api.post(`/api/projects/${pid}/approvals`).set(auth(T.builder))
        .send({ title: 'Upgrade flooring', cost_delta: 85000, category: 'material' });
  check('builder can raise an approval', r.status === 201, `got ${r.status}`);
  const aid = r.body?.data?._id;

  r = await api.patch(`/api/projects/${pid}/approvals/${aid}/decide`).set(auth(T.builder))
        .send({ decision: 'approved' });
  check('raiser cannot decide own approval (403)', r.status === 403, `got ${r.status}`);

  const beforeBudget = (await Project.findById(pid)).budget;
  r = await api.patch(`/api/projects/${pid}/approvals/${aid}/decide`).set(auth(T.client))
        .send({ decision: 'approved' });
  check('owner can decide builder-raised approval', r.status === 200, `got ${r.status}: ${JSON.stringify(r.body).slice(0,150)}`);
  const afterBudget = (await Project.findById(pid)).budget;
  check('approved cost_delta moved the budget',
    afterBudget === beforeBudget + 85000, `${beforeBudget} → ${afterBudget}`);

  console.log('\n─── 6. Finance visibility ────────────────────────────');

  r = await api.post(`/api/projects/${pid}/payments`).set(auth(T.builder))
        .send({ amount: 200000, purpose: 'Foundation stage' });
  check('builder can raise a payment', r.status === 201, `got ${r.status}`);

  r = await api.get(`/api/projects/${pid}/payments`).set(auth(T.client));
  check('owner can see payments', r.status === 200, `got ${r.status}`);

  r = await api.get(`/api/projects/${pid}/payments`).set(auth(T.engineer));
  check('engineer blocked from payments (403)', r.status === 403, `got ${r.status}`);

  console.log('\n─── 7. Workflow orchestrator ─────────────────────────');

  r = await api.get(`/api/projects/${pid}/workflow`).set(auth(T.builder));
  check('workflow returns for builder', r.status === 200, `got ${r.status}`);
  check('workflow has stages + next_action',
    Array.isArray(r.body?.data?.stages) && !!r.body?.data?.next_action?.stage,
    JSON.stringify(r.body?.data).slice(0, 200));
  const builderNext = r.body?.data?.next_action?.stage;

  r = await api.get(`/api/projects/${pid}/workflow`).set(auth(T.client));
  const clientNext = r.body?.data?.next_action?.stage;
  check('owner gets a DIFFERENT next action than builder',
    clientNext !== builderNext, `both got "${builderNext}"`);
  check('owner next action is an owner-shaped one',
    ['approve', 'pay', 'watch', 'review'].includes(clientNext), `got "${clientNext}"`);

  console.log('\n─── 8. Dashboard role shaping ────────────────────────');

  r = await api.get('/api/projects/dashboard').set(auth(T.builder));
  check('builder dashboard loads', r.status === 200, `got ${r.status}`);
  check('builder dashboard reports role=builder',
    r.body?.data?.role === 'builder', `got "${r.body?.data?.role}"  ← JWT carries no role`);
  check('builder dashboard includes subscription',
    !!r.body?.data?.subscription, 'missing subscription block');

  r = await api.get('/api/projects/dashboard').set(auth(T.engineer));
  check('engineer dashboard hides money',
    r.body?.data?.total_budget === undefined,
    `total_budget=${r.body?.data?.total_budget} ← should be absent for field_staff`);

  console.log('\n─── 9. Suppliers (WhatsApp contacts, not app users) ──');

  r = await api.post('/api/vendors').set(auth(T.builder))
        .send({ name: 'Cement Depot', phone: '9888800001', supplies: ['cement'] });
  check('builder can add a supplier contact', r.status === 201, `got ${r.status}: ${JSON.stringify(r.body).slice(0,150)}`);
  const vendorId = r.body?.data?._id;

  r = await api.post('/api/vendors').set(auth(T.builder))
        .send({ name: 'Dup Depot', phone: '9888800001', supplies: ['cement'] });
  check('duplicate supplier number rejected', r.status === 409, `got ${r.status}`);

  r = await api.post('/api/vendors').set(auth(T.builder))
        .send({ name: 'Steel Mart', phone: '9888800002', supplies: ['steel'] });
  check('second supplier added', r.status === 201, `got ${r.status}`);

  r = await api.get('/api/vendors').set(auth(T.builder));
  check('list returns both suppliers', (r.body?.data || []).length === 2, `got ${(r.body?.data||[]).length}`);

  const rfq = await RFQ.create({
    owner: builder._id, ownerModel: 'user', project_id: pid,
    rfq_number: 'RFQ-E2E-1', material_name: 'OPC Cement', category: 'cement',
    quantity: 200, unit: 'Bags', delivery_location: 'Kukatpally',
    status: 'open', dispatch_mode: 'roster',
  });

  r = await api.post(`/api/vendors/dispatch-rfq/${rfq._id}`).set(auth(T.builder));
  check('dispatch returns WhatsApp targets', r.status === 200, `got ${r.status}: ${JSON.stringify(r.body).slice(0,150)}`);
  check('only the cement supplier matched (category filter)',
    (r.body?.data?.targets || []).length === 1,
    `got ${(r.body?.data?.targets||[]).length}`);
  check('target carries a wa.me link with the message prefilled',
    `${r.body?.data?.targets?.[0]?.whatsapp_url}`.startsWith('https://wa.me/') &&
    decodeURIComponent(`${r.body?.data?.targets?.[0]?.whatsapp_url}`).includes('OPC Cement'),
    `got ${r.body?.data?.targets?.[0]?.whatsapp_url}`);

  r = await api.post(`/api/vendors/${vendorId}/record-quote/${rfq._id}`)
        .set(auth(T.builder)).send({ unit_price: 385, delivery_days: 3 });
  check('builder records the price quoted back', r.status === 201, `got ${r.status}: ${JSON.stringify(r.body).slice(0,180)}`);
  check('quote total computed from quantity',
    (r.body?.data?.quotes || []).some(q => q.total_price === 385 * 200),
    `got ${JSON.stringify((r.body?.data?.quotes||[]).map(q=>q.total_price))}`);

  r = await api.post(`/api/vendors/${vendorId}/record-quote/${rfq._id}`)
        .set(auth(T.builder)).send({ unit_price: 370 });
  check('re-recording replaces rather than duplicates',
    (r.body?.data?.quotes || []).length === 1,
    `got ${(r.body?.data?.quotes||[]).length} quotes`);

  r = await api.post(`/api/vendors/${vendorId}/record-quote/${rfq._id}`)
        .set(auth(T.outsider)).send({ unit_price: 1 });
  check('another builder cannot touch this supplier list', r.status === 404, `got ${r.status}`);

  for (const [p, m] of [['/api/rfq/open','get'], ['/api/rfq/seller/my-quotes','get'], [`/api/rfq/${rfq._id}/quote`,'post']]) {
    const rr = await (m === 'get' ? api.get(p) : api.post(p).send({ unit_price: 1 })).set(auth(T.vendor));
    check(`${p} is retired (410)`, rr.status === 410, `got ${rr.status}`);
  }

  console.log('\n─── 10. Unified auth (legacy silos retired) ──────────');

  r = await api.post('/api/auth/register').send({
    name: 'New Builder', phone: '9000000009', pincode: '500009', role: 'builder',
  });
  check('builder can self-register', r.status === 200, `got ${r.status}: ${JSON.stringify(r.body).slice(0,150)}`);
  check('registration returns a token', !!r.body?.token, 'no token');
  check('new builder starts on trial',
    r.body?.data?.plan === 'trial' && !!r.body?.data?.trial_started_at,
    `plan=${r.body?.data?.plan} trial_started=${r.body?.data?.trial_started_at}`);

  r = await api.post('/api/auth/register').send({
    name: 'Dup', phone: '9000000009', pincode: '500009', role: 'client',
  });
  check('duplicate phone rejected with a clear message', r.status === 409, `got ${r.status}`);

  r = await api.post('/api/auth/register').send({
    name: 'Sneaky', phone: '9000000010', pincode: '500010', role: 'field_staff',
  });
  check('cannot self-declare as field_staff (invite only)', r.status === 400, `got ${r.status}`);

  // A builder entered this phone on a project before the owner ever signed up.
  const preProject = await Project.create({
    builder_id: builder._id, name: 'Pre-linked Villa',
    client_phone: '9000000011', status: 'planning',
  });
  r = await api.post('/api/auth/register').send({
    name: 'Late Owner', phone: '9000000011', pincode: '500011', role: 'client',
  });
  check('client self-register backfills a pre-linked project', r.status === 200, `got ${r.status}`);
  const linked = await Project.findById(preProject._id);
  check('pre-linked project now points at the new owner',
    linked?.client_id?.toString() === r.body?.data?._id,
    `client_id=${linked?.client_id} user=${r.body?.data?._id}`);

  for (const p of ['/api/seller/login', '/api/builder/login', '/api/masonry/login']) {
    const rr = await api.post(p).send({ phone: '9000000001' });
    check(`${p} is retired (410)`, rr.status === 410, `got ${rr.status}`);
  }

  console.log('\n─── 11. Materials & rates (never an undated price) ───');

  const PriceTrend = require(path.join(REPO, 'Model/PriceTrend'));
  const Product = require(path.join(REPO, 'Model/Product'));
  const days = (n) => new Date(Date.now() - n * 86400000);

  // Own region: index.js runs priceTrendScheduler on boot, which seeds live
  // 'national' rates and would otherwise mask these fixtures.
  const REG = 'e2e-region';
  await PriceTrend.create({ material: 'cement', price: 400, unit: 'per 50kg bag', region: REG, recorded_at: days(2) });
  await PriceTrend.create({ material: 'cement', price: 380, unit: 'per 50kg bag', region: REG, recorded_at: days(35) });
  // Steel's newest point is older than the 45-day staleness cutoff.
  await PriceTrend.create({ material: 'steel', price: 62, unit: 'per kg', region: REG, recorded_at: days(120) });

  r = await api.get(`/api/materials/rates?region=${REG}`).set(auth(T.builder));
  check('rates load', r.status === 200, `got ${r.status}`);
  const cement = (r.body?.data?.items || []).find(i => i.material === 'cement');
  check('fresh rate is returned', !!cement, 'cement missing');
  check('rate carries the date it was recorded',
    !!cement?.as_of && cement?.age_days >= 0, `as_of=${cement?.as_of}`);
  check('trend computed against a ~30-day-old point',
    cement?.change_pct === 5.3, `got ${cement?.change_pct}`);
  check('stale material omitted rather than shown old',
    !(r.body?.data?.items || []).some(i => i.material === 'steel'),
    'steel was returned despite being 120 days old');

  r = await api.get(`/api/materials/benchmark?material=steel&region=${REG}`).set(auth(T.builder));
  check('benchmark returns null for stale material, not a guess',
    r.status === 200 && r.body?.data?.rate === null, `got ${JSON.stringify(r.body?.data)}`);

  await Product.create({ name: 'Plain Cement', is_published: true, material_key: 'cement' });
  await Product.create({
    name: 'Sponsored Cement', is_published: true, material_key: 'cement',
    sponsored: true, sponsor_name: 'BrandCo', sponsor_until: days(-30),
  });
  await Product.create({
    name: 'Expired Sponsorship', is_published: true, material_key: 'cement',
    sponsored: true, sponsor_name: 'OldCo', sponsor_until: days(5),
  });

  r = await api.get('/api/materials/products?material=cement').set(auth(T.builder));
  const names = (r.body?.data || []).map(p => p.name);
  check('published products load', names.length === 3, `got ${names.length}`);
  check('live sponsor floats to the top', names[0] === 'Sponsored Cement', `order=${names}`);
  const expired = (r.body?.data || []).find(p => p.name === 'Expired Sponsorship');
  check('expired sponsorship stops being paid placement',
    expired?.sponsored === false && expired?.sponsor_name === '',
    `sponsored=${expired?.sponsored} name=${expired?.sponsor_name}`);

  console.log('\n─── 12. Notifications ────────────────────────────────');

  r = await api.get('/api/project-notifications').set(auth(T.client));
  check('owner has notifications from project activity',
    r.status === 200 && (r.body?.data?.items || []).length > 0,
    `status=${r.status} count=${(r.body?.data?.items||[]).length}`);

  // ── Summary ────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(58));
  console.log(`  ${pass} passed, ${fail} failed`);
  if (fail) {
    console.log('\n  FAILURES:');
    results.filter(x => x[0] === 'FAIL').forEach(x => console.log(`   • ${x[1]}\n     ${x[2]}`));
  }

  await mongoose.disconnect();
  await mongo.stop();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => {
  console.error('\nHARNESS ERROR:', e.message);
  console.error(e.stack.split('\n').slice(0, 8).join('\n'));
  process.exit(2);
});
