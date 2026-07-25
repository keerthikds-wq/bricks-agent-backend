const express = require("express");
const router  = express.Router();

const ctrl     = require("../Controller/project");
const collab   = require("../Controller/project_collab");
const workflow = require("../Controller/project_workflow");
const ai       = require("../Controller/project_ai");

const { verifyTokenwithAuthorization } = require("../Middleware");
const { projectAccess, requireCapability } = require("../Middleware/projectAccess");
const { requireActivePlan } = require("../Utils/subscription");
const attachRole = require("../Middleware/attachRole");

// attachRole is not optional: login tokens carry no `role` claim, and every
// role-shaped response below depends on one. See Middleware/attachRole.js.
const Auth = [verifyTokenwithAuthorization, attachRole];

/**
 * Project routes — the builder-centric core.
 *
 * Every :pid route goes through projectAccess(...), which resolves the
 * caller's role ON THAT PROJECT and rejects anyone unlinked. Controllers never
 * re-check ownership.
 */

/* ── Invites (must precede /:pid so "invite" isn't parsed as an id) ────── */
router.get ("/invite/:token",              ctrl.inviteInfo);                 // public preview
router.post("/invite/:token/accept", Auth, ctrl.acceptInvite);

/* ── Collections ──────────────────────────────────────────────────────── */
router.get ("/dashboard", Auth, ctrl.dashboard);
router.get ("/",          Auth, ctrl.listProjects);
router.post("/",          Auth, requireActivePlan("create_project"), ctrl.createProject);

/* ── Single project ───────────────────────────────────────────────────── */
router.get   ("/:pid",              Auth, projectAccess("any"),     ctrl.getProject);
router.patch ("/:pid",              Auth, projectAccess("builder"), ctrl.updateProject);
router.delete("/:pid",              Auth, projectAccess("builder"), ctrl.deleteProject);
router.put   ("/:pid/phase/:index", Auth, projectAccess("builder", "field_staff"),
                                          requireCapability("can_log_progress"), ctrl.updatePhase);

/* ── Workflow ─────────────────────────────────────────────────────────── */
router.get("/:pid/workflow", Auth, projectAccess("any"), workflow.getWorkflow);

/* ── Members ──────────────────────────────────────────────────────────── */
router.get   ("/:pid/members",           Auth, projectAccess("any"),     ctrl.listMembers);
router.post  ("/:pid/invite",            Auth, projectAccess("builder"), ctrl.createInvite);
router.patch ("/:pid/members/:memberId", Auth, projectAccess("builder"), ctrl.updateMember);
router.delete("/:pid/members/:memberId", Auth, projectAccess("builder"), ctrl.removeMember);

/* ── Feed ─────────────────────────────────────────────────────────────── */
router.get ("/:pid/updates", Auth, projectAccess("any"), collab.listUpdates);
router.post("/:pid/updates", Auth, projectAccess("builder", "field_staff"),
                                   requireCapability("can_log_progress"), collab.addUpdate);

/* ── Milestones ───────────────────────────────────────────────────────── */
router.get  ("/:pid/milestones",             Auth, projectAccess("any"),     collab.listMilestones);
router.post ("/:pid/milestones",             Auth, projectAccess("builder"), collab.addMilestone);
router.patch("/:pid/milestones/:mid/toggle", Auth, projectAccess("builder", "field_staff"),
                                                   requireCapability("can_log_progress"), collab.toggleMilestone);

/* ── Payments (finance-gated) ─────────────────────────────────────────── */
router.get  ("/:pid/payments",                 Auth, projectAccess("builder", "client"),
                                                     requireCapability("can_view_finance"), collab.listPayments);
router.post ("/:pid/payments",                 Auth, projectAccess("builder"), collab.addPayment);
router.patch("/:pid/payments/:payId/mark-paid",Auth, projectAccess("builder"), collab.markPaid);

/* ── Approvals ────────────────────────────────────────────────────────── */
router.get  ("/:pid/approvals",             Auth, projectAccess("any"), collab.listApprovals);
router.post ("/:pid/approvals",             Auth, projectAccess("builder", "client", "field_staff"), collab.createApproval);
router.patch("/:pid/approvals/:aid/decide", Auth, projectAccess("builder", "client", "field_staff"), collab.decideApproval);

/* ── Documents ────────────────────────────────────────────────────────── */
router.get   ("/:pid/documents",        Auth, projectAccess("any"),     collab.listDocuments);
router.post  ("/:pid/documents",        Auth, projectAccess("builder", "field_staff"), collab.addDocument);
router.delete("/:pid/documents/:docId", Auth, projectAccess("builder"), collab.deleteDocument);

/* ── Daily logs ───────────────────────────────────────────────────────── */
router.get ("/:pid/daily-logs", Auth, projectAccess("any"), collab.listDailyLogs);
router.post("/:pid/daily-logs", Auth, projectAccess("builder", "field_staff"),
                                      requireCapability("can_log_progress"), collab.addDailyLog);

/* ── AI suite (builder drives; everyone can read the artifacts) ───────── */
router.get ("/:pid/ai/artifacts",     Auth, projectAccess("any"),     ai.listArtifacts);
router.post("/:pid/ai/cost-estimate", Auth, projectAccess("builder"), ai.costEstimate);
router.post("/:pid/ai/quotation",     Auth, projectAccess("builder"), ai.quotation);
router.post("/:pid/ai/vastu",         Auth, projectAccess("builder", "client"), ai.vastu);
router.post("/:pid/ai/site-analysis", Auth, projectAccess("builder", "field_staff"), ai.siteAnalysis);
router.post("/:pid/ai/inspection",    Auth, projectAccess("builder", "field_staff"), ai.inspection);
router.post("/:pid/ai/report",        Auth, projectAccess("builder"), ai.progressReport);
router.post("/:pid/ai/site-plan",     Auth, projectAccess("builder"), ai.sitePlan);
router.post("/:pid/ai/floor-plan",    Auth, projectAccess("builder"), ai.floorPlan);

module.exports = router;
