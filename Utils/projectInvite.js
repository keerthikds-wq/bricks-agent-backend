const jwt = require("jsonwebtoken");

/**
 * Invite links — how everyone becomes builder-linked.
 *
 * Ported from Bricks_agent_v2 (routers/projects.py). Stateless JWT: the token
 * carries everything needed to create the ProjectMember row on accept, so
 * there's no pending-invite collection to garbage-collect.
 *
 * Flow:
 *   1. Builder generates a link          → POST /api/projects/:pid/invite
 *   2. Builder shares it on WhatsApp     → the returned `message` is prefilled
 *   3. Recipient opens it, does OTP login → POST /api/projects/invite/:token/accept
 *   4. ProjectMember row created, they're in
 *
 * Vendor invites are builder-scoped rather than project-scoped, so they carry
 * no project_id — see `createVendorInvite`.
 */

const INVITE_TTL_DAYS = 14;

function _secret() {
    const s = process.env.SECRET;
    if (!s) throw new Error("SECRET is not configured — cannot sign invite tokens");
    return s;
}

/** Project-scoped invite: client or field_staff. */
function createProjectInvite({ projectId, role, staffType = null, trade = "", invitedBy, phone = "" }) {
    return jwt.sign(
        {
            purpose:    "project_invite",
            project_id: String(projectId),
            role,
            staff_type: staffType,
            trade,
            invited_by: String(invitedBy),
            phone,
        },
        _secret(),
        { expiresIn: `${INVITE_TTL_DAYS}d` }
    );
}

/** Builder-scoped invite: vendor joins the roster, not a single project. */
function createVendorInvite({ builderId, supplies = [], displayName = "", phone = "" }) {
    return jwt.sign(
        {
            purpose:      "vendor_invite",
            builder_id:   String(builderId),
            supplies,
            display_name: displayName,
            phone,
        },
        _secret(),
        { expiresIn: `${INVITE_TTL_DAYS}d` }
    );
}

/**
 * Verify and decode. Throws an Error with a `.status` so controllers can
 * surface a clean message instead of a raw JWT error.
 */
function decodeInvite(token, expectedPurpose) {
    let payload;
    try {
        payload = jwt.verify(token, _secret());
    } catch (err) {
        const e = new Error(
            err.name === "TokenExpiredError"
                ? "This invite link has expired. Ask the builder to send a fresh one."
                : "This invite link is not valid."
        );
        e.status = 400;
        throw e;
    }
    if (expectedPurpose && payload.purpose !== expectedPurpose) {
        const e = new Error("This invite link is not valid.");
        e.status = 400;
        throw e;
    }
    return payload;
}

const ROLE_LABEL = {
    client:        "the project owner",
    field_staff:   "site staff",
    site_engineer: "the site engineer",
    supervisor:    "the site supervisor",
    mason:         "a mason",
    contractor:    "a contractor",
    vendor:        "a material supplier",
};

/** Human label used in the WhatsApp message. */
function roleLabel(role, staffType) {
    return ROLE_LABEL[staffType] || ROLE_LABEL[role] || "a team member";
}

/** Build the deep link + prefilled WhatsApp text. */
function buildInviteMessage({ token, inviterName, projectName, role, staffType, isVendor = false }) {
    const base = (process.env.APP_INVITE_BASE_URL || "https://bricksagent.app").replace(/\/+$/, "");
    const url  = `${base}/invite/${token}`;
    const who  = roleLabel(role, staffType);

    const message = isVendor
        ? `Hi! ${inviterName} has added you as ${who} on BricksAgent. ` +
          `Tap to accept and start receiving their material requests: ${url}`
        : `Hi! ${inviterName} has invited you to join "${projectName}" on BricksAgent as ${who}. ` +
          `Tap to accept and follow the project live: ${url}`;

    return { url, message, whatsapp_url: `https://wa.me/?text=${encodeURIComponent(message)}` };
}

module.exports = {
    createProjectInvite,
    createVendorInvite,
    decodeInvite,
    buildInviteMessage,
    roleLabel,
    INVITE_TTL_DAYS,
};
