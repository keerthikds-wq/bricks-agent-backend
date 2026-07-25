const AiArtifact     = require("../Model/AiArtifact");
const Project        = require("../Model/Project");
const ProjectUpdate  = require("../Model/ProjectUpdate");
const Milestone      = require("../Model/Milestone");
const ProjectPayment = require("../Model/ProjectPayment");
const DailyLog       = require("../Model/DailyLog");
const BOQ            = require("../Model/BOQ");
const User           = require("../Model/User");

const { callerId }      = require("../Middleware/projectAccess");
const { notifyProject } = require("../Utils/projectNotify");
const ai = require("../Utils/aiGuard");

const ok   = (res, data, s = 200) => res.status(s).json({ success: true, data });
const fail = (res, s, message)    => res.status(s).json({ success: false, message });

/**
 * Project AI suite — the seven features ported from Bricks_agent_v2's ai.py.
 *
 * Two deliberate changes from v2:
 *   1. Every call goes through Utils/aiGuard (cache + per-user daily cap).
 *      v2 hit a paid API on every request with neither.
 *   2. Provider is Groq rather than the Emergent proxy, removing both the
 *      markup and the platform lock-in. Image generation still needs a
 *      dedicated provider — see `_generateImage`.
 */

async function planOf(userId) {
    const u = await User.findById(userId).select("role plan").lean();
    if (!u) return "free";
    return u.role === "builder" ? (u.plan || "trial") : "free";
}

/** Respond consistently to the two aiGuard failure shapes. */
function guardFailure(res, out) {
    if (out.limitReached) {
        return res.status(429).json({
            success: false, limit_reached: true,
            message: out.message, usage: out.usage,
        });
    }
    return res.status(502).json({
        success: false, parse_failed: true,
        message: "The AI returned an unexpected format. Please try again.",
        raw: out.text?.slice(0, 500),
    });
}

async function saveArtifact(fields) {
    try { return await AiArtifact.create(fields); }
    catch (e) { console.error("saveArtifact (non-fatal):", e.message); return null; }
}

/* ─────────────────────── Cost estimate (3-tier) ─────────────────────── */

// POST /api/projects/:pid/ai/cost-estimate
exports.costEstimate = async (req, res) => {
    try {
        const userId  = callerId(req);
        const project = req.project;

        const area   = Number(req.body.area_sqft) || project.area_sqft || 1500;
        const floors = Number(req.body.floors)    || project.floors    || 1;
        const city   = req.body.city || project.address || "Bengaluru";

        const system =
            "You are a construction cost estimator for Indian residential projects. " +
            "Return ONLY a JSON object with three tier estimates. Schema: " +
            '{"tiers":{"economy":T,"standard":T,"premium":T},"notes":string} where T is ' +
            '{"total_cost_inr":number,"cost_per_sqft":number,"timeline_months":number,' +
            '"labour_cost_inr":number,"material_cost_inr":number,"equipment_cost_inr":number,' +
            '"finishing_cost_inr":number,"builder_margin_inr":number,"contingency_inr":number,' +
            '"breakdown":[{"category":string,"cost_inr":number,"percent":number}],' +
            '"materials":[{"name":string,"quantity":string,"cost_inr":number}]}';

        const prompt =
            `Estimate 3-tier construction cost (Economy / Standard / Premium) for a ${area} sqft ` +
            `residential build with ${floors} floor(s) at ${city}, India. Include cement, steel, ` +
            `bricks, sand, aggregates, tiles, paint, plumbing and electrical. Include material, ` +
            `labour, equipment and finishing cost, builder margin (8-12%) and contingency (~5%). ` +
            `All amounts in INR. Return only JSON.`;

        const out = await ai.run({
            userId,
            plan: await planOf(userId),
            cacheSeed: `cost_estimate|${area}|${floors}|${city}`,
            system, prompt,
            structured: true,
            maxTokens: 2600,
        });

        if (!out.ok) return guardFailure(res, out);

        const artifact = await saveArtifact({
            project_id: project._id, user_id: userId, kind: "cost_estimate",
            input: { area_sqft: area, floors, city }, result: out.data, cached: out.cached,
        });

        return ok(res, { id: artifact?._id, estimate: out.data, cached: out.cached, usage: out.usage });
    } catch (err) {
        console.error("costEstimate error:", err);
        return fail(res, err.status || 500, err.message || "Server error");
    }
};

/* ───────────────────────────── Quotation ────────────────────────────── */

