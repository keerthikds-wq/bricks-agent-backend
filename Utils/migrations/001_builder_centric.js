#!/usr/bin/env node
/**
 * Migration 001 — collapse the four auth silos into the builder-centric model.
 *
 *   Builder  collection → user { role: "builder"     }
 *   Masonry  collection → user { role: "field_staff" , staff_type from specializations }
 *   Seller   collection → user { role: "vendor"      }
 *   existing user rows  → user { role: "client"      }   (they were buyers)
 *   ProjectTimeline     → project (builder-owned)
 *
 * SAFETY
 *   - Dry-run by DEFAULT. Nothing is written unless you pass --apply.
 *   - Source collections are never modified or deleted. This is additive; the
 *     old rows stay exactly where they are so a rollback is just ignoring the
 *     new `role` field.
 *   - Phone is the join key (it is unique on user). When a Builder/Masonry/
 *     Seller shares a phone with an existing user row, we UPGRADE that row
 *     rather than creating a duplicate — attempting an insert would throw on
 *     the unique index anyway.
 *
 * USAGE
 *   node Utils/migrations/001_builder_centric.js            # dry run, prints a plan
 *   node Utils/migrations/001_builder_centric.js --apply    # actually writes
 *   node Utils/migrations/001_builder_centric.js --apply --only=users
 *
 * Read MERGE_PLAN.md before running this against production data.
 */

require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });
const mongoose = require("mongoose");

const APPLY = process.argv.includes("--apply");
const ONLY  = (process.argv.find((a) => a.startsWith("--only=")) || "").split("=")[1] || "all";

const User            = require("../../Model/User");
const Builder         = require("../../Model/Builder");
const Masonry         = require("../../Model/Masonry");
const Seller          = require("../../Model/Seller");
const Project         = require("../../Model/Project");
const ProjectTimeline = require("../../Model/ProjectTimeline");

const log = (...a) => console.log(...a);
const stats = {
    builders: { created: 0, upgraded: 0, skipped: 0 },
    masons:   { created: 0, upgraded: 0, skipped: 0 },
    vendors:  { created: 0, upgraded: 0, skipped: 0 },
    clients:  { updated: 0 },
    projects: { created: 0, skipped: 0 },
    conflicts: [],
};

/** Masonry.specializations → the closest field_staff sub-kind. */
function staffTypeFor(specializations = []) {
    const s = specializations.map((x) => String(x).toLowerCase());
    if (s.includes("full_construction")) return "contractor";
    if (s.includes("rcc"))               return "supervisor";
    return "mason";
}

async function migrateRole(Model, label, roleFields, bucket) {
    const rows = await Model.find({ is_delete: { $ne: 1 } }).lean();
    log(`\n── ${label}: ${rows.length} source rows ─────────────────────────`);

    for (const row of rows) {
        if (!row.phone) {
            stats[bucket].skipped++;
            stats.conflicts.push(`${label} ${row._id}: no phone, cannot migrate`);
            continue;
        }

        const fields = typeof roleFields === "function" ? roleFields(row) : roleFields;
        const existing = await User.findOne({ phone: row.phone });

        if (existing) {
            // A phone already on user. Upgrade in place — but never silently
            // demote someone who is already a builder.
            if (existing.role === "builder" && fields.role !== "builder") {
                stats[bucket].skipped++;
                stats.conflicts.push(
                    `${label} ${row.phone}: already a builder on user ${existing._id} — left as builder`
                );
                continue;
            }
            if (APPLY) {
                await User.updateOne(
                    { _id: existing._id },
                    { $set: { ...fields, migrated_from: label.toLowerCase(), legacy_id: row._id } }
                );
            }
            stats[bucket].upgraded++;
        } else {
            if (APPLY) {
                await User.create({
                    name:      row.name || "Unnamed",
                    phone:     row.phone,
                    email:     row.email || undefined,
                    pincode:   row.pincode || "000000",
                    profile:   row.profile_url || row.profile || undefined,
                    fcm_token: row.fcm_token || undefined,
                    longitude: row.location?.coordinates?.[0] ? String(row.location.coordinates[0]) : undefined,
                    latitude:  row.location?.coordinates?.[1] ? String(row.location.coordinates[1]) : undefined,
                    is_verified: row.is_verified ?? 0,
                    active:      row.active ?? 1,
                    ...fields,
                    migrated_from: label.toLowerCase(),
                    legacy_id: row._id,
                });
            }
            stats[bucket].created++;
        }
    }
}

