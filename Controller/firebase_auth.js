/**
 * Sign-in backed by Firebase Phone Auth.
 *
 * ── What changes, and why it matters ─────────────────────────────────────────
 *
 * Before this, the backend minted an OTP, stored it, and checked it. That was
 * sound — but the SMS provider was retired and nothing replaced it, so the code
 * never arrived and the only way in was a master-OTP env flag that let anyone
 * who knew a phone number sign in as that person.
 *
 * Now the handset proves ownership of the number to Firebase, and hands us a
 * signed token. We verify that token against Google's keys.
 *
 * ── The one rule ─────────────────────────────────────────────────────────────
 *
 * THE PHONE NUMBER COMES FROM THE VERIFIED TOKEN. NEVER FROM THE BODY.
 *
 * `decoded.phone_number` is signed by Google and cannot be forged without
 * Google's private key. `req.body.phone` is typed by whoever made the request.
 * Reading the second one turns this endpoint into "log me in as anybody", which
 * is worse than the backdoor it replaces, because it would look like real
 * authentication while being none.
 *
 * The same rule is why /register moved here. It used to accept a phone number
 * from an unauthenticated body and, on a match with a project's client_phone,
 * attach the caller to that project — so anyone could register a stranger's
 * number and be handed their builder's contract, payments and site photos.
 */
const jwt = require("jsonwebtoken");


const User = require("../Model/User");
const fb = require("../Utils/firebase");
const { toLocal } = require("../Utils/phone");

const fail = (res, code, message) =>
    res.status(code).send({ status: code, data: null, message, error: true });

/**
 * Our own session token. Firebase proves who they are; this carries it.
 *
 * ── Thirty days, and why it is not forever ───────────────────────────────────
 *
 * The experience people expect from Uber or Swiggy — signed in until you sign
 * out — is not a token that never expires. Those apps hold a short credential
 * and a long one, and refresh silently. A JWT with no expiry that nothing can
 * revoke is permanent account access to anyone who copies it once.
 *
 * Firebase already keeps its own session alive on the device indefinitely and
 * can mint a fresh ID token whenever asked. So when this expires the app
 * exchanges a new Firebase token at /api/auth/firebase and carries on — the
 * user is never asked for a code again. Same experience, and the server keeps
 * the ability to end it.
 *
 * `epoch` is what makes ending it possible: see User.session_epoch.
 */
const sign = (user) =>
    jwt.sign(
        {
            id: user._id,
            email: user.email,
            phone: user.phone,
            isUser: user.isUser,
            epoch: user.session_epoch || 0,
        },
        process.env.SECRET,
        { expiresIn: "30d" }
    );

/**
 * Verify the Firebase ID token and return the ten-digit phone it belongs to.
 *
 * Returns { phone } on success or { error } describing the refusal. Never
 * throws — a malformed token is an expected input on a public endpoint, not an
 * exceptional one.
 */
async function phoneFromToken(idToken) {
    if (!idToken || typeof idToken !== "string") {
        return { error: "Sign-in token is missing" };
    }
    const auth = fb.getAuth();
    if (!auth) {
        // No credential configured. Refuse rather than degrade — a login that
        // stops verifying because a file is absent is the worst failure mode
        // available.
        console.error("[auth] Firebase credential unavailable; refusing login");
        return { error: "Sign-in is temporarily unavailable", code: 503 };
    }

    let decoded;
    try {
        decoded = await auth.verifyIdToken(idToken);
    } catch (e) {
        console.warn("[auth] rejected Firebase token:", e.code || e.message);
        return { error: "Sign-in token is invalid or expired" };
    }

    // Phone provider only. An ID token from a Google or email sign-in verifies
    // perfectly well and carries no phone number; accepting one would let a
    // caller past this door with no proven number at all.
    const local = toLocal(decoded.phone_number);
    if (!local) {
        return { error: "This sign-in method is not supported" };
    }
    return { phone: local, uid: decoded.uid };
}

/**
 * POST /api/auth/firebase
 *
 * The whole login. Returns the account when one exists, and `exist: false`
 * when the number is verified but new — which is the app's cue to collect a
 * name and role and call /register with the same token.
 */
exports.firebaseLogin = async (req, res) => {
    try {
        const { phone, error, code } = await phoneFromToken(req.body.idToken);
        if (error) return fail(res, code || 401, error);

        const user = await User.findOne({ phone, is_delete: 0 });
        if (!user) {
            // Verified, but no account. Tell the app what it needs to ask for
            // next, including whether a builder has already linked this number
            // to a project — see pendingLink for why that changes the screen.
            return res.send({
                status: 200,
                data: null,
                exist: false,
                phone,
                pending: await pendingLink(phone),
                message: "Number verified",
                error: false,
            });
        }

        return res.send({
            status: 200,
            data: user,
            exist: true,
            token: sign(user),
            message: "Signed in",
            error: false,
        });
    } catch (err) {
        console.error("firebaseLogin error:", err);
        return fail(res, 500, "Server error");
    }
};

/**
 * Whether a builder already named this number as their client.
 *
 * ── Why signup asks this before it asks anything ─────────────────────────────
 *
 * Registration makes the caller choose builder or home owner, and the choice is
 * not easily reversible. An owner who picks "builder" lands in an empty
 * builder's app with their house nowhere in sight, and has no way to correct it
 * themselves.
 *
 * When a builder has already typed this number into a project, we know the
 * answer. The app can preselect "home owner" and say who is expecting them,
 * which both removes the only question they can get wrong and confirms they are
 * in the right place.
 */