// POST /api/projects/:pid/ai/quotation   (builder only)
exports.quotation = async (req, res) => {
    try {
        const userId  = callerId(req);
        const project = req.project;
        const { scope } = req.body;
        if (!scope) return fail(res, 400, "scope is required");

        // Ground the quote in the real BOQ when one exists — a quotation built
        // off actual quantities is worth far more than one the model invented.
        const boq = await BOQ.findOne({ project_id: project._id, is_delete: 0 }).sort({ createdAt: -1 }).lean();
        const boqContext = boq
            ? `\nUse these BOQ quantities as the basis:\n` +
              boq.items.slice(0, 40).map((i) => `- ${i.material}: ${i.quantity} ${i.unit} @ ₹${i.rate}`).join("\n")
            : "";

        const system =
            "You are a professional construction quotation writer for Indian residential projects. " +
            "Return ONLY a JSON object matching: " +
            '{"summary":string,"line_items":[{"description":string,"qty":string,"rate_inr":number,' +
            '"amount_inr":number}],"subtotal_inr":number,"tax_inr":number,"total_inr":number,' +
            '"validity_days":number,"terms":[string]}';

        const prompt =
            `Generate a detailed line-item quotation for "${project.name}" at ${project.address || "site"}. ` +
            `Scope: ${scope}. Budget target: ₹${(project.budget || 0).toLocaleString("en-IN")}. ` +
            `Include GST at 18%.${boqContext}\nReturn only JSON.`;

        const out = await ai.run({
            userId,
            plan: await planOf(userId),
            cacheSeed: `quotation|${project._id}|${scope}|${boq?._id || "noboq"}`,
            system, prompt,
            structured: true,
            maxTokens: 2600,
            cache: false,     // project-specific and money-bearing — always fresh
        });

        if (!out.ok) return guardFailure(res, out);

        const artifact = await saveArtifact({
            project_id: project._id, user_id: userId, kind: "quotation",
            input: { scope, boq_id: boq?._id }, result: out.data,
        });

        await notifyProject(project._id, {
            title: "Quotation ready",
            body:  `A quotation was drafted for ${project.name}`,
            kind:  "ai",
            route: `/project/${project._id}?tab=documents`,
            excludeUserId: userId,
        });

        return ok(res, { id: artifact?._id, quotation: out.data, usage: out.usage });
    } catch (err) {
        console.error("quotation error:", err);
        return fail(res, err.status || 500, err.message || "Server error");
    }
};

/* ────────────────────────────── Vastu ───────────────────────────────── */

// POST /api/projects/:pid/ai/vastu
exports.vastu = async (req, res) => {
    try {
        const userId = callerId(req);
        const { description } = req.body;
        if (!description) return fail(res, 400, "description is required");

        const system =
            "You are a Vastu Shastra expert for Indian residential floor plans. " +
            "Return ONLY a JSON object matching: " +
            '{"score":number,"verdict":string,"positives":[string],"negatives":[string],' +
            '"suggestions":[{"area":string,"recommendation":string}],"summary":string}';

        const prompt =
            `Analyse this residential layout for Vastu compliance. Give a score out of 100, ` +
            `positives, negatives and specific improvements. Layout: ${description}. ` +
            `Consider entrance direction, kitchen (SE preferred), master bedroom (SW), ` +
            `pooja room (NE), toilets, staircase and water sources. Return only JSON.`;

        const out = await ai.run({
            userId,
            plan: await planOf(userId),
            cacheSeed: `vastu|${description}`,
            system, prompt,
            structured: true,
            maxTokens: 1800,
        });

        if (!out.ok) return guardFailure(res, out);

        const artifact = await saveArtifact({
            project_id: req.project._id, user_id: userId, kind: "vastu",
            input: { description }, result: out.data, cached: out.cached,
        });

        return ok(res, { id: artifact?._id, vastu: out.data, cached: out.cached, usage: out.usage });
    } catch (err) {
        console.error("vastu error:", err);
        return fail(res, err.status || 500, err.message || "Server error");
    }
};

/* ───────────────────────── Site analysis ────────────────────────────── */

