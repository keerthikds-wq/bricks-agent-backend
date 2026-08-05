/**
 * The one place the Firebase admin credential is resolved.
 *
 * ── Why this is not `require("./config.json")` any more ──────────────────────
 *
 * It used to be. That file held a service-account PRIVATE KEY and was committed
 * to a public repository, where it stayed until the service account behind it
 * was deleted. The deletion is what actually defused it — not anything in this
 * codebase — and it took FCM down with it: `initializeApp` does not contact
 * Google, so `_fcmReady` went true and every `send()` afterwards failed against
 * an account that no longer existed. Push was dead for months and nothing said
 * so, because the failure was caught and logged at debug level.
 *
 * Two changes follow from that:
 *
 *   1. The credential comes from the environment first, so the secret lives in
 *      Render's config rather than in a file somebody can commit.
 *   2. Readiness is proven by fetching an access token, not by constructing an
 *      object. A credential that cannot authenticate now reports itself at
 *      startup instead of silently swallowing every notification.
 *
 * Resolution order:
 *   FIREBASE_SERVICE_ACCOUNT   the JSON itself, as a string  (Render)
 *   FIREBASE_SERVICE_ACCOUNT_PATH   a path to the JSON       (explicit local)
 *   ./*-firebase-adminsdk-*.json    whatever is in the repo root, gitignored
 */
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const ROOT = path.join(__dirname, "..");

function _readServiceAccount() {
    const inline = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (inline && inline.trim().startsWith("{")) {
        return { source: "FIREBASE_SERVICE_ACCOUNT", json: JSON.parse(inline) };
    }

    const explicit = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    if (explicit && fs.existsSync(explicit)) {
        return {
            source: explicit,
            json: JSON.parse(fs.readFileSync(explicit, "utf8")),
        };
    }

    // Whatever admin-SDK key is sitting in the repo root. Matched by pattern
    // rather than by name so a freshly downloaded key works with no config —
    // the same pattern .gitignore uses, so anything this finds is already
    // excluded from commits.
    const found = fs
        .readdirSync(ROOT)
        .filter((f) => /-firebase-adminsdk-.*\.json$/.test(f))
        .sort();
    if (found.length) {
        const p = path.join(ROOT, found[found.length - 1]);
        return { source: found[found.length - 1], json: JSON.parse(fs.readFileSync(p, "utf8")) };
    }

    return null;
}

let _app = null;
let _state = "unchecked";

/** The initialised admin app, or null when no usable credential exists. */
function getApp() {
    if (_state !== "unchecked") return _app;
    _state = "checking";

    try {
        const sa = _readServiceAccount();
        if (!sa) {
            _state = "missing";
            console.warn(
                "[firebase] no service account found — push notifications and " +
                "Firebase token verification are disabled. Set " +
                "FIREBASE_SERVICE_ACCOUNT or drop a *-firebase-adminsdk-*.json " +
                "in the repo root."
            );
            return null;
        }

        _app = admin.apps.length
            ? admin.app()
            : admin.initializeApp({ credential: admin.credential.cert(sa.json) });
        _state = "ready";
        console.log(
            `[firebase] credential loaded from ${sa.source} ` +
            `(project ${sa.json.project_id})`
        );
    } catch (e) {
        _state = "failed";
        console.error("[firebase] credential could not be loaded:", e.message);
    }
    return _app;
}

/**
 * Proves the credential can actually authenticate.
 *
 * Called once at startup. This is the check whose absence let a deleted service
 * account look healthy — constructing the credential succeeds offline, so only
 * asking for a token reveals that the account behind it is gone.
 */
async function verifyAtStartup() {
    const app = getApp();
    if (!app) return false;
    try {
        await app.options.credential.getAccessToken();
        console.log("[firebase] credential authenticated — push is live");
        return true;
    } catch (e) {
        console.error(
            `[firebase] CREDENTIAL REJECTED (${e.message}). Push notifications ` +
            "and Firebase login will fail until this is replaced."
        );
        return false;
    }
}

module.exports = { getApp, verifyAtStartup };