async function pendingLink(phone) {
    try {
        const Project = require("../Model/Project");
        const p = await Project.findOne({
            client_phone: phone,
            client_id: null,
            is_delete: 0,
        })
            .select("name builder_id")
            .populate("builder_id", "name")
            .lean();
        if (!p) return null;
        return {
            role: "client",
            project_name: p.name,
            builder_name: p.builder_id?.name || "your builder",
        };
    } catch (e) {
        // Advisory only. A failure here must not block a signup.
        console.warn("pendingLink failed (non-fatal):", e.message);
        return null;
    }
}

/**
 * POST /api/auth/firebase/register
 *
 * Creates the account for a number that has just been verified. Everything
 * except the phone number comes from the body; the phone comes from the token.
 */
exports.firebaseRegister = async (req, res) => {
    try {
        const { phone, error, code } = await phoneFromToken(req.body.idToken);
        if (error) return fail(res, code || 401, error);

        const { name, email, pincode, role, longitude, latitude } = req.body;

        if (!name || !String(name).trim()) {
            return fail(res, 400, "Name is required");
        }
        if (!["builder", "client"].includes(role)) {
            return fail(res, 400, "Choose whether you are a builder or a home owner");
        }

        const existing = await User.findOne({ phone });
        if (existing) {
            // They already have an account — hand them a session rather than an
            // error. The number is verified, so this is a returning user who
            // took the wrong branch in the app, not a conflict to complain about.
            return res.send({
                status: 200,
                data: existing,
                exist: true,
                token: sign(existing),
                message: "Signed in",
                error: false,
            });
        }

        const user = await User.create({
            name: String(name).trim(),
            phone,
            email: email || undefined,
            pincode: pincode || "000000",
            role,
            is_verified: 1,
            active: 1,
            longitude: longitude ? String(longitude) : undefined,
            latitude: latitude ? String(latitude) : undefined,
            // Builders start their trial at signup — the paywall reads this.
            ...(role === "builder"
                ? { plan: "trial", trial_started_at: new Date() }
                : {}),
        });

        if (role === "client") await attachPendingProjects(user);

        // The HTTP status is set, not just echoed in the body. They had drifted
        // apart — the body said 201 while the response carried 200 — and a
        // client that trusts the transport would have read a creation as a
        // plain sign-in.
        return res.status(201).send({
            status: 201,
            data: user,
            exist: true,
            token: sign(user),
            message: "Account created",
            error: false,
        });
    } catch (err) {
        if (err && err.code === 11000) {
            return fail(res, 409, "An account already exists for this number");
        }
        console.error("firebaseRegister error:", err);
        return fail(res, 500, "Server error");
    }
};

/**
 * Attach a new owner to every project a builder pre-linked by phone.
 *
 * The builder types their client's number when creating the project, often
 * months before that person installs anything. This is what makes the house
 * already be there on first open instead of needing an invite link.
 */
async function attachPendingProjects(user) {
    try {
        const Project = require("../Model/Project");
        const ProjectMember = require("../Model/ProjectMember");

        const pending = await Project.find({
            client_phone: user.phone,
            client_id: null,
            is_delete: 0,
        }).select("_id builder_id");

        for (const p of pending) {
            await Project.updateOne({ _id: p._id }, { $set: { client_id: user._id } });
            await ProjectMember.updateOne(
                { project_id: p._id, user_id: user._id, role: "client" },
                {
                    $set: {
                        status: "active",
                        invited_by: p.builder_id,
                        accepted_at: new Date(),
                        ...ProjectMember.defaultCapabilities("client"),
                    },
                },
                { upsert: true }
            );
        }
    } catch (e) {
        // The account is already made; failing to link must not undo that.
        console.error("attachPendingProjects failed (non-fatal):", e.message);
    }
}

/**
 * POST /api/auth/signout — end this account's sessions for real.
 *
 * Two things have to happen, and doing only one leaves a way back in:
 *
 *   1. Raise session_epoch, which makes every JWT already issued stale.
 *   2. Revoke the Firebase refresh tokens, or the handset would simply mint a
 *      fresh ID token and exchange it for a new JWT without anyone typing
 *      anything — silent re-login is the whole point of the design, and it
 *      works just as well for whoever is holding a stolen phone.
 *
 * `all_devices` is the difference between signing out here and signing out
 * everywhere. Both raise the epoch today because the epoch is per account;
 * per-device revocation would need a session table, which is not worth adding
 * until someone actually asks to see their active devices.
 */
exports.signOut = async (req, res) => {
    try {
        const id = req.user && (req.user.id || req.user._id);
        if (!id) return fail(res, 401, "Not signed in");

        const user = await User.findByIdAndUpdate(
            id,
            { $inc: { session_epoch: 1 } },
            { new: true }
        );
        if (!user) return fail(res, 404, "Account not found");

        // Firebase keeps its own session on the device. Leaving it alive means
        // the app can silently obtain a new token and undo this.
        try {
            const auth = fb.getAuth();
            if (auth && req.body && req.body.firebase_uid) {
                await auth.revokeRefreshTokens(String(req.body.firebase_uid));
            }
        } catch (e) {
            // The epoch bump already ended our own sessions; a failure to reach
            // Google must not report the sign-out as failed.
            console.warn("signOut: Firebase revoke failed (non-fatal):", e.message);
        }

        return res.send({
            status: 200,
            data: null,
            message: "Signed out",
            error: false,
        });
    } catch (err) {
        console.error("signOut error:", err);
        return fail(res, 500, "Server error");
    }
};

module.exports.phoneFromToken = phoneFromToken;
