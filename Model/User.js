const { model, Schema } = require("mongoose");
const userSchema = new Schema(
    {
        name: {
            type: String,
            required: true,
        },
        email: {
            type: String,
        },
        phone: {
            type: String,
            min: 10,
            max: 10,
            required: true,
            unique:true
        },
        pincode: {
            type: String,
            min: 6,
            max: 6,
            required: true,
        },
        profile: String,
        fcm_token: String,
        longitude:String,
        latitude:String,
        is_verified: {
            type: Number,
            enum: [0, 1],
            default: 0,
        },
        active: {
            type: Number,
            enum: [0, 1],
            default: 0,
        },
        is_delete: {
            type: Number,
            enum: [0, 1],
            default: 0
        },
        isUser:{
            type:Boolean,
            default: true
        },

        // ── Unified role model (builder-centric merge) ───────────────────────
        // Replaces the old buyer/seller/builder/masonry auth silos. Kept
        // alongside the legacy isUser/isSeller flags so existing tokens and
        // screens keep working until the Flutter migration lands.
        //
        //   builder     — owns projects, the only paying role
        //   client      — the owner/homeowner a builder is building for
        //   field_staff — site engineer / supervisor / mason / contractor
        //   vendor      — material supplier on a builder's roster
        role: {
            type: String,
            enum: ['builder', 'client', 'field_staff', 'vendor'],
            default: 'client',
            index: true,
        },
        staff_type: {
            type: String,
            enum: ['site_engineer', 'supervisor', 'mason', 'contractor', null],
            default: null,
        },
        // Free-text trade for masons/contractors, carried over from
        // Masonry.specializations during migration.
        trade: { type: String, default: '' },

        // Set by the migration so we can trace where a merged account came
        // from, and roll back if needed.
        migrated_from: {
            type: String,
            enum: ['seller', 'masonry', 'builder', 'user', null],
            default: null,
        },
        legacy_id: { type: Schema.Types.ObjectId, default: null },

        /**
         * Bumped to end every session this account has open.
         *
         * ── Why sessions need an off switch ──────────────────────────────────
         *
         * Tokens were signed for three days and verified by signature alone —
         * no lookup, no record — so there was no way to end one early. A phone
         * left in an auto-rickshaw stayed logged in until the token aged out,
         * and "log out" only destroyed a server session that JWT auth never
         * consulted.
         *
         * Every token carries the epoch it was minted under. Raising this makes
         * all of them stale at once, which is what "log out" and "I lost my
         * phone" actually have to mean.
         *
         * The cost is one comparison against a document attachRole already
         * loads, so revocation is effectively free on the routes that carry
         * project and money data.
         */
        session_epoch: { type: Number, default: 0 },

        // ── Subscription (builders only) ────────────────────────────────────
        subscription_tier: {
            type: String,
            enum: ['free', 'builder_pro'],
            default: 'free',
        },
        subscription_expires_at: {
            type: Date,
        },
        // Richer plan state used by the builder paywall. `subscription_tier`
        // above is left untouched for backward compatibility.
        plan: {
            type: String,
            enum: ['free', 'trial', 'starter', 'pro'],
            default: 'free',
        },
        plan_expires_at:  { type: Date },
        trial_started_at: { type: Date },
    },
    { timestamps: true }
);

userSchema.index({ role: 1, is_delete: 1 });

module.exports = model("user", userSchema);
