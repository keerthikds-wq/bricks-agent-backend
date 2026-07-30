const { model, Schema } = require("mongoose");

/**
 * LedgerEntry — every rupee that moves on a project, in one place.
 *
 * Before this, the only money on a project was ProjectPayment: stage payments
 * from the client to the builder. Money going *out* — material bills, labour
 * wages, site expenses — was not recorded anywhere, which meant a builder could
 * not be told what they owed, what they were owed, or what a project had really
 * cost. `Project.spent` was a single number incremented on payment, with nothing
 * behind it to audit.
 *
 * One collection for both directions, deliberately:
 *   - a balance is only trustworthy if in and out come from the same source, and
 *   - "what is my position" becomes one aggregation instead of a reconciliation
 *     between separate tables that will drift.
 *
 * Append-only by convention. Corrections are new reversing entries rather than
 * edits, so the history of what was believed and when survives. `is_delete` is
 * kept for consistency with the rest of the codebase but should be a last resort
 * — a deleted bill that was already paid leaves a hole in the balance.
 *
 * ── Statuses ──────────────────────────────────────────────────────────────────
 *   pending   the obligation exists but the money has not moved
 *             (a bill received, an invoice raised, wages accrued)
 *   settled   the money has actually moved
 *   cancelled written off; excluded from every total
 *
 * A pending `in` is a receivable. A pending `out` is a payable. That single
 * distinction is what the dashboard is built on.
 */

const LineItemSchema = new Schema(
    {
        name: { type: String, required: true, trim: true },
        qty:  { type: Number, default: 0 },
        unit: { type: String, default: "" },          // bag, ton, sqft, day

        // Paise are authoritative; the rupee fields beside them are derived for
        // display and for the screens that already read them. See Utils/money.js.
        rate_paise:   { type: Number, default: 0 },
        amount_paise: { type: Number, default: 0 },   // qty × rate, stored so a
                                                      // historical bill does not
                                                      // change if rates change
        rate:   { type: Number, default: 0 },
        amount: { type: Number, default: 0 },
    },
    { _id: false }
);

const ledgerEntrySchema = new Schema(
    {
        project_id: { type: Schema.Types.ObjectId, ref: "project", required: true, index: true },
        builder_id: { type: Schema.Types.ObjectId, ref: "user", required: true, index: true },

        /** Money coming to the builder, or going out. */
        direction: {
            type: String,
            enum: ["in", "out"],
            required: true,
            index: true,
        },

        category: {
            type: String,
            enum: [
                // in
                "client_payment",   // stage payment / advance from the owner
                "other_income",
                // out
                "material_bill",    // supplier invoice
                "labour_wage",      // accrued from daily logs or entered directly
                "subcontractor",
                "equipment_rent",
                "transport",
                "permit_fee",
                "expense",          // catch-all site expense
            ],
            required: true,
            index: true,
        },

        /**
         * The authoritative amount, in paise.
         *
         * Integer, so sums are exact and `$sum` in an aggregation cannot drift.
         * A rupee amount held as a double silently fails to reconcile — see
         * Utils/money.js for the arithmetic and why this is the unit of account.
         */
        amount_paise: {
            type: Number,
            required: true,
            min: 0,
            validate: {
                validator: Number.isInteger,
                message: "amount_paise must be a whole number of paise",
            },
        },

        /** Derived from amount_paise on save. Display only — never sum this. */
        amount: { type: Number, default: 0, min: 0 },

        status: {
            type: String,
            enum: ["pending", "settled", "cancelled"],
            default: "pending",
            index: true,
        },

        /** Who the money is from or to. Free text — vendors are not app users. */
        party_name:  { type: String, default: "", trim: true },
        party_phone: { type: String, default: "", trim: true },

        description: { type: String, default: "", trim: true },
        line_items:  { type: [LineItemSchema], default: [] },

        occurred_on: { type: Date, required: true, index: true },  // bill date / work date
        due_date:    { type: Date },
        settled_on:  { type: Date },

        payment_mode: {
            type: String,
            enum: ["", "cash", "upi", "bank_transfer", "cheque", "razorpay"],
            default: "",
        },
        reference_no: { type: String, default: "", trim: true },   // cheque no, UTR
        attachments:  { type: [String], default: [] },             // Cloudinary urls

        /**
         * Where this entry came from. Entries mirrored from another document
         * carry its id so the two can never be double-counted or drift: the
         * mirror is updated in place rather than a second entry being written.
         */
        source: {
            type: String,
            enum: ["manual", "project_payment", "daily_log"],
            default: "manual",
            index: true,
        },
        source_ref: { type: Schema.Types.ObjectId, index: true },

        created_by: { type: Schema.Types.ObjectId, ref: "user" },
        is_delete:  { type: Number, enum: [0, 1], default: 0 },
    },
    { timestamps: true }
);

// The dashboard's hot path: position for a set of projects.
ledgerEntrySchema.index({ project_id: 1, direction: 1, status: 1, is_delete: 1 });
ledgerEntrySchema.index({ builder_id: 1, occurred_on: -1 });

// One mirror per source document — makes the mirroring idempotent, so a retried
// request cannot book the same payment twice.
ledgerEntrySchema.index(
    { source: 1, source_ref: 1 },
    { unique: true, partialFilterExpression: { source_ref: { $exists: true } } }
);

/**
 * Line items are the authority on a bill's amount when they are present, and
 * every figure is reconciled in paise before the rupee copies are written.
 *
 * `qty × rate` is the one place a fractional multiplier appears (2.5 tons at
 * ₹4,150.75), so it goes through money.scale rather than a float multiply.
 */
ledgerEntrySchema.pre("save", function (next) {
    const money = require("../Utils/money");

    try {
        if (this.line_items && this.line_items.length) {
            for (const li of this.line_items) {
                if (!li.rate_paise && li.rate) li.rate_paise = money.toPaise(li.rate);
                if (!li.amount_paise) {
                    li.amount_paise = money.scale(li.rate_paise || 0, li.qty || 0, 1);
                }
                li.rate = money.toRupees(li.rate_paise || 0);
                li.amount = money.toRupees(li.amount_paise || 0);
            }
            const total = money.sum(this.line_items.map((li) => li.amount_paise || 0));
            if (total > 0) this.amount_paise = total;
        }

        // Keep the display copy in step. Derived here rather than by callers so
        // the two can never disagree.
        this.amount = money.toRupees(this.amount_paise || 0);
    } catch (err) {
        return next(err);
    }

    if (this.status === "settled" && !this.settled_on) this.settled_on = new Date();
    next();
});

module.exports = model("ledgerentry", ledgerEntrySchema);
