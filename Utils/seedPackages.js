/**
 * seedPackages.js
 * Upsert default subscription packages on server startup.
 * Safe to run multiple times — only inserts missing type+month combos.
 */

const Package = require('../Model/Package');

const DEFAULT_PACKAGES = [
    {
        label:    'Builder Pro Monthly',
        month:    1,
        single:   7999,
        complete: 7999,
        type:     'builder_pro',
        features: ['ai_recommendations', 'labour_access', 'bid_on_orders'],
        active:   true,
    },
    {
        label:    'Seller Monthly',
        month:    1,
        single:   699,
        complete: 699,
        type:     'seller',
        features: ['bid_on_orders', 'product_listing'],
        active:   true,
    },
    {
        label:    'Seller Quarterly',
        month:    3,
        single:   599,
        complete: 1799,
        type:     'seller',
        features: ['bid_on_orders', 'product_listing'],
        active:   true,
    },
    {
        label:    'Seller Half-Yearly',
        month:    6,
        single:   499,
        complete: 2999,
        type:     'seller',
        features: ['bid_on_orders', 'product_listing'],
        active:   true,
    },
    {
        label:    'Masonry Monthly',
        month:    1,
        single:   399,
        complete: 399,
        type:     'masonry',
        features: ['search_listing', 'profile_verified_badge'],
        active:   true,
    },
    {
        label:    'Masonry Quarterly',
        month:    3,
        single:   349,
        complete: 1049,
        type:     'masonry',
        features: ['search_listing', 'profile_verified_badge'],
        active:   true,
    },
];

async function seedPackages() {
    try {
        let inserted = 0;
        for (const pkg of DEFAULT_PACKAGES) {
            const existing = await Package.findOne({ type: pkg.type, month: pkg.month });
            if (!existing) {
                await Package.create(pkg);
                inserted++;
            }
        }
        if (inserted > 0) {
            console.log('seedPackages: inserted ' + inserted + ' new package(s)');
        } else {
            console.log('seedPackages: all packages already exist -- skipping');
        }
    } catch (err) {
        console.error('seedPackages error (non-fatal):', err.message);
    }
}

module.exports = seedPackages;
