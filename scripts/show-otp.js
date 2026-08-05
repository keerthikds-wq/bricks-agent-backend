/**
 * Prints the current login OTP for a phone number.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * Utils/sms.js does not send anything — TextLocal shut down and nothing
 * replaced it, so the OTP is written to Mongo and logged to the Render console
 * and that is all. The intended way in is the master OTP, which is disarmed
 * unless ALLOW_MASTER_OTP=true and MASTER_OTP=0000 are set on the server.
 *
 * With neither of those in place there is no way to sign in at all. This reads
 * the OTP straight out of the collection it was written to, which unblocks a
 * demo without weakening the login for everyone.
 *
 *   node scripts/show-otp.js 9632433346
 *
 * This is a local operator tool. It needs the database credentials to run, so
 * it grants nothing to anyone who does not already have them.
 */
require("dotenv").config();
const dns = require("dns");
const mongoose = require("mongoose");
const Otp = require("../Model/Otp");

async function ensureDnsWorks(uri) {
    if (!uri.startsWith("mongodb+srv://")) return;
    const host = uri.split("@")[1].split("/")[0];
    try {
        await dns.promises.resolveSrv(`_mongodb._tcp.${host}`);
    } catch {
        dns.setServers(["8.8.8.8", "1.1.1.1"]);
    }
}

async function main() {
    const phone = process.argv[2];
    if (!phone) {
        console.error("usage: node scripts/show-otp.js <phone>");
        process.exit(1);
    }

    const uri = process.env.URL;
    await ensureDnsWorks(uri);
    await mongoose.connect(uri);

    // Newest first — a fresh /auth/login call writes a new row each time rather
    // than replacing the old one, so the latest is the one that will verify.
    const rows = await Otp.find({ phone }).sort({ _id: -1 }).limit(3).lean();

    if (!rows.length) {
        console.log(`No OTP on record for ${phone}. Call /api/auth/login first.`);
    } else {
        console.log(`\n  OTP for ${phone}: ${rows[0].Otp}`);
        if (rows.length > 1) {
            console.log(`  (previous: ${rows.slice(1).map((r) => r.Otp).join(", ")})`);
        }
        console.log("");
    }

    await mongoose.disconnect();
}

main().catch((e) => {
    console.error(e.message);
    process.exit(1);
});
