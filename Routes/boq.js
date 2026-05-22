const express  = require("express");
const multer   = require("multer");
const router   = express.Router();
const ctrl     = require("../Controller/boq");
const { Auth } = require("../Middleware");

// multer — memory storage for Cloudinary stream upload
const upload = multer({
    storage: multer.memoryStorage(),
    limits:  { fileSize: 10 * 1024 * 1024 }, // 10 MB
    fileFilter: (req, file, cb) => {
        const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];
        allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error("Only images and PDFs allowed"));
    },
});

// ── Stateless calculation (no auth required — useful for preview) ─────────────
router.post("/calculate", ctrl.calculateBOQ);

// ── Authenticated routes ────────────────────────────────────────────────────
router.post("/save",              Auth, ctrl.saveBOQ);
router.get("/my",                 Auth, ctrl.myBOQs);
router.get("/:id",                Auth, ctrl.getBOQ);
router.delete("/:id",             Auth, ctrl.deleteBOQ);
router.post("/upload-plan",       Auth, upload.single("plan"), ctrl.uploadPlan);
router.patch("/:id/link-plan",    Auth, ctrl.linkPlan);

module.exports = router;
