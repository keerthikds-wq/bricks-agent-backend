/**
 * Money arithmetic tests — the properties, not just examples.
 *
 * These are the invariants a ledger stands on. Where a property must hold for
 * all inputs (a split never loses a paisa), the test asserts it over thousands
 * of randomised cases rather than a handful of chosen ones, because the failures
 * that matter here are the ones nobody thought to pick.
 *
 * Run with:  node tests/money.test.js
 */
const M = require('../Utils/money');

let pass = 0, fail = 0;
const failures = [];
const ok = (n) => { pass++; console.log(`  PASS  ${n}`); };
const bad = (n, d) => { fail++; failures.push([n, d]); console.log(`  FAIL  ${n}\n          → ${d}`); };
const check = (n, c, d = '') => (c ? ok(n) : bad(n, d));
const eq = (n, a, e) => check(`${n}`, a === e, `got ${a}, expected ${e}`);

console.log('\nMoney arithmetic\n' + '='.repeat(60));

// ── Parsing ─────────────────────────────────────────────────────────────────
console.log('\n─── Rupees → paise, exactly ─────────────────────────────────');
eq('toPaise("1234.56")', M.toPaise('1234.56'), 123456);
eq('toPaise(1234.56)', M.toPaise(1234.56), 123456);
eq('toPaise("1234.5")', M.toPaise('1234.5'), 123450);
eq('toPaise("1234")', M.toPaise('1234'), 123400);
eq('toPaise(0)', M.toPaise(0), 0);
eq('toPaise("₹12,34,567.89") strips formatting', M.toPaise('₹12,34,567.89'), 123456789);
eq('toPaise("-500.25")', M.toPaise('-500.25'), -50025);

// The float that started all of this.
eq('toPaise(0.1 + 0.2) is 30 paise, not 30.000000000000004',
    M.toPaise(0.1 + 0.2), 30);

console.log('\n─── Bad input is refused, not rounded ───────────────────────');
for (const bogus of ['1234.567', 'abc', '', null, undefined, '12.3.4', NaN, Infinity]) {
    let threw = false;
    try { M.toPaise(bogus); } catch (_) { threw = true; }
    check(`rejects ${JSON.stringify(bogus)}`, threw, 'was accepted — a silent rounding');
}
let threw = false;
try { M.toPaise(1234.567); } catch (e) { threw = /decimal places/.test(e.message); }
check('rejects 3 decimal places with a clear message', threw, 'message did not explain the unit');

// ── The original bug ────────────────────────────────────────────────────────
console.log('\n─── The drift that motivated this ───────────────────────────');
const bills = [1234.56, 8790.45, 233.33, 45678.91, 999.99, 12.15, 6543.21, 88.88];
let floatSum = 0;
for (const b of bills) floatSum += b;
const exactSum = M.sum(bills.map(M.toPaise));
check('float sum is wrong', floatSum !== 63581.48, `float gave ${floatSum}`);
eq('exact sum is right (paise)', exactSum, 6358148);
eq('exact sum formats correctly', M.formatRupees(exactSum), '₹63,581.48');

// ── Formatting ──────────────────────────────────────────────────────────────
console.log('\n─── Indian grouping ─────────────────────────────────────────');
eq('₹1,00,000.00', M.formatRupees(10000000), '₹1,00,000.00');
eq('₹12,34,567.89', M.formatRupees(123456789), '₹12,34,567.89');
eq('₹999.00', M.formatRupees(99900), '₹999.00');
eq('₹0.05', M.formatRupees(5), '₹0.05');
eq('₹1,000.00', M.formatRupees(100000), '₹1,000.00');
eq('-₹500.25', M.formatRupees(-50025), '-₹500.25');

