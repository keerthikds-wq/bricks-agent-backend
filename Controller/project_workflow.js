const Project         = require("../Model/Project");
const ProjectUpdate   = require("../Model/ProjectUpdate");
const ProjectPayment  = require("../Model/ProjectPayment");
const Approval        = require("../Model/Approval");
const DailyLog        = require("../Model/DailyLog");
const BOQ             = require("../Model/BOQ");
const RFQ             = require("../Model/RFQ");
const HomeDesign      = require("../Model/HomeDesign");
const VendorLink      = require("../Model/VendorLink");
const AiArtifact      = require("../Model/AiArtifact");

const { callerId } = require("../Middleware/projectAccess");

const ok   = (res, data) => res.status(200).json({ success: true, data });
const fail = (res, s, m) => res.status(s).json({ success: false, message: m });

/**
 * AI workflow orchestration — "what should I do next on this project?"
 *
 * Ported from Bricks_agent_v2 (routers/workflow.py) and extended with the two
 * stages the merged app gains from the live codebase: a deterministic BOQ
 * (rather than v2's AI-only estimate) and vendor RFQ procurement.
 *
 * It never blocks anything. It only ever recommends the highest-value next
 * step, and it answers differently depending on who is asking.
 */

const has = async (Model, query) => (await Model.countDocuments(query).limit(1)) > 0;