// POST /api/projects/:pid/ai/site-analysis
exports.siteAnalysis = async (req, res) => {
    try {
        const userId  = callerId(req);
        const project = req.project;
        const visited = req.body.visited === true;

        const photoCount = await ProjectUpdate.countDocuments({
            project_id: project._id, is_delete: 0, images: { $exists: true, $ne: [] },
        });

        const system =
            "You are a senior civil site engineer. Return ONLY JSON: " +
            '{"summary":{"orientation":string,"road_position":string,"plot_size":string},' +
            '"insights":{"suggested_entrance":string,"building_orientation":string,"sunlight":string,' +
            '"ventilation":string,"drainage":string,"accessibility":string},' +
            '"recommendations":[string],"is_preliminary":boolean}';

        const prompt =
            `Project: ${project.name} at ${project.address || "unknown location"}. ` +
            `Plot: ${project.area_sqft || "unknown"} sqft, ${project.floors || 1} floor(s). ` +
            `The builder was ${visited ? "on site" : "NOT on site — this is a preliminary desk analysis"}. ` +
            `Notes: ${req.body.notes || "none"}.\n` +
            `Produce 5-10 practical recommendations covering drainage, entrance placement, ` +
            `tree preservation, debris, plinth height, material storage and vehicle access. ` +
            `Set is_preliminary to ${!visited}. Return only JSON.`;

        const out = await ai.run({
            userId,
            plan: await planOf(userId),
            cacheSeed: `site_analysis|${project._id}|${visited}|${req.body.notes || ""}`,
            system, prompt,
            structured: true,
            maxTokens: 2000,
            cache: false,
        });

        if (!out.ok) return guardFailure(res, out);

        const artifact = await saveArtifact({
            project_id: project._id, user_id: userId, kind: "site_analysis",
            input: { visited, photo_count: photoCount }, result: out.data,
            is_preliminary: !visited,
        });

        return ok(res, {
            id: artifact?._id, analysis: out.data,
            is_preliminary: !visited, photo_count: photoCount, usage: out.usage,
        });
    } catch (err) {
        console.error("siteAnalysis error:", err);
        return fail(res, err.status || 500, err.message || "Server error");
    }
};

/* ────────────────────────── Site inspection ─────────────────────────── */

// POST /api/projects/:pid/ai/inspection
exports.inspection = async (req, res) => {
    try {
        const userId  = callerId(req);
        const project = req.project;

        // Ground the inspection in the actual recent log record rather than
        // asking a text model to imagine what photos might show.
        const logs = await DailyLog.find({ project_id: project._id, is_delete: 0 })
            .sort({ log_date: -1 }).limit(7).lean();

        if (!logs.length) {
            return fail(res, 400, "Post at least one daily log before running an inspection.");
        }

        const logSummary = logs.map((l) =>
            `- ${new Date(l.log_date).toISOString().slice(0, 10)}: ${l.total_workers} workers, ` +
            `weather ${l.weather}. Work: ${l.work_done || "not recorded"}. ` +
            `Issues: ${l.issues || "none"}.`
        ).join("\n");

        const system =
            "You are a construction quality-and-safety inspector reviewing site reports. " +
            "Return ONLY JSON: " +
            '{"summary":string,"safety_issues":[string],"quality_issues":[string],' +
            '"missing_work":[string],"suggestions":[string],"risk_score":number}';

        const prompt =
            `Review the last ${logs.length} daily logs for "${project.name}" ` +
            `(${project.area_sqft || "?"} sqft, ${project.progress || 0}% complete). Focus: ` +
            `${req.body.focus || "general"}.\n${logSummary}\n` +
            `Identify safety, quality and missing-work risks, give actionable suggestions ` +
            `and a risk score 0-100 (higher = more risk). Return only JSON.`;

        const out = await ai.run({
            userId,
            plan: await planOf(userId),
            cacheSeed: `inspection|${project._id}|${logs[0]?._id}`,
            system, prompt,
            structured: true,
            maxTokens: 2000,
            cache: false,
        });

        if (!out.ok) return guardFailure(res, out);

        const artifact = await saveArtifact({
            project_id: project._id, user_id: userId, kind: "inspection",
            input: { focus: req.body.focus || "general", logs_reviewed: logs.length },
            result: out.data,
        });

        await notifyProject(project._id, {
            title: "Site inspection complete",
            body:  String(out.data?.summary || "Inspection finished").slice(0, 120),
            kind:  "ai",
            route: `/project/${project._id}`,
            excludeUserId: userId,
        });

        return ok(res, { id: artifact?._id, inspection: out.data, logs_reviewed: logs.length, usage: out.usage });
    } catch (err) {
        console.error("inspection error:", err);
        return fail(res, err.status || 500, err.message || "Server error");
    }
};

/* ────────────────────────── Progress report ─────────────────────────── */