async function migrateProjects() {
    const rows = await ProjectTimeline.find({}).lean();
    log(`\n── ProjectTimeline → Project: ${rows.length} source rows ─────────`);

    for (const t of rows) {
        const already = await Project.findOne({ migrated_from_timeline: t._id });
        if (already) { stats.projects.skipped++; continue; }

        // builder_id on ProjectTimeline pointed at whichever collection the
        // caller came from, so resolve it against user by legacy_id first.
        let builderUser = await User.findOne({ legacy_id: t.builder_id });
        if (!builderUser) builderUser = await User.findById(t.builder_id).catch(() => null);

        if (!builderUser) {
            stats.projects.skipped++;
            stats.conflicts.push(`Timeline ${t._id} ("${t.project_name}"): owner ${t.builder_id} not resolvable — skipped`);
            continue;
        }

        if (APPLY) {
            await Project.create({
                builder_id:   builderUser._id,
                name:         t.project_name,
                description:  t.description || "",
                address:      t.location || "",
                project_type: t.project_type || "residential",
                area_sqft:    t.total_sqft || 0,
                start_date:   t.start_date,
                expected_end_date: t.end_date,
                status: t.status === "ongoing" ? "active"
                      : t.status === "completed" ? "completed"
                      : "planning",
                phases: t.phases && t.phases.length ? t.phases : undefined,
                progress: t.phases && t.phases.length
                    ? Math.round((t.phases.filter((p) => p.status === "completed").length * 100) / t.phases.length)
                    : 0,
                migrated_from_timeline: t._id,
            });
        }
        stats.projects.created++;
    }
}

async function main() {
    if (!process.env.URL) {
        console.error("URL (Mongo connection string) is not set. Aborting.");
        process.exit(1);
    }

    await mongoose.connect(process.env.URL);
    log(`Connected. Mode: ${APPLY ? "APPLY (writes enabled)" : "DRY RUN (no writes)"}  Scope: ${ONLY}`);

    if (ONLY === "all" || ONLY === "users") {
        await migrateRole(Builder, "Builder", { role: "builder" }, "builders");

        await migrateRole(
            Masonry, "Masonry",
            (row) => ({
                role: "field_staff",
                staff_type: staffTypeFor(row.specializations),
                trade: (row.specializations || []).join(", "),
            }),
            "masons"
        );

        await migrateRole(Seller, "Seller", { role: "vendor" }, "vendors");

        // Everyone left on the default is a former buyer → client.
        const buyers = await User.countDocuments({
            role: { $in: [null, "client"] },
            migrated_from: null,
        });
        if (APPLY) {
            const r = await User.updateMany(
                { role: { $in: [null, "client"] }, migrated_from: null },
                { $set: { role: "client", migrated_from: "user" } }
            );
            stats.clients.updated = r.modifiedCount;
        } else {
            stats.clients.updated = buyers;
        }
    }

    if (ONLY === "all" || ONLY === "projects") {
        await migrateProjects();
    }

    log("\n════════════════════ SUMMARY ════════════════════");
    log("Builders  →", stats.builders);
    log("Masonry   →", stats.masons);
    log("Sellers   →", stats.vendors);
    log("Buyers→client:", stats.clients.updated);
    log("Projects  →", stats.projects);

    if (stats.conflicts.length) {
        log(`\n⚠  ${stats.conflicts.length} item(s) need a human decision:`);
        stats.conflicts.slice(0, 40).forEach((c) => log("   -", c));
        if (stats.conflicts.length > 40) log(`   ... and ${stats.conflicts.length - 40} more`);
    }

    if (!APPLY) {
        log("\nDRY RUN — nothing was written. Re-run with --apply to commit.");
    } else {
        log("\nApplied. Legacy Builder/Masonry/Seller collections were left untouched.");
    }

    await mongoose.disconnect();
}

main().catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
});
