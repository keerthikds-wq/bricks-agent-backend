const Project = require("../Model/Project");

/**
 * Builder subscription — the only paid role in the merged app.
 *
 * Ported from Bricks_agent_v2 (routers/subscription.py + deps.py), with the
 * plan catalogue kept identical so the pricing already designed there carries
 * over. Clients, field staff and vendors are always "active" and never billed;
 * they get value through the builder who invited them.
 *
 * Payment itself goes through the LIVE Razorpay integration already in this
 * codebase — v2's version generated fake order ids and skipped signature
 * verification entirely.
 */

const TRIAL_DAYS = 7;

const PLANS = {
    trial:   { key: "trial",   label: "Free Trial", price_inr: 0,   max_projects: 3, duration_days: TRIAL_DAYS },
    starter: { key: "starter", label: "Starter",    price_inr: 699, max_projects: 3, duration_days: 30 },
    pro:     { key: "pro",     label: "Pro",        price_inr: 999, max_projects: 5, duration_days: 30 },
};

const BASE_FEATURES = [
    "AI site plan, floor plan & Vastu check",
    "BOQ + cost estimation & quotations",
    "Unlimited clients, site staff & vendors",
    "Live project feed & progress reports",
    "WhatsApp invites and PDF sharing",
];

function featuresFor(key) {
    if (key === "trial") return [`Full access, free for ${TRIAL_DAYS} days`, ...BASE_FEATURES.slice(0, 3)];
    if (key === "pro")   return [...BASE_FEATURES, "Priority AI processing", "Higher daily AI limits"];
    return BASE_FEATURES;
}

/** Public plan catalogue for the paywall screen. */
function publicPlans() {
    return Object.values(PLANS).map((p) => ({
        ...p,
        max_projects: p.max_projects,
        features: featuresFor(p.key),
    }));
}

/**
 * Effective subscription state for a user.
 * Non-builders are always active and unlimited — they never see a paywall.
 */
async function getStatus(user) {
    if (!user) return null;

    if (user.role !== "builder") {
        return {
            role: user.role,
            plan: "free",
            status: "active",
            days_remaining: null,
            max_projects: null,
            projects_used: 0,
            can_create_project: true,
            expires_at: null,
        };
    }

    const now = new Date();
    let plan = user.plan || "trial";
    let expiresAt = user.plan_expires_at ? new Date(user.plan_expires_at) : null;

    // No paid plan yet: derive the trial window from signup.
    if (plan === "trial" || plan === "free") {
        plan = "trial";
        const started = user.trial_started_at ? new Date(user.trial_started_at) : new Date(user.createdAt || now);
        expiresAt = new Date(started.getTime() + TRIAL_DAYS * 86400000);
    }

    if (!expiresAt || isNaN(expiresAt.getTime())) expiresAt = now;

    const msLeft = expiresAt.getTime() - now.getTime();
    const isActive = msLeft > 0;
    const limits = PLANS[plan] || PLANS.trial;

    const projectsUsed = await Project.activeCountForBuilder(user._id);

    return {
        role: "builder",
        plan,
        status: isActive ? "active" : "expired",
        days_remaining: Math.max(0, Math.ceil(msLeft / 86400000)),
        max_projects: limits.max_projects,
        projects_used: projectsUsed,
        can_create_project: isActive && projectsUsed < limits.max_projects,
        expires_at: expiresAt,
    };
}

/**
 * Express guard for actions gated behind an active builder plan.
 * Returns 402 (Payment Required) so the app can route straight to the paywall.
 */
function requireActivePlan(action = "create_project") {
    return async (req, res, next) => {
        try {
            const User = require("../Model/User");
            const user = await User.findById(req.user.id || req.user._id);
            if (!user) {
                return res.status(401).json({ status: 401, message: "User not found", error: true });
            }
            if (user.role !== "builder") {
                return res.status(403).json({ status: 403, message: "Only builders can perform this action.", error: true });
            }

            const status = await getStatus(user);

            if (status.status !== "active") {
                return res.status(402).json({
                    status: 402, error: true, paywall: true, reason: "expired",
                    message: "Your plan has expired. Subscribe to continue managing projects.",
                    subscription: status, plans: publicPlans(),
                });
            }
            if (action === "create_project" && !status.can_create_project) {
                return res.status(402).json({
                    status: 402, error: true, paywall: true, reason: "limit",
                    message: `Your ${PLANS[status.plan].label} plan allows ${status.max_projects} active projects. Upgrade to add more.`,
                    subscription: status, plans: publicPlans(),
                });
            }

            req.builderUser   = user;
            req.subscription  = status;
            return next();
        } catch (err) {
            console.error("requireActivePlan error:", err);
            return res.status(500).json({ status: 500, message: "Server error", error: true });
        }
    };
}

module.exports = { PLANS, TRIAL_DAYS, publicPlans, getStatus, requireActivePlan, limitsFor: (p) => PLANS[p] || PLANS.trial };
