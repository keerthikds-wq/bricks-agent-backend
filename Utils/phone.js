/**
 * One spelling of a phone number.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * Firebase returns E.164 — "+919632433346". Every row already in this database
 * stores ten digits — "9632433346". They are the same person, and nothing in
 * the code knew that.
 *
 * Left unhandled, the first Firebase login of an existing user finds nobody,
 * falls through to registration, and either creates a duplicate account or
 * trips the unique index on `phone`. Either way the user is locked out of the
 * projects a builder already linked to their number.
 *
 * The database keeps ten digits, because that is what is already in it and a
 * migration that rewrites every user row to gain nothing is a migration that
 * can go wrong for nothing. Conversion happens at the edge, here.
 */

/**
 * Reduce any spelling of an Indian mobile number to the ten digits stored.
 *
 * Accepts +919632433346, 919632433346, 09632433346, 9632433346, and the same
 * with spaces or hyphens. Returns null for anything that is not a plausible
 * Indian mobile, rather than a wrong-but-confident answer — a bad number that
 * silently becomes a lookup is how one user signs in as another.
 */
function toLocal(raw) {
    if (!raw) return null;
    const digits = String(raw).replace(/\D/g, "");

    // 91 is also the start of a valid ten-digit mobile, so length decides
    // whether a leading 91 is a country code or the first two digits.
    let local = digits;
    if (digits.length === 12 && digits.startsWith("91")) local = digits.slice(2);
    else if (digits.length === 11 && digits.startsWith("0")) local = digits.slice(1);
    else if (digits.length === 13 && digits.startsWith("091")) local = digits.slice(3);

    if (local.length !== 10) return null;
    // Indian mobiles begin 6-9. Anything else is a landline or a typo, and
    // neither can receive the OTP this login depends on.
    if (!/^[6-9]/.test(local)) return null;
    return local;
}

/** The E.164 form, for anything that has to talk to Firebase or an SMS gateway. */
function toE164(raw) {
    const local = toLocal(raw);
    return local ? `+91${local}` : null;
}

module.exports = { toLocal, toE164 };
