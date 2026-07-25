const { model, Schema } = require("mongoose");

/**
 * ProjectDocument — the shared document vault (drawings, permits, receipts,
 * contracts). Ported from v2 collab.py.
 *
 * v2 base64'd the whole file into Mongo. Here the bytes live in Cloudinary and
 * we keep only the URL + public_id, matching how BOQ.plan_image already works.
 */
const projectDocumentSchema = new Schema(
    {
        project_id: { type: Schema.Types.ObjectId, ref: "project", required: true, index: true },

        name: { type: String, required: true, trim: true },
        doc_type: {
            type: String,
            enum: ["drawing", "permit", "receipt", "contract", "boq", "quotation", "photo", "other"],
            default: "other",
            index: true,
        },

        file_url:       { type: String, required: true },   // Cloudinary secure_url
        file_public_id: { type: String, default: "" },      // needed to destroy on delete
        mime_type:      { type: String, default: "application/pdf" },
        size_bytes:     { type: Number, default: 0 },

        // Clients should not see internal cost workings unless shared.
        visible_to_client: { type: Boolean, default: true },

        uploaded_by:      { type: Schema.Types.ObjectId, ref: "user" },
        uploaded_by_name: { type: String, default: "" },

        is_delete: { type: Number, enum: [0, 1], default: 0 },
    },
    { timestamps: true }
);

projectDocumentSchema.index({ project_id: 1, createdAt: -1 });

module.exports = model("projectdocument", projectDocumentSchema);