// POST /api/projects/:pid/ai/report
exports.progressReport = async (req, res) => {
    try {
        const userId  = callerId(req);
        const project = req.project;

        const [updates, milestones, payments] = await Promise.all([
            ProjectUpdate.find({ project_id: project._id, is_delete: 0 }).sort({ createdAt: -1 }).limit(15).lean(),
            Milestone.find({ project_id: project._id, is_delete: 0 }).lean(),
            ProjectPayment.find({ project_id: project._id, is_delete: 0 }).lean(),
        ]);

        const paid    = payments.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0);
        const done    = milestones.filter((m) => m.completed).map((m) => m.title);
        const pending = milestones.filter((m) => !m.completed).map((m) => m.title);

        const context =
            `Project: ${project.name} at ${project.address || "site"}\n` +
            `Budget: ₹${(project.budget || 0).toLocaleString("en-IN")}, ` +
            `Spent: ₹${(project.spent || 0).toLocaleString("en-IN")}, Progress: ${project.progress || 0}%\n` +
            `Completed milestones: ${done.join(", ") || "none"}\n` +
            `Pending milestones: ${pending.join(", ") || "none"}\n` +
            `Payments: ${payments.length} entries, ₹${paid.toLocaleString("en-IN")} paid\n\n` +
            `Recent site updates:\n` +
            updates.map((u) => `- ${new Date(u.createdAt).toISOString().slice(0, 10)}: ${u.title} (${u.category})`).join("\n");

        const system =
            "You are a construction project manager writing a progress report FOR THE HOMEOWNER. " +
            "Write clear markdown with these sections: Executive Summary, Work Completed, " +
            "Upcoming Work, Budget & Payments, Issues & Delays, Next Steps. " +
            "Plain language, no jargon, under 500 words. Do not invent facts not present in the data.";

        const out = await ai.run({
            userId,
            plan: await planOf(userId),
            cacheSeed: `report|${project._id}|${updates[0]?._id || ""}|${project.progress}`,
            system,
            prompt: `Write the progress report from this data:\n\n${context}`,
            structured: false,
            maxTokens: 1800,
            cache: false,
        });

        if (!out.ok) return guardFailure(res, out);

        const artifact = await saveArtifact({
            project_id: project._id, user_id: userId, kind: "report",
            input: { progress: project.progress }, text: out.text,
        });

        await notifyProject(project._id, {
            title: "Progress report ready",
            body:  `A new report for ${project.name}`,
            kind:  "ai",
            route: `/project/${project._id}?tab=documents`,
            excludeUserId: userId,
        });

        return ok(res, { id: artifact?._id, content: out.text, project_name: project.name, usage: out.usage });
    } catch (err) {
        console.error("progressReport error:", err);
        return fail(res, err.status || 500, err.message || "Server error");
    }
};

/* ─────────────────── Image generation (plans) ───────────────────────── */

/**
 * Floor plans and site plans need an image model that follows instructions
 * precisely enough to render labels and dimensions. Gemini's image model is
 * called directly here — the Emergent proxy that v2 used is gone, but the
 * model choice is deliberately unchanged because FLUX (used elsewhere in this
 * codebase for interior restyling) is not reliable for dimensioned blueprints.
 */
async function _generateImage({ prompt, systemHint }) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        const e = new Error("Plan generation is not configured on the server (GEMINI_API_KEY missing).");
        e.status = 503;
        throw e;
    }
    const axios = require("axios");
    const model = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image-preview";

    const { data } = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
            contents: [{ role: "user", parts: [{ text: `${systemHint}\n\n${prompt}` }] }],
            generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
        },
        { headers: { "Content-Type": "application/json" }, timeout: 90000 }
    );

    const parts = data?.candidates?.[0]?.content?.parts || [];
    const imgPart = parts.find((p) => p.inlineData?.data);
    const textPart = parts.find((p) => p.text);
    if (!imgPart) {
        const e = new Error("The plan generator did not return an image. Please try again.");
        e.status = 502;
        throw e;
    }
    return { base64: imgPart.inlineData.data, mime: imgPart.inlineData.mimeType || "image/png", notes: textPart?.text || "" };
}

/** Upload a generated image to Cloudinary so we never store base64 in Mongo. */
async function _uploadGenerated(base64, mime, folder) {
    const { cloudinary } = require("../config");
    const uploaded = await cloudinary.uploader.upload(`data:${mime};base64,${base64}`, {
        folder,
        resource_type: "image",
    });
    return { url: uploaded.secure_url, public_id: uploaded.public_id };
}

