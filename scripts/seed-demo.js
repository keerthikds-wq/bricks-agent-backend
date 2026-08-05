/**
 * Seeds one complete, coherent demo project.
 *
 * ── Why a story and not random rows ──────────────────────────────────────────
 *
 * A demo fails on incoherence long before it fails on missing features. If the
 * ledger says ₹38.5L received but the stage list shows foundation not started,
 * the person watching stops believing the screen. So this seeds ONE villa at a
 * specific, consistent moment in its life: five stages done, brickwork running,
 * four payments cleared, one requested, three decisions waiting on the owner.
 * Every number below is derived from that state rather than invented per table.
 *
 * Idempotent: re-running wipes only this demo project's rows and rebuilds them,
 * so the numbers never double up between runs.
 *
 *   node scripts/seed-demo.js
 *
 * Real phone numbers are used because the demo signs in with them. They belong
 * to the operator running the demo, not to a member of the public.
 */
require("dotenv").config();
const dns = require("dns");
const mongoose = require("mongoose");

/**
 * Atlas connection strings are `mongodb+srv://`, which makes the driver do an
 * SRV lookup before it can connect at all. Node does not use the Windows
 * resolver for that — it reads its own server list, and on this machine that
 * list is `127.0.0.1` with nothing listening, so every lookup returns
 * ECONNREFUSED while `nslookup` on the same host answers fine.
 *
 * Pointing the resolver at a public server only when the configured one cannot
 * answer keeps a working setup untouched and stops a DNS quirk from looking
 * like bad credentials.
 */
async function ensureDnsWorks(uri) {
    if (!uri.startsWith("mongodb+srv://")) return;
    const host = uri.split("@")[1].split("/")[0];
    try {
        await dns.promises.resolveSrv(`_mongodb._tcp.${host}`);
    } catch (e) {
        console.warn(
            `  DNS: ${dns.getServers().join(", ")} could not resolve SRV (${e.code}); ` +
            "falling back to 8.8.8.8"
        );
        dns.setServers(["8.8.8.8", "1.1.1.1"]);
    }
}

const User           = require("../Model/User");
const Project        = require("../Model/Project");
const ProjectMember  = require("../Model/ProjectMember");
const ProjectPayment = require("../Model/ProjectPayment");
const Milestone      = require("../Model/Milestone");
const ProjectUpdate  = require("../Model/ProjectUpdate");
const Approval       = require("../Model/Approval");
const ProjectDocument= require("../Model/ProjectDocument");
const DailyLog       = require("../Model/DailyLog");
const LedgerEntry    = require("../Model/LedgerEntry");
const { recomputeProgress } = require("../Controller/project_collab");

const BUILDER_PHONE = "9632433346";
const CLIENT_PHONE  = "7013553652";

const CONTRACT_VALUE = 6200000;   // ₹62,00,000

const rupees = (n) => Math.round(n * 100);          // → paise
const daysAgo = (n) => {
    const d = new Date();
    d.setHours(9, 0, 0, 0);
    d.setDate(d.getDate() - n);
    return d;
};
const daysAhead = (n) => daysAgo(-n);

/**
 * The ten stages, and where this project actually is.
 *
 * Five complete, brickwork running, the rest untouched. The owner-facing screen
 * reads this list top to bottom, which is why the order matters more than the
 * percentage: "Brick Work in progress" tells someone what is happening on their
 * site; "58%" does not.
 */
const PHASES = [
    { name: "Planning & Design",     status: "completed",   done: 96 },
    { name: "Foundation",            status: "completed",   done: 78 },
    { name: "Structure",             status: "completed",   done: 54 },
    { name: "Brickwork & Walls",     status: "in_progress", done: null },
    { name: "Roofing",               status: "completed",   done: 31 },
    { name: "Electrical & Plumbing", status: "pending",     done: null },
    { name: "Plastering",            status: "pending",     done: null },
    { name: "Flooring & Tiling",     status: "pending",     done: null },
    { name: "Painting & Finishing",  status: "pending",     done: null },
    { name: "Handover",              status: "pending",     done: null },
];

/** Site photos. Unsplash construction stills — hotlinked, nothing stored. */
const PHOTO = (id, w = 900) =>
    `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=70`;

