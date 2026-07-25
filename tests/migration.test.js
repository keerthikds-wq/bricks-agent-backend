/**
 * Migration test — 001_builder_centric against realistic legacy data,
 * including the collision cases the script claims to handle.
 */
// Run with:  node tests/migration.test.js
// Requires the devDependency mongodb-memory-server.
const path = require('path');
const { execFileSync } = require('child_process');
const REPO = path.join(__dirname, '..');

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}\n          → ${detail}`); }
};

(async () => {
  const mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri();
  await mongoose.connect(uri);

  const User    = require(path.join(REPO, 'Model/User'));
  const Builder = require(path.join(REPO, 'Model/Builder'));
  const Masonry = require(path.join(REPO, 'Model/Masonry'));
  const Seller  = require(path.join(REPO, 'Model/Seller'));
  const Project = require(path.join(REPO, 'Model/Project'));
  const Timeline= require(path.join(REPO, 'Model/ProjectTimeline'));

  // ── Legacy data, including the awkward cases ────────────────────────────
  const b1 = await Builder.create({ name: 'Ravi Constructions', phone: '9111111111', pincode: '500001', isBuilder: true });
  await Masonry.create({ name: 'Mason Anil', phone: '9222222222', pincode: '500002', specializations: ['rcc'] });
  await Masonry.create({ name: 'Contractor Vijay', phone: '9333333333', pincode: '500003', specializations: ['full_construction'] });
  await Seller.create({ name: 'Depot Cement', phone: '9444444444', pincode: '500004' });

  // A plain buyer who should become a client.
  await User.create({ name: 'Buyer Sita', phone: '9555555555', pincode: '500005' });

  // COLLISION: same phone exists as both a legacy Seller and an existing user.
  await User.create({ name: 'Dual Person', phone: '9666666666', pincode: '500006' });
  await Seller.create({ name: 'Dual Person Store', phone: '9666666666', pincode: '500006' });

  // COLLISION: a user who is ALREADY a builder must never be demoted.
  await User.create({ name: 'Existing Builder', phone: '9777777777', pincode: '500007', role: 'builder' });
  await Masonry.create({ name: 'Also A Mason', phone: '9777777777', pincode: '500007', specializations: ['rcc'] });

  // A legacy row with no phone — unmigratable, must be reported not crashed on.
  await Seller.collection.insertOne({ name: 'Phoneless Seller', pincode: '500008', is_delete: 0 });

  // Timelines: one owned by a Builder row, one orphaned.
  await Timeline.create({ builder_id: b1._id, project_name: 'Legacy Villa', location: 'Hyderabad',
    status: 'ongoing', total_sqft: 1800 });
  await Timeline.create({ builder_id: new mongoose.Types.ObjectId(), project_name: 'Orphan Project' });

  await mongoose.disconnect();

  const run = (args) => execFileSync('node',
    [path.join(REPO, 'Utils/migrations/001_builder_centric.js'), ...args],
    { env: { ...process.env, URL: uri }, encoding: 'utf8', timeout: 120000 });

  console.log('\n─── Dry run ──────────────────────────────────────────');
  const dry = run([]);
  check('dry run completes', dry.includes('DRY RUN'), 'no DRY RUN marker');
  check('dry run reports conflicts', dry.includes('need a human decision'), 'no conflict section');

  await mongoose.connect(uri);
  check('dry run wrote NOTHING (no projects created)',
    (await Project.countDocuments()) === 0, 'projects were created during dry run');
  check('dry run did not set roles',
    (await User.countDocuments({ migrated_from: { $ne: null } })) === 0,
    'users were mutated during dry run');
  await mongoose.disconnect();

  console.log('\n─── Apply ────────────────────────────────────────────');
  const applied = run(['--apply']);
  check('apply completes', applied.includes('Applied.'), 'no Applied marker');

  await mongoose.connect(uri);

  const byPhone = async (p) => User.findOne({ phone: p }).lean();

  check('Builder → role builder', (await byPhone('9111111111'))?.role === 'builder',
    `got ${(await byPhone('9111111111'))?.role}`);

  const anil = await byPhone('9222222222');
  check('Masonry(rcc) → field_staff/supervisor',
    anil?.role === 'field_staff' && anil?.staff_type === 'supervisor',
    `got ${anil?.role}/${anil?.staff_type}`);

  const vijay = await byPhone('9333333333');
  check('Masonry(full_construction) → field_staff/contractor',
    vijay?.role === 'field_staff' && vijay?.staff_type === 'contractor',
    `got ${vijay?.role}/${vijay?.staff_type}`);

  check('Seller → role vendor', (await byPhone('9444444444'))?.role === 'vendor',
    `got ${(await byPhone('9444444444'))?.role}`);

  check('plain buyer → role client', (await byPhone('9555555555'))?.role === 'client',
    `got ${(await byPhone('9555555555'))?.role}`);

  check('phone collision did NOT duplicate the user',
    (await User.countDocuments({ phone: '9666666666' })) === 1,
    `${await User.countDocuments({ phone: '9666666666' })} rows`);
  check('collided user upgraded to vendor in place',
    (await byPhone('9666666666'))?.role === 'vendor',
    `got ${(await byPhone('9666666666'))?.role}`);

  check('existing builder NOT demoted by a Masonry row',
    (await byPhone('9777777777'))?.role === 'builder',
    `got ${(await byPhone('9777777777'))?.role}  ← would be a privilege loss`);

  const migratedProject = await Project.findOne({ name: 'Legacy Villa' }).lean();
  check('timeline migrated to a project', !!migratedProject, 'not created');
  check('migrated project owned by the migrated builder user',
    migratedProject?.builder_id?.toString() === (await byPhone('9111111111'))?._id?.toString(),
    'owner mismatch');
  check('migrated project status mapped ongoing → active',
    migratedProject?.status === 'active', `got ${migratedProject?.status}`);
  check('orphan timeline skipped, not crashed on',
    !(await Project.findOne({ name: 'Orphan Project' })), 'orphan was migrated anyway');

  check('legacy Builder collection left intact',
    (await Builder.countDocuments()) === 1, 'source rows were modified');

  console.log('\n─── Idempotency (re-apply) ───────────────────────────');
  const usersBefore = await User.countDocuments();
  const projectsBefore = await Project.countDocuments();
  await mongoose.disconnect();

  run(['--apply']);

  await mongoose.connect(uri);
  check('re-running does not duplicate users',
    (await User.countDocuments()) === usersBefore,
    `${usersBefore} → ${await User.countDocuments()}`);
  check('re-running does not duplicate projects',
    (await Project.countDocuments()) === projectsBefore,
    `${projectsBefore} → ${await Project.countDocuments()}`);

  console.log('\n' + '═'.repeat(58));
  console.log(`  ${pass} passed, ${fail} failed`);

  await mongoose.disconnect();
  await mongo.stop();
  process.exit(fail ? 1 : 0);
})().catch(e => {
  console.error('HARNESS ERROR:', e.message, '\n', e.stack.split('\n').slice(0,6).join('\n'));
  process.exit(2);
});