// ── Pro-rata ────────────────────────────────────────────────────────────────
console.log('\n─── Pro-rata scaling ────────────────────────────────────────');
eq('₹875 for 7 of 8 hours = ₹765.63', M.scale(87500, 7, 8), 76563);
eq('₹900 full day', M.scale(90000, 8, 8), 90000);
eq('₹900 half day', M.scale(90000, 4, 8), 45000);
eq('fractional hours (7.5 of 8)', M.scale(90000, 7.5, 8), 84375);
eq('overtime multiplier 1.5', M.scale(90000, 1.5, 1), 135000);
eq('rounds half away from zero', M.scale(1, 1, 2), 1);   // 0.5 paise → 1
eq('negative rounds away from zero too', M.scale(-1, 1, 2), -1);

// ── Allocation: the property that matters ───────────────────────────────────
console.log('\n─── Splitting never loses a paisa ───────────────────────────');
eq('₹100 three ways sums back exactly', M.sum(M.allocate(10000, [1, 1, 1])), 10000);
check('₹100 three ways = 33.34 / 33.33 / 33.33',
    JSON.stringify(M.allocate(10000, [1, 1, 1])) === JSON.stringify([3334, 3333, 3333]),
    `got ${JSON.stringify(M.allocate(10000, [1, 1, 1]))}`);
eq('weighted split sums back', M.sum(M.allocate(100000, [3, 1, 1])), 100000);
check('the split is deterministic',
    JSON.stringify(M.allocate(10000, [1, 1, 1])) === JSON.stringify(M.allocate(10000, [1, 1, 1])),
    'two identical calls disagreed');

// Randomised: for any amount and any weights, the parts must sum to the whole.
let allocFails = 0, worstDrift = 0;
for (let i = 0; i < 20000; i++) {
    const amount = Math.floor(Math.random() * 5_000_000_00); // up to ₹5 crore in paise
    const n = 1 + Math.floor(Math.random() * 12);
    const weights = Array.from({ length: n }, () => Math.random() * 100 + 0.01);
    const parts = M.allocate(amount, weights);
    const total = M.sum(parts);
    if (total !== amount) {
        allocFails++;
        worstDrift = Math.max(worstDrift, Math.abs(total - amount));
    }
}
check(`20,000 random splits all sum back exactly`, allocFails === 0,
    `${allocFails} split(s) lost money, worst drift ${worstDrift} paise`);

// Randomised: parsing then formatting must round-trip.
let rtFails = 0;
for (let i = 0; i < 20000; i++) {
    const whole = Math.floor(Math.random() * 100_000_000);
    const frac = String(Math.floor(Math.random() * 100)).padStart(2, '0');
    const str = `${whole}.${frac}`;
    const paise = M.toPaise(str);
    if (paise !== whole * 100 + Number(frac)) rtFails++;
}
check('20,000 random amounts parse exactly', rtFails === 0, `${rtFails} mis-parsed`);

// Randomised: summing in any order gives the same total (float addition does not).
let orderFails = 0;
for (let i = 0; i < 5000; i++) {
    const list = Array.from({ length: 20 }, () =>
        M.toPaise(`${Math.floor(Math.random() * 100000)}.${String(Math.floor(Math.random() * 100)).padStart(2, '0')}`));
    const a = M.sum(list);
    const b = M.sum([...list].reverse());
    const c = M.sum([...list].sort(() => Math.random() - 0.5));
    if (a !== b || b !== c) orderFails++;
}
check('sums are order-independent', orderFails === 0, `${orderFails} disagreed`);

// ── Range ───────────────────────────────────────────────────────────────────
console.log('\n─── Range guard ────────────────────────────────────────────');
let rangeThrew = false;
try { M.toPaise('99999999999999999999'); } catch (_) { rangeThrew = true; }
check('refuses an amount too large to represent exactly', rangeThrew, 'accepted silently');
eq('₹1 crore is fine', M.toPaise('10000000.00'), 1000000000);
eq('₹1,000 crore is fine', M.toPaise('10000000000.00'), 1000000000000);

console.log('\n' + '='.repeat(60));
console.log(`  ${pass} passed, ${fail} failed`);
if (fail) {
    console.log('\n  FAILURES:');
    failures.forEach(([n, d]) => console.log(`   • ${n}\n     ${d}`));
}
process.exit(fail ? 1 : 0);
