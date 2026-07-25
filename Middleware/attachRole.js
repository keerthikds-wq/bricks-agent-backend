const User = require("../Model/User");

/**
 * Guarantees `req.user.role` is populated.
 *
 * WHY THIS EXISTS
 * The login controllers mint tokens shaped { id, phone, email, isUser|isBuilder }
 * — there is no `role` claim. Every builder-centric feature keys off
 * `req.user.role`, so without this middleware:
 *
 *   • the dashboard reported every caller as "client", so builders lost their
 *     subscription block and FIELD STAFF WERE SHOWN THE PROJECT BUDGET;
 *   • vendorAuth rejected genuine suppliers, making it impossible to quote.
 *
 * Caught by the end-to-end harness, not by static analysis — the token shape
 * only matters once a real request is signed.
 *
 * WHY NOT JUST PUT `role` IN THE TOKEN
 * It was tempting, and it would save a query. But acceptInvite mutates
 * user.role — a client who accepts a site-engineer invite changes role mid
 * session. A role baked into a 3-day token would be stale for up to three days
 * afterwards, granting or denying the wrong things. The record is the single
 * source of truth; one indexed findById on the builder-centric routes is the
 * right price for that. The `req.user.role` fast path below still short
 * circuits if some future caller does supply it.
 */
module.exports = async function attachRole(req, res, next) {
    try {
        if (!req.user) return next();

        // Fast path — token already carries a usable role.
        if (req.user.role) return next();

        const id = req.user.id || req.user._id;
        if (!id) return next();

        const u = await User.findById(id).select("role staff_type plan").lean();
        if (u) {
            req.user.role = u.role || "client";
            req.user.staff_type = u.staff_type || null;
            req.user.plan = u.plan || "free";
        } else {
            // Token references a user that no longer exists. Leave role unset;
            // downstream project access will 403 rather than silently granting
            // the "client" default.
            req.user.role = null;
        }
        return next();
    } catch (err) {
        console.error("attachRole error (non-fatal):", err.message);
        return next();
    }
};
