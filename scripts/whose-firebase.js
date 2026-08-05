/**
 * Asks Google which accounts own this Firebase project.
 *
 * The project id and the service-account address are both in the repo, but
 * neither names the human whose Google account the console is under. The
 * service account can be used to ask Cloud Resource Manager for the project's
 * IAM policy, which lists exactly that.
 *
 *   node scripts/whose-firebase.js
 *
 * Read-only. If the service account was not granted permission to read the IAM
 * policy the call is refused and nothing is disclosed — that refusal is itself
 * informative, so it is reported rather than swallowed.
 */
const path = require("path");
const admin = require("firebase-admin");

const KEY = path.join(
    __dirname,
    "..",
    "bricks-agent-cdcff-firebase-adminsdk-d9esr-5dbe751f18.json"
);

async function main() {
    const sa = require(KEY);
    const app = admin.initializeApp(
        { credential: admin.credential.cert(sa) },
        "whois"
    );

    const token = await app.options.credential.getAccessToken();
    const project = sa.project_id;

    console.log(`\nProject:         ${project}`);
    console.log(`Service account: ${sa.client_email}\n`);

    const res = await fetch(
        `https://cloudresourcemanager.googleapis.com/v1/projects/${project}:getIamPolicy`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token.access_token}`,
                "Content-Type": "application/json",
            },
            body: "{}",
        }
    );

    const body = await res.json();

    if (!res.ok) {
        console.log(`Google refused the IAM lookup (${res.status}).`);
        console.log(`  ${body?.error?.message || JSON.stringify(body)}\n`);
        console.log("That means this service account can authenticate but was");
        console.log("never granted permission to read who owns the project.\n");
        return;
    }

    // owner / editor first — the owner is the account the console lives under.
    const rank = (r) =>
        r === "roles/owner" ? 0 : r === "roles/editor" ? 1 : 2;
    const bindings = (body.bindings || []).sort(
        (a, b) => rank(a.role) - rank(b.role)
    );

    for (const b of bindings) {
        const humans = (b.members || []).filter((m) => m.startsWith("user:"));
        if (!humans.length) continue;
        console.log(`${b.role}`);
        for (const m of humans) console.log(`   ${m.replace("user:", "")}`);
        console.log("");
    }
}

main().catch((e) => {
    console.error(e.message);
    process.exit(1);
});
