const { model, Schema } = require("mongoose");

const productSchema = new Schema(
    {
        name: String,
        description: String,
        size: String,
        //image: [String],

        image: [
            {
                public_id:{type: String, required: true},
                secure_url:{type: String, required: true}
            }
        ],



        min_quantity: {
            type: Number,
            default: 0
        },
        min_price: {
            type: Number,
            default: 0
        },
        max_price: {
            type: Number,
            default: 0
        },
        subtitle:{
            type: String,
        },
        // ── Materials & rates catalogue (builder-centric merge) ──────────────
        // Products are admin-published reference now, not seller inventory.
        // Builders do not buy in-app; they buy from their WhatsApp suppliers.
        is_published: { type: Boolean, default: true, index: true },

        /// Which material this maps to, so a product can be shown against the
        /// live rate for its category (see PriceTrend.material).
        material_key: {
            type: String,
            enum: ['cement', 'steel', 'bricks', 'sand', 'aggregate', 'tiles',
                   'paint', 'tmt_bars', 'plywood', null],
            default: null,
            index: true,
        },

        /// Paid placement. Declared now so the data shape is right when
        /// manufacturers start buying it; nothing renders differently until
        /// `sponsored` is set, and sponsored items are always labelled.
        sponsored:     { type: Boolean, default: false, index: true },
        sponsor_name:  { type: String, default: "" },
        sponsor_until: { type: Date },

        manufacturer:{
            type: String,
        },
        disclaimer:{
            type: String,
        },
        category: {
            type: Schema.Types.ObjectId,
            ref: 'category'
        },
        subcategory: {
            type: Schema.Types.ObjectId,
            ref: 'subcategory',
        },
        brand: {
            type: Schema.Types.ObjectId,
            ref: 'brand',
        },
        is_delete: {
            type: Number,
            enum: [0, 1],
            default: 0
        }
    },
    { timestamps: true });
module.exports = model("product", productSchema);