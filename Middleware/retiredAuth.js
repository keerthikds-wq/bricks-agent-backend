/**
 * Closes retired auth doors by shape rather than by name.
 *
 * The first attempt at this retired `/seller/login`, `/builder/login` and
 * `/masonry/login` from a hand-written list. The list was correct and still
 * useless: every one of those routers also exposed `/sign-up`, and
 * `/builder/sign-up` went on creating accounts and signing 3-day JWTs — with no
 * OTP anywhere in the flow — for as long as the list went unread. Enumerating
 * doors only closes the ones you remember.
 *
 * So this matches the shape of an auth path instead. Anything on a retired silo
 * that looks like a way to sign in, sign up, or recover an account is answered
 * 410, whether or not anyone thought to list it. New doors added to a legacy
 * router in future are closed on arrival.
 *
 * Non-auth routes on those routers are untouched: `/builder/nearby`,
 * `/masonry/:id` and the FCM token endpoints still work, because they do not
 * look like auth. That is the point of matching shape — it separates the doors
 * from the rest of the building.
 *
 * 410 (Gone) rather than 404: an install already on someone's phone should be
 * told the door moved, not that the server is broken.
 */

const AUTH_DOOR =
    /(^|\/)(login|log-in|signin|sign-in|signup|sign-up|register|otp-verify|otpverify|verify-otp|email-verify|forgot-password|reset-password|change-password)(\/|$)/i;

const normalise = (p) => ('/' + String(p || '').replace(/^\/+|\/+$/g, '')).toLowerCase();

/**
 * @param {object}   [opts]
 * @param {string[]} [opts.except] Paths (relative to the mount point) that stay
 *                                 open — the doors the current app actually uses.
 */
function retireAuthDoors({ except = [] } = {}) {
    const allow = new Set(except.map(normalise));

    return function retiredAuthGuard(req, res, next) {
        const path = normalise(req.path);
        if (allow.has(path)) return next();
        if (!AUTH_DOOR.test(path)) return next();

        return res.status(410).send({
            status: 410,
            error: true,
            moved_to: '/api/auth/login',
            message:
                'Separate logins have been replaced by a single Bricks Agent account. ' +
                'Please update the app and sign in with your phone number.',
        });
    };
}

module.exports = { retireAuthDoors, AUTH_DOOR };
