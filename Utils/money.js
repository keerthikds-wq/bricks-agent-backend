/**
 * Exact money arithmetic.
 *
 * Rupees stored as JavaScript numbers are IEEE-754 doubles, and a double cannot
 * represent most decimal fractions. A realistic month of material bills:
 *
 *   1234.56 + 8790.45 + 233.33 + 45678.91 + 999.99 + 12.15 + 6543.21 + 88.88
 *     float →  63581.479999999996
 *     exact →  63581.48
 *
 * The error is tiny per operation and unbounded over a project's life, and it
 * always shows up in the one place it must not: a balance that fails to
 * reconcile, by an amount nobody can explain. `Math.round()` does not fix this,
 * it conceals it — and it also throws away real paise.
 *
 * So paise are the unit of account here. Every amount is an integer number of
 * paise, every sum is integer addition, and rounding happens exactly once at a
 * named boundary rather than incidentally at every arithmetic step.
 *
 * Intermediates use BigInt. A wage of `rate × hours ÷ standard_hours × count`
 * has a division in the middle, which is precisely where a double would start
 * lying; BigInt keeps the numerator and denominator whole until a single
 * deliberate rounding at the end.
 *
 * ── Why not Decimal128 ──────────────────────────────────────────────────────
 * Mongo's Decimal128 would also be exact, but it is exact only in storage:
 * `$sum` over Decimal128 works, while every arithmetic step in Node would need
 * a decimal library, and the values arrive from JSON as strings or doubles
 * anyway. Integer paise is exact end to end, sums natively in an aggregation
 * pipeline, and needs no dependency. The ceiling is ₹90,07,19,92,54,740 — about
 * 90 trillion rupees — which is comfortably beyond any construction project.
 */

/** Largest amount representable without losing integer precision. */
const MAX_PAISE = Number.MAX_SAFE_INTEGER; // 9,007,199,254,740,991 paise

class MoneyError extends Error {}

/**
 * Rupees → integer paise, exactly.
 *
 * Strings are parsed digit by digit so no float ever touches the value — this is
 * the preferred input form and what an API should send. Numbers are accepted for
 * compatibility but must carry at most two decimal places; `1234.567` is
 * rejected rather than silently rounded, because a third decimal in a rupee
 * amount means the caller is confused about the unit and guessing would bury
 * that.
 */
function toPaise(value) {
    if (value === null || value === undefined || value === '') {
        throw new MoneyError('amount is required');
    }

    if (typeof value === 'bigint') return clamp(Number(value));

    if (typeof value === 'string') {
        const s = value.trim().replace(/[₹,\s]/g, '');
        const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(s);
        if (!m) throw new MoneyError(`"${value}" is not a valid rupee amount`);
        const [, sign, whole, frac = ''] = m;
        const paise = BigInt(whole) * 100n + BigInt((frac + '00').slice(0, 2));
        return clamp(Number(sign === '-' ? -paise : paise));
    }

    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new MoneyError('amount must be a finite number');
        const s = String(value);
        if (/e/i.test(s)) throw new MoneyError('amount is out of range');

        // Two different things look like "too many decimals", and they need
        // opposite treatment:
        //
        //   0.1 + 0.2 → 0.30000000000000004    float noise; the caller means 30 paise
        //   1234.567                            genuine third decimal; the caller
        //                                       is confused about the unit, or
        //                                       expects sub-paise precision we
        //                                       cannot keep
        //
        // Counting decimal places cannot tell them apart — the first has 17 and
        // is fine, the second has 3 and is not. What separates them is distance
        // from a whole number of paise: noise sits within a few ulps, a real
        // third decimal sits a long way off. So measure that instead.
        const asPaise = value * 100;
        const nearest = Math.round(asPaise);
        const off = Math.abs(asPaise - nearest);

        if (off > 1e-6) {
            const dp = (s.split('.')[1] || '').length;
            throw new MoneyError(
                `amount ${value} has ${dp} decimal places; rupees carry at most 2 (paise)`
            );
        }
        return clamp(nearest);
    }

    throw new MoneyError(`cannot read an amount from ${typeof value}`);
}

function clamp(paise) {
    if (!Number.isInteger(paise)) throw new MoneyError('paise must be a whole number');
    if (Math.abs(paise) > MAX_PAISE) throw new MoneyError('amount is too large to represent exactly');
    return paise;
}

/** Integer paise → a rupee Number, for display only. Never sum these. */
function toRupees(paise) {
    return Number(paise || 0) / 100;
}

