/**
 * seedPackages.js
 * Run once on server startup to ensure default subscription packages exist.
 * Safe to call multiple times — only inserts if count === 0.
 */

const Package = require('../Model/Package');

const DEFAULT_PACKAGES = [
    // ── Seller plans ────────────────────────────────────────────────────────
    {
        label:    'Monthly Plan',
        month:    1,
        single:   999,
        complete: 999,
        type:     'seller',
        active:   true,
    },
    {
        label:    'Quarterly Plan',
        month:    3,
        single:   899,
        complete: 2699,
        type:     'seller',
        active:   true,
    },
    {
        label:    'Half-Yearly Plan',
        month:    6,
        single:   799,
        complete: 4799,
        type:     'seller',
        active:   true,
    },

    // ── Buyer plans ─────────────────────────────────────────────────────────
    {
        label:    'Monthly Plan',
        month:    1,
        single:   199,
        complete: 199,
        type:     'buyer',
        active:   true,
    },
    {
        label:    'Quarterly Plan',
        month:    3,
        single:   169,
        complete: 499,
        type:     'buyer',
        active:   true,
    },
];

async function seedPackages() {
    try {
        const count = await Package.countDocuments();
        if (count === 0) {
            await Package.insertMany(DEFAULT_PACKAGES);
            console.log(`seedPackages: inserted ${DEFAULT_PACKAGES.length} default packages`);
        } else {
            console.log(`seedPackages: ${count} packages already exist — skipping`);
        }
    } catch (err) {
        console.error('seedPackages error (non-fatal):', err.message);
    }
}

module.exports = seedPackages;