exports.getWorkflow = async (req, res) => {
    try {
        const project = req.project;
        const pid     = project._id;
        const role    = req.projectRole;

        const [
            hasSitePlan, hasFloorPlan, hasVastu, hasSiteAnalysis, hasInspection, hasReport,
            hasBoq, hasRfq, hasVendors, hasUpdates, hasDailyLog, hasPhotos, hasDesign,
        ] = await Promise.all([
            has(AiArtifact, { project_id: pid, kind: "site_plan" }),
            has(AiArtifact, { project_id: pid, kind: "floor_plan" }),
            has(AiArtifact, { project_id: pid, kind: "vastu" }),
            has(AiArtifact, { project_id: pid, kind: "site_analysis" }),
            has(AiArtifact, { project_id: pid, kind: "inspection" }),
            has(AiArtifact, { project_id: pid, kind: "report" }),
            has(BOQ,        { project_id: pid, is_delete: 0 }),
            has(RFQ,        { project_id: pid, is_delete: 0 }),
            has(VendorLink, { builder_id: project.builder_id, status: "active" }),
            has(ProjectUpdate, { project_id: pid, is_delete: 0 }),
            has(DailyLog,      { project_id: pid, is_delete: 0 }),
            has(ProjectUpdate, { project_id: pid, is_delete: 0, images: { $exists: true, $ne: [] } }),
            has(HomeDesign,    { project_id: pid }),
        ]);

        const hasLocation = Boolean(project.address);
        const hasPlot     = Boolean(project.area_sqft);

        const stages = [
            { key: "location",      label: "Location",            phase: "Planning",     done: hasLocation,     deps: [] },
            { key: "plot",          label: "Plot dimensions",     phase: "Planning",     done: hasPlot,         deps: [] },
            { key: "site_plan",     label: "Site plan",           phase: "Planning",     done: hasSitePlan,     deps: ["location", "plot"] },
            { key: "site_visit",    label: "Site photos",         phase: "Planning",     done: hasPhotos,       deps: ["location"] },
            { key: "site_analysis", label: "Site analysis",       phase: "Planning",     done: hasSiteAnalysis, deps: ["site_visit"] },
            { key: "floor_plan",    label: "Floor plan",          phase: "Design",       done: hasFloorPlan,    deps: ["plot"] },
            { key: "home_design",   label: "Interior design",     phase: "Design",       done: hasDesign,       deps: ["floor_plan"], optional: true },
            { key: "vastu",         label: "Vastu check",         phase: "Design",       done: hasVastu,        deps: ["floor_plan"], optional: true },
            { key: "boq",           label: "BOQ & estimate",      phase: "Estimation",   done: hasBoq,          deps: ["plot"] },
            { key: "vendors",       label: "Vendor roster",       phase: "Procurement",  done: hasVendors,      deps: [] },
            { key: "rfq",           label: "Material RFQs",       phase: "Procurement",  done: hasRfq,          deps: ["boq", "vendors"] },
            { key: "construction",  label: "Construction started",phase: "Construction", done: hasUpdates,      deps: ["boq"] },
            { key: "daily_logs",    label: "Daily logs",          phase: "Construction", done: hasDailyLog,     deps: ["construction"] },
            { key: "inspection",    label: "Site inspection",     phase: "Construction", done: hasInspection,   deps: ["site_visit", "construction"] },
            { key: "reports",       label: "Progress reports",    phase: "Construction", done: hasReport,       deps: ["daily_logs"] },
        ];

        const ACTIONS = {
            location:      { title: "Add the project location",     cta: "Add location",       why: "Location drives site analysis, local material rates and Vastu.",       route: `/project/${pid}?edit=details`,             icon: "location" },
            plot:          { title: "Add plot dimensions",          cta: "Add dimensions",     why: "The BOQ, floor plan and site plan all need the plot size.",           route: `/project/${pid}?edit=details`,             icon: "resize" },
            site_plan:     { title: "Generate the site plan",       cta: "Generate site plan", why: "A scaled site plan with setbacks is the base for everything after.",   route: `/project/${pid}/ai/site-plan`,             icon: "map" },
            site_visit:    { title: "Capture site photos",          cta: "Add photos",         why: "Photos let AI run site analysis and give the owner something to see.", route: `/project/${pid}?tab=feed&action=photo`,   icon: "camera" },
            site_analysis: { title: "Run site analysis",            cta: "Analyse site",       why: "Get drainage, access, orientation and plinth recommendations.",       route: `/project/${pid}/ai/site-analysis`,         icon: "analytics" },
            floor_plan:    { title: "Generate the floor plan",      cta: "Generate plan",      why: "Needed before interior design, Vastu and an accurate BOQ.",           route: `/project/${pid}/ai/floor-plan`,            icon: "grid" },
            home_design:   { title: "Design the interiors",         cta: "Open home design",   why: "Room-by-room finishes and an interior budget the owner can approve.", route: `/project/${pid}/home-design`,              icon: "color-palette" },
            vastu:         { title: "Check Vastu compliance",       cta: "Check Vastu",        why: "Vastu issues are cheap to fix now and expensive after casting.",      route: `/project/${pid}/ai/vastu`,                 icon: "compass" },
            boq:           { title: "Build the BOQ",                cta: "Open BOQ",           why: "Turns area and spec into material quantities and a real budget.",     route: `/project/${pid}/boq`,                      icon: "calculator" },
            vendors:       { title: "Add your material vendors",    cta: "Add vendors",        why: "RFQs go to your own trusted suppliers, not a public marketplace.",    route: `/vendors`,                                 icon: "people" },
            rfq:           { title: "Send material RFQs",           cta: "Raise RFQ",          why: "Get competing prices from your vendors straight off the BOQ.",        route: `/project/${pid}/rfq/new`,                  icon: "pricetags" },
            construction:  { title: "Start construction",           cta: "Post first update",  why: "Your first site update — the owner sees it the moment you post.",     route: `/project/${pid}?tab=feed&action=add`,     icon: "construct" },
            daily_logs:    { title: "Post today's daily log",       cta: "Post daily log",     why: "Labour, materials and weather — keeps everyone honest and in sync.",  route: `/project/${pid}?tab=feed&action=daily_log`, icon: "clipboard" },
            inspection:    { title: "Run an AI site inspection",    cta: "Run inspection",     why: "AI reviews your site photos for safety and quality issues.",          route: `/project/${pid}/ai/inspection`,            icon: "shield-checkmark" },
            reports:       { title: "Generate a progress report",   cta: "Generate report",    why: "One tap to send the owner a professional update.",                    route: `/project/${pid}/ai/report`,                icon: "reader" },
        };

        const byKey = (k) => stages.find((s) => s.key === k);

        // First non-optional incomplete stage, redirected to its first unmet dep.
        const firstPending = () => {
            for (const s of stages) {
                if (s.done || s.optional) continue;
                for (const d of s.deps || []) {
                    const dep = byKey(d);
                    if (dep && !dep.done) return d;
                }
                return s.key;
            }
            return null;
        };

        let nextAction;

        if (role === "client") {
            // The owner is not executing the build — surface decisions instead.
            const [pendingApprovals, pendingPayments] = await Promise.all([
                Approval.countDocuments({ project_id: pid, status: "pending", is_delete: 0 }),
                ProjectPayment.countDocuments({ project_id: pid, status: "pending", is_delete: 0 }),
            ]);

            if (pendingApprovals > 0) {
                nextAction = { stage: "approve", title: "Items are waiting on your approval", cta: "Review approvals", why: "Your builder has raised changes that need a decision.", route: `/project/${pid}?tab=approvals`, icon: "checkmark-circle" };
            } else if (pendingPayments > 0) {
                nextAction = { stage: "pay", title: "A payment is due", cta: "Open payments", why: "Review and settle when you're ready.", route: `/project/${pid}?tab=payments`, icon: "card" };
            } else {
                nextAction = { stage: "watch", title: "Follow your build live", cta: "Open project", why: "You'll be notified the moment there's a site update.", route: `/project/${pid}?tab=feed`, icon: "eye" };
            }
        } else if (role === "field_staff") {
            // Site staff care about today's work, not the planning chain.
            const key = !hasPhotos ? "site_visit"
                      : !hasDailyLog ? "daily_logs"
                      : !hasUpdates ? "construction"
                      : "daily_logs";
            nextAction = { stage: key, ...ACTIONS[key] };
        } else if (role === "vendor") {
            nextAction = { stage: "quote", title: "Check open material requests", cta: "View RFQs", why: "Quote fast — the builder usually picks within a day.", route: `/rfq/feed`, icon: "pricetags" };
        } else {
            const key = firstPending();
            nextAction = key
                ? { stage: key, ...ACTIONS[key] }
                : { stage: "complete", title: "Ready for handover", cta: "Open project", why: "Every planning, design and construction stage is ticked.", route: `/project/${pid}`, icon: "trophy" };
        }

        const doneCount = stages.filter((s) => s.done).length;
        const phasePct = (phase) => {
            const items = stages.filter((s) => s.phase === phase);
            return items.length ? Math.round((items.filter((s) => s.done).length * 100) / items.length) : 0;
        };

        const planning = phasePct("Planning");
        const design   = phasePct("Design");
        const procure  = phasePct("Procurement");
        const construction = phasePct("Construction");

        let narration;
        if (role === "client") {
            narration = nextAction.stage === "approve" ? "Something needs your input — take a quick look."
                      : nextAction.stage === "pay"     ? "A payment is waiting whenever you're ready."
                      : construction >= 50             ? `Construction is ${construction}% underway.`
                      : design >= 50                   ? "Design is progressing — site updates start soon."
                      : "Planning is in motion. You'll be notified at every milestone.";
        } else if (doneCount === 0) {
            narration = "Fresh project — let's get the basics in.";
        } else if (doneCount === stages.length) {
            narration = "Everything's ticked. Congratulations on closing the loop.";
        } else {
            const lastDone = [...stages].reverse().find((s) => s.done);
            narration = `${lastDone ? lastDone.label + " is done." : ""} Next up: ${nextAction.title.toLowerCase()}.`.trim();
        }

        return ok(res, {
            project_id:   pid,
            project_name: project.name,
            my_role:      role,
            stages,
            next_action:  nextAction,
            narration,
            done_count:   doneCount,
            total_count:  stages.length,
            progress_pct: Math.round((doneCount * 100) / stages.length),
            phase_progress: { planning, design, procurement: procure, construction },
        });
    } catch (err) {
        console.error("getWorkflow error:", err);
        return fail(res, 500, "Server error");
    }
};