/** Integer paise → "12,34,567.89", Indian grouping, for messages and PDFs. */
function formatRupees(paise) {
    const neg = paise < 0;
    const abs = Math.abs(Number(paise) || 0);
    const whole = Math.trunc(abs / 100);
    const frac = String(abs % 100).padStart(2, '0');

    // Indian grouping: last three digits, then pairs.
    const s = String(whole);
    const head = s.length > 3 ? s.slice(0, -3) : '';
    const tail = s.length > 3 ? s.slice(-3) : s;
    const grouped = head
        ? head.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + tail
        : tail;

    return `${neg ? '-' : ''}₹${grouped}.${frac}`;
}

/** Exact integer sum. */
function sum(paiseList) {
    let total = 0n;
    for (const p of paiseList || []) total += BigInt(Math.trunc(Number(p) || 0));
    return clamp(Number(total));
}

/**
 * Scale an amount by a fraction, exactly, rounding once.
 *
 * Used for pro-rata wages (`rate × hours ÷ standard_hours`) and for any
 * percentage. Rounding is half-away-from-zero, which is what an invoice reader
 * expects: 0.5 paise rounds up, not to the nearest even.
 */
function scale(paise, numerator, denominator) {
    if (!denominator) throw new MoneyError('denominator must not be zero');

    const p = BigInt(Math.trunc(Number(paise) || 0));
    // Numerator and denominator may be fractional (hours: 7.5, multiplier: 1.5).
    // Lift both to integers by a common power of ten so the ratio stays exact.
    const { n, d } = liftRatio(numerator, denominator);

    const productNum = p * n;
    const q = productNum / d;
    const rem = productNum % d;

    // Round half away from zero.
    const twice = (rem < 0n ? -rem : rem) * 2n;
    const roundUp = twice >= (d < 0n ? -d : d);
    const bump = roundUp ? (productNum < 0n ? -1n : 1n) : 0n;

    return clamp(Number(q + bump));
}

/** Turns a possibly-fractional ratio into an exact BigInt pair. */
function liftRatio(numerator, denominator) {
    const dpOf = (x) => {
        const s = String(x);
        if (/e/i.test(s)) throw new MoneyError('ratio is out of range');
        return (s.split('.')[1] || '').length;
    };
    const shift = Math.max(dpOf(numerator), dpOf(denominator));
    const factor = 10 ** shift;
    const n = BigInt(Math.round(Number(numerator) * factor));
    const d = BigInt(Math.round(Number(denominator) * factor));
    if (d === 0n) throw new MoneyError('denominator must not be zero');
    return { n, d };
}

/**
 * Split an amount into parts by weight, losing nothing.
 *
 * The naive approach — round each share independently — does not add back up:
 * ₹100 split three ways gives 33.33 × 3 = ₹99.99, and the missing paisa has to
 * live somewhere. This uses the largest-remainder method: floor every share,
 * then hand the leftover paise out one at a time to the shares with the largest
 * discarded remainder. The parts always sum to exactly the input.
 *
 * Ties break toward the earlier index, so the split is deterministic — the same
 * bill divided twice produces the same numbers, which matters when one of them
 * has already been sent to a client.
 *
 *   allocate(10000, [1, 1, 1]) → [3334, 3333, 3333]   (₹100 → 33.34, 33.33, 33.33)
 */
function allocate(paise, weights) {
    const total = BigInt(Math.trunc(Number(paise) || 0));
    const w = (weights || []).map((x) => BigInt(Math.round(Number(x) * 1e6)));
    const wSum = w.reduce((a, b) => a + b, 0n);
    if (wSum <= 0n) throw new MoneyError('weights must sum to more than zero');

    const shares = [];
    let allocated = 0n;
    for (const wi of w) {
        const exact = total * wi;
        const q = exact / wSum;
        shares.push({ q, rem: exact % wSum });
        allocated += q;
    }

    let leftover = total - allocated;
    const order = shares
        .map((s, i) => ({ i, rem: s.rem }))
        .sort((a, b) => (b.rem > a.rem ? 1 : b.rem < a.rem ? -1 : a.i - b.i));

    const step = leftover < 0n ? -1n : 1n;
    let k = 0;
    while (leftover !== 0n && order.length) {
        shares[order[k % order.length].i].q += step;
        leftover -= step;
        k++;
    }

    return shares.map((s) => clamp(Number(s.q)));
}

module.exports = {
    MoneyError,
    MAX_PAISE,
    toPaise,
    toRupees,
    formatRupees,
    sum,
    scale,
    allocate,
};