// POST /api/projects/:pid/ai/site-plan   (builder)
exports.sitePlan = async (req, res) => {
    try {
        const userId  = callerId(req);
        const project = req.project;

        let { plot_length, plot_width } = req.body;
        if ((!plot_length || !plot_width) && project.area_sqft) {
            const s = Math.sqrt(project.area_sqft);
            plot_length = Math.round(s * 1.2 * 10) / 10;
            plot_width  = Math.round((s / 1.2) * 10) / 10;
        }
        plot_length = plot_length || 40;
        plot_width  = plot_width  || 30;

        const facing = req.body.facing || "North";
        const road   = req.body.road_position || "front (north side)";

        const quota = await ai.consumeQuota(userId, await planOf(userId));
        if (!quota.allowed) {
            return res.status(429).json({ success: false, limit_reached: true, usage: quota,
                message: `Daily AI limit of ${quota.limit} reached.` });
        }

        let gen;
        try {
            gen = await _generateImage({
                systemHint:
                    "You generate professional 2D architectural site plans (top-down blueprints). " +
                    "Clean scaled drawing, white background, clear labels, blueprint style.",
                prompt:
                    `Generate a professional 2D top-down site plan for a plot at ${project.address || "the site"}. ` +
                    `Plot: ${plot_length} ft × ${plot_width} ft. Facing: ${facing}. Road: ${road}. ` +
                    `Show (1) plot boundary with dimensions, (2) a north arrow, (3) the road labelled, ` +
                    `(4) buildable area with 5ft front, 3ft side and 5ft rear setbacks shaded, ` +
                    `(5) a scale bar, (6) the title "AI Preliminary Site Plan". ` +
                    `Notes: ${req.body.notes || "none"}. Clean, minimal, professional.`,
            });
        } catch (e) {
            await ai.refundQuota(userId);
            throw e;
        }

        const img = await _uploadGenerated(gen.base64, gen.mime, `bricksagent/projects/${project._id}/site-plans`);

        const artifact = await saveArtifact({
            project_id: project._id, user_id: userId, kind: "site_plan",
            input: { plot_length, plot_width, facing, road_position: road },
            text: gen.notes,
            image_url: img.url, image_public_id: img.public_id,
            is_preliminary: true,
        });

        return ok(res, {
            id: artifact?._id, image_url: img.url, notes: gen.notes,
            context: { plot_length, plot_width, facing, road }, usage: quota,
        }, 201);
    } catch (err) {
        console.error("sitePlan error:", err);
        return fail(res, err.status || 500, err.message || "Server error");
    }
};

// POST /api/projects/:pid/ai/floor-plan   (builder)
exports.floorPlan = async (req, res) => {
    try {
        const userId  = callerId(req);
        const project = req.project;
        const { prompt } = req.body;
        if (!prompt) return fail(res, 400, "prompt is required (describe the layout you want)");

        const quota = await ai.consumeQuota(userId, await planOf(userId));
        if (!quota.allowed) {
            return res.status(429).json({ success: false, limit_reached: true, usage: quota,
                message: `Daily AI limit of ${quota.limit} reached.` });
        }

        let gen;
        try {
            gen = await _generateImage({
                systemHint:
                    "You generate architectural residential floor plans. Output a clean top-down 2D " +
                    "floor plan with room labels and dimensions.",
                prompt:
                    `Generate a professional 2D top-down architectural floor plan (blueprint style). ` +
                    `Requirements: ${prompt}. Plot area about ${project.area_sqft || "1200"} sqft, ` +
                    `${project.floors || 1} floor(s). Include room labels, dimensions in feet, doors ` +
                    `and windows. Clean minimal style, white background.`,
            });
        } catch (e) {
            await ai.refundQuota(userId);
            throw e;
        }

        const img = await _uploadGenerated(gen.base64, gen.mime, `bricksagent/projects/${project._id}/floor-plans`);

        const artifact = await saveArtifact({
            project_id: project._id, user_id: userId, kind: "floor_plan",
            input: { prompt }, text: gen.notes,
            image_url: img.url, image_public_id: img.public_id,
        });

        await notifyProject(project._id, {
            title: "Floor plan generated",
            body:  `A new floor plan is available for ${project.name}`,
            kind:  "ai",
            route: `/project/${project._id}?tab=documents`,
            excludeUserId: userId,
        });

        return ok(res, { id: artifact?._id, image_url: img.url, notes: gen.notes, usage: quota }, 201);
    } catch (err) {
        console.error("floorPlan error:", err);
        return fail(res, err.status || 500, err.message || "Server error");
    }
};

/* ────────────────────────────── Listing ─────────────────────────────── */

// GET /api/projects/:pid/ai/artifacts?kind=floor_plan
exports.listArtifacts = async (req, res) => {
    try {
        const q = { project_id: req.project._id, is_delete: 0 };
        if (req.query.kind) q.kind = req.query.kind;

        const items = await AiArtifact.find(q).sort({ createdAt: -1 }).limit(100).lean();
        return ok(res, items);
    } catch (err) {
        console.error("listArtifacts error:", err);
        return fail(res, 500, "Server error");
    }
};