const SITE_PHOTOS = [
    PHOTO("1541888946425-d81bb19240f5"),
    PHOTO("1503387762-592deb58ef4e"),
    PHOTO("1590644365607-1c5a0c1e9c62"),
    PHOTO("1504307651254-35680f356dfd"),
    PHOTO("1581094794329-c8112a89af12"),
    PHOTO("1487958449943-2429e8be8625"),
];

async function upsertUser({ phone, name, role, pincode }) {
    let u = await User.findOne({ phone });
    if (!u) u = new User({ phone, name, pincode });
    u.name = name;
    u.role = role;
    u.pincode = pincode;
    u.is_verified = 1;
    u.active = 1;
    u.is_delete = 0;
    // Legacy flags still gate a few older screens; a demo account must not trip
    // them into the seller/masonry variants.
    u.isUser = true;
    await u.save();
    return u;
}

async function main() {
    const uri = process.env.URL;
    if (!uri) throw new Error("URL is not set in .env — cannot reach MongoDB");
    await ensureDnsWorks(uri);
    await mongoose.connect(uri);
    console.log("connected");

    // ── People ───────────────────────────────────────────────────────────────
    const builder = await upsertUser({
        phone: BUILDER_PHONE,
        name: "Ravi Constructions",
        role: "builder",
        pincode: "560068",
    });
    const client = await upsertUser({
        phone: CLIENT_PHONE,
        name: "Anil Kumar",
        role: "client",
        pincode: "560068",
    });
    console.log(`builder ${builder._id}  client ${client._id}`);

    // ── Project ──────────────────────────────────────────────────────────────
    let project = await Project.findOne({
        builder_id: builder._id,
        name: "Sai Residency — Villa 12",
    });
    if (!project) project = new Project({ builder_id: builder._id, name: "Sai Residency — Villa 12" });

    Object.assign(project, {
        builder_id: builder._id,
        client_id: client._id,
        client_phone: CLIENT_PHONE,
        client_name: client.name,
        description:
            "G+1 residential villa, 3BHK with a covered car porch and a rooftop utility. " +
            "Vitrified flooring throughout, granite in the kitchen.",
        address: "Plot 12, Sai Residency Layout, Begur Road, Bengaluru",
        pincode: "560068",
        cover_image: PHOTO("1487958449943-2429e8be8625", 1200),
        project_type: "residential",
        location: { type: "Point", coordinates: [77.6221, 12.8845] },
        area_sqft: 2400,
        floors: 2,
        budget: CONTRACT_VALUE,
        start_date: daysAgo(112),
        expected_end_date: daysAhead(96),
        status: "active",
        phases: PHASES.map((p) => ({
            name: p.name,
            status: p.status,
            notes: "",
            completed_at: p.done ? daysAgo(p.done) : undefined,
        })),
        is_delete: 0,
    });
    await project.save();
    const pid = project._id;
    console.log(`project ${pid}`);

    // Everything below is regenerated, so clear this project's rows first.
    // Scoped to the project id — a demo seed must never touch other data.
    const wipe = { project_id: pid };
    await Promise.all([
        ProjectMember.deleteMany(wipe),
        ProjectPayment.deleteMany(wipe),
        Milestone.deleteMany(wipe),
        ProjectUpdate.deleteMany(wipe),
        Approval.deleteMany(wipe),
        ProjectDocument.deleteMany(wipe),
        DailyLog.deleteMany(wipe),
        LedgerEntry.deleteMany(wipe),
    ]);

    // ── Membership: the owner's door into the project ────────────────────────
    await ProjectMember.create({
        project_id: pid,
        user_id: client._id,
        role: "client",
        can_log_progress: false,
        can_view_finance: true,   // the whole point of the product
        can_approve: true,
        status: "active",
        invited_by: builder._id,
        invited_at: daysAgo(110),
        accepted_at: daysAgo(110),
    });

    // ── Money ────────────────────────────────────────────────────────────────
    // Four stage payments cleared, one raised and waiting. The sum of the paid
    // rows is what the owner sees as "paid", so it is never hardcoded anywhere.
    const payments = [
        { purpose: "Booking advance",              amount: 620000,  status: "paid",    due: daysAgo(112), paid: daysAgo(110) },
        { purpose: "On foundation completion",     amount: 930000,  status: "paid",    due: daysAgo(80),  paid: daysAgo(77) },
        { purpose: "On roof slab casting",         amount: 1240000, status: "paid",    due: daysAgo(56),  paid: daysAgo(53) },
        { purpose: "On brickwork start",           amount: 1060000, status: "paid",    due: daysAgo(30),  paid: daysAgo(28) },
        { purpose: "On brickwork completion",      amount: 620000,  status: "pending", due: daysAhead(6), paid: null },
    ];

    for (const p of payments) {
        const row = await ProjectPayment.create({
            project_id: pid,
            amount: p.amount,
            purpose: p.purpose,
            notes: p.status === "pending"
                ? "Raised against the brickwork stage. Measurement sheet attached."
                : "",
            due_date: p.due,
            status: p.status,
            paid_at: p.paid || undefined,
            paid_offline: p.status === "paid",
            raised_by: builder._id,
        });

        // The ledger is the source of truth for every rupee figure on screen.
        await LedgerEntry.create({
            project_id: pid,
            builder_id: builder._id,
            direction: "in",
            category: "client_payment",
            amount_paise: rupees(p.amount),
            amount: p.amount,
            status: p.status === "paid" ? "settled" : "pending",
            party_name: client.name,
            party_phone: CLIENT_PHONE,
            description: p.purpose,
            occurred_on: p.paid || p.due,
            due_date: p.due,
            settled_on: p.paid || undefined,
            payment_mode: p.status === "paid" ? "bank_transfer" : "",
            source: "project_payment",
            source_ref: row._id,
            created_by: builder._id,
        });
    }

    // Costs going out, so the builder's own Finance screen is not an empty
    // mirror of the incoming payments.
    const costs = [
        { cat: "material_bill", party: "Sri Balaji Cement Agencies", desc: "Cement — 180 bags",       amt: 68400,  on: daysAgo(26) },
        { cat: "material_bill", party: "Anjaneya Steel",             desc: "TMT steel — 2.4 t",        amt: 156000, on: daysAgo(44) },
        { cat: "material_bill", party: "KSB Bricks",                 desc: "Clay bricks — 14,000 nos", amt: 109200, on: daysAgo(24) },
        { cat: "labour_wage",   party: "Mason gang — Shivu",         desc: "Brickwork, week 3",        amt: 84000,  on: daysAgo(7)  },
        { cat: "transport",     party: "Local tipper",               desc: "M-sand, 2 loads",          amt: 18500,  on: daysAgo(19) },
    ];
    for (const c of costs) {
        await LedgerEntry.create({
            project_id: pid,
            builder_id: builder._id,
            direction: "out",
            category: c.cat,
            amount_paise: rupees(c.amt),
            amount: c.amt,
            status: "settled",
            party_name: c.party,
            description: c.desc,
            occurred_on: c.on,
            settled_on: c.on,
            payment_mode: "upi",
            source: "manual",
            created_by: builder._id,
        });
    }

    const paidTotal = payments
        .filter((p) => p.status === "paid")
        .reduce((s, p) => s + p.amount, 0);
    project.spent = costs.reduce((s, c) => s + c.amt, 0);
    await project.save();

    // ── Stages as milestones ─────────────────────────────────────────────────
    // Pending stages are dated forward in the order they will happen, so the
    // "next milestone" the owner sees is the brickwork finish and not whichever
    // row the database happened to return first.
    let ahead = 0;
    for (const p of PHASES) {
        if (!p.done) ahead += 18;
        await Milestone.create({
            project_id: pid,
            title: p.name,
            description: "",
            due_date: p.done ? daysAgo(p.done) : daysAhead(ahead),
            completed: p.status === "completed",
            completed_at: p.done ? daysAgo(p.done) : undefined,
            completed_by: p.done ? builder._id : undefined,
            phase_name: p.name,
            created_by: builder._id,
        });
    }

    // Progress is derived from milestone completion, never set by hand — the
    // seed writing its own percentage is how a demo ends up showing 58% beside
    // a stage list that says something else.
    await recomputeProgress(pid);

    // ── Daily site reports ───────────────────────────────────────────────────
    // Twelve days back, with two gaps. Real sites lose days to rain and to
    // Sundays, and a demo whose every single day is a perfect green tick reads
    // as fabricated — which is the one thing this product cannot afford.
    const days = [
        { d: 0,  workers: 12, work: "Brickwork on the first-floor east and north walls. Lintel shuttering started over the bedroom openings.", weather: "clear",  photos: 3 },
        { d: 1,  workers: 11, work: "Brickwork continued on the first floor. Two courses short of lintel level on the south wall.",           weather: "clear",  photos: 2 },
        { d: 2,  workers: 14, work: "Internal partition walls in the ground floor completed. Curing of the previous lift done.",              weather: "cloudy", photos: 2 },
        { d: 3,  workers: 0,  work: "No work — heavy rain from early morning. Site covered, materials stacked under tarpaulin.",              weather: "rain",   photos: 1, issue: "Rain stopped work for the full day." },
        { d: 4,  workers: 9,  work: "Half day. Cleared water from the ground floor slab and resumed brickwork after noon.",                   weather: "rain",   photos: 1 },
        { d: 6,  workers: 13, work: "Ground floor brickwork completed. Scaffolding shifted for the first-floor lift.",                        weather: "clear",  photos: 3 },
        { d: 7,  workers: 13, work: "Started first-floor brickwork on the west wall. Cement and sand delivered.",                             weather: "clear",  photos: 2 },
        { d: 8,  workers: 10, work: "Door and window frames positioned on the ground floor and plumbed.",                                     weather: "cloudy", photos: 2 },
        { d: 10, workers: 15, work: "Roof slab de-shuttering completed. Surface inspected, no honeycombing found.",                           weather: "clear",  photos: 3 },
        { d: 11, workers: 8,  work: "Curing of the roof slab. Site cleaned and debris removed.",                                              weather: "clear",  photos: 1 },
    ];

    for (const day of days) {
        const log = await DailyLog.create({
            project_id: pid,
            log_date: daysAgo(day.d),
            weather: day.weather,
            labour: day.workers
                ? [
                      { trade: "Mason",   count: Math.ceil(day.workers * 0.4), hours: 8, rate: 900 },
                      { trade: "Helper",  count: Math.floor(day.workers * 0.5), hours: 8, rate: 650 },
                      { trade: "Bar bender", count: Math.max(0, day.workers - Math.ceil(day.workers * 0.4) - Math.floor(day.workers * 0.5)), hours: 8, rate: 850 },
                  ].filter((l) => l.count > 0)
                : [],
            total_workers: day.workers,
            work_done: day.work,
            issues: day.issue || "",
            images: SITE_PHOTOS.slice(0, day.photos),
            author_id: builder._id,
            author_name: builder.name,
        });

        await ProjectUpdate.create({
            project_id: pid,
            title: day.workers ? `${day.workers} workers on site` : "No work today",
            description: day.work,
            type: day.workers ? "progress" : "delay",
            images: SITE_PHOTOS.slice(0, day.photos),
            author_id: builder._id,
            author_name: builder.name,
            author_role: "builder",
            daily_log_id: log._id,
            createdAt: daysAgo(day.d),
        });
    }

    // ── Decisions waiting on the owner ───────────────────────────────────────
    // The Decision Center is the screen that justifies the product, so the demo
    // must open with something actually waiting — an empty one proves nothing.
    const approvals = [
        {
            title: "Bathroom tile selection",
            description:
                "Two options shortlisted for the common bathroom. Option A is a 300×600 matte ceramic at ₹52/sqft. " +
                "Option B is a 600×600 glazed vitrified at ₹78/sqft. Option B adds about ₹18,400 across both bathrooms.",
            category: "material",
            cost_delta: 18400,
            priority: "normal",
            needed_by: daysAhead(4),
            photos: 2,
        },
        {
            title: "Skylight over the stairwell",
            description:
                "You asked about natural light in the stairwell. A 4×4 ft fixed skylight can be added while the " +
                "roof slab openings are still accessible. Doing it later means cutting the finished slab.",
            category: "change",
            cost_delta: 46000,
            priority: "urgent",
            needed_by: daysAhead(2),
            photos: 1,
        },
        {
            title: "Electrical layout — ground floor",
            description:
                "Switch and socket positions marked on the drawing. Please confirm before we chase the walls, " +
                "since changes after plastering mean re-cutting.",
            category: "design",
            cost_delta: 0,
            priority: "normal",
            needed_by: daysAhead(7),
            photos: 1,
        },
    ];

    for (const a of approvals) {
        await Approval.create({
            project_id: pid,
            title: a.title,
            description: a.description,
            category: a.category,
            cost_delta: a.cost_delta,
            attachments: SITE_PHOTOS.slice(0, a.photos),
            priority: a.priority,
            needed_by: a.needed_by,
            status: "pending",
            raised_by: builder._id,
            raised_by_name: builder.name,
            raised_by_role: "builder",
        });
    }

    // One already decided, so the history is not empty either.
    await Approval.create({
        project_id: pid,
        title: "Main door — teak vs engineered",
        description: "Solid teak frame with a teak-veneer shutter, as discussed on site.",
        category: "material",
        cost_delta: 24000,
        priority: "normal",
        needed_by: daysAgo(20),
        status: "approved",
        raised_by: builder._id,
        raised_by_name: builder.name,
        raised_by_role: "builder",
        decided_by: client._id,
        decided_at: daysAgo(19),
        decision_note: "Approved. Please use the same finish for the pooja room door.",
    });

    // ── Proof ────────────────────────────────────────────────────────────────
    const docs = [
        { name: "Construction agreement (signed)", type: "contract",  client: true },
        { name: "Approved plan — BBMP",            type: "permit",    client: true },
        { name: "Structural drawings — R1",        type: "drawing",   client: true },
        { name: "Receipt — booking advance",       type: "receipt",   client: true },
        { name: "Receipt — foundation stage",      type: "receipt",   client: true },
        { name: "Receipt — roof slab stage",       type: "receipt",   client: true },
        { name: "Supplier quotation — vitrified",  type: "quotation", client: false },
    ];
    for (const d of docs) {
        await ProjectDocument.create({
            project_id: pid,
            name: d.name,
            type: d.type,
            file_url: SITE_PHOTOS[0],
            mime_type: "application/pdf",
            size_bytes: 240000,
            visible_to_client: d.client,
            uploaded_by: builder._id,
            uploaded_by_name: builder.name,
        });
    }

    // ── Optional: put the builder's other projects out of the way ────────────
    //
    // This builder already has two half-set-up projects, one of which carries
    // the same owner phone. On a demo the owner would open the app and see a
    // second, empty house next to their real one, which reads as a bug.
    //
    // Archiving rather than deleting: it is one field, it is reversible, and a
    // seed script has no business destroying rows it did not create. Opt in
    // with `--exclusive`.
    if (process.argv.includes("--exclusive")) {
        const r = await Project.updateMany(
            { builder_id: builder._id, _id: { $ne: pid }, is_delete: 0 },
            { $set: { status: "archived" } }
        );
        console.log(`archived ${r.modifiedCount} other project(s) — re-run without --exclusive to leave them alone`);
    }

    console.log("\n─────────────────────────────────────────────");
    console.log(`  Project      ${project.name}`);
    console.log(`  Builder      ${BUILDER_PHONE}  (${builder.name})`);
    console.log(`  Owner        ${CLIENT_PHONE}  (${client.name})`);
    console.log(`  Contract     ₹${CONTRACT_VALUE.toLocaleString("en-IN")}`);
    console.log(`  Received     ₹${paidTotal.toLocaleString("en-IN")}`);
    console.log(`  Requested    ₹${(620000).toLocaleString("en-IN")} (due in 6 days)`);
    console.log(`  Stages       5 of 10 complete, brickwork in progress`);
    console.log(`  Daily logs   ${days.length}`);
    console.log(`  Decisions    3 waiting, 1 decided`);
    console.log("─────────────────────────────────────────────\n");

    await mongoose.disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
