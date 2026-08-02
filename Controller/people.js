const Project = require("../Model/Project");
const ProjectMember = require("../Model/ProjectMember");
const User = require("../Model/User");
const LedgerEntry = require("../Model/LedgerEntry");
const { visibleProjectFilter, callerId } = require("../Middleware/projectAccess");
const money = require("../Utils/money");

const ok = (res, data, s = 200) => res.status(s).json({ success: true, data });
const fail = (res, s, message) => res.status(s).json({ success: false, message });

/**
 * GET /api/people/overview
 *
 * The clients and the site team, gathered across every project the caller can
 * see, each carrying the one number that makes the row worth reading: what a
 * client still owes, and how many sites a team member is on.
 *
 * Grouped by PERSON, not listed per project. The same owner across three builds
 * is one relationship; three rows repeating their name is a list you have to do
 * arithmetic on before it tells you anything.
 */
exports.peopleOverview = async (req, res) => {
    try {
        const userId = callerId(req);
        const filter = await visibleProjectFilter(userId, req.user);
        const projects = await Project.find(filter)
            .select("_id name client_id client_name client_phone")
            .lean();
        const ids = projects.map((p) => p._id);

        // Outstanding per project, so a client row can carry what they owe.
        const owedRows = ids.length
            ? await LedgerEntry.aggregate([
                  {
                      $match: {
                          project_id: { $in: ids },
                          direction: "in",
                          status: "pending",
                          is_delete: 0,
                      },
                  },
                  { $group: { _id: "$project_id", paise: { $sum: "$amount_paise" } } },
              ])
            : [];
        const owedByProject = new Map(owedRows.map((r) => [String(r._id), r.paise]));

        /* ── Clients ─────────────────────────────────────────────────────── */
        //
        // Keyed on phone where there is one, falling back to name. A client who
        // has not signed up yet has no user id, and dropping them would hide
        // exactly the people a builder most needs to chase.
        const clients = new Map();
        for (const p of projects) {
            const name = (p.client_name || "").trim();
            const phone = (p.client_phone || "").trim();
            if (!name && !phone) continue;

            const key = phone || name.toLowerCase();
            if (!clients.has(key)) {
                clients.set(key, {
                    name: name || phone,
                    phone,
                    user_id: p.client_id || null,
                    projects: 0,
                    due_paise: 0,
                    project_names: [],
                });
            }
            const c = clients.get(key);
            c.projects += 1;
            c.due_paise += owedByProject.get(String(p._id)) || 0;
            c.project_names.push(p.name);
            if (!c.user_id && p.client_id) c.user_id = p.client_id;
        }

        /* ── Team ────────────────────────────────────────────────────────── */
        const members = ids.length
            ? await ProjectMember.find({
                  project_id: { $in: ids },
                  role: "field_staff",
                  status: { $in: ["invited", "active"] },
              })
                  .select("user_id project_id staff_type trade status")
                  .lean()
            : [];

        const userIds = [...new Set(members.map((m) => String(m.user_id)))];
        const users = userIds.length
            ? await User.find({ _id: { $in: userIds } })
                  .select("name phone profile")
                  .lean()
            : [];
        const userById = new Map(users.map((u) => [String(u._id), u]));
        const projectNameById = new Map(projects.map((p) => [String(p._id), p.name]));

        const team = new Map();
        for (const m of members) {
            const key = String(m.user_id);
            const u = userById.get(key);
            if (!team.has(key)) {
                team.set(key, {
                    user_id: key,
                    name: u?.name || "Team member",
                    phone: u?.phone || "",
                    profile: u?.profile || "",
                    staff_type: m.staff_type || "",
                    trade: m.trade || "",
                    status: m.status,
                    projects: 0,
                    project_names: [],
                });
            }
            const t = team.get(key);
            t.projects += 1;
            const pn = projectNameById.get(String(m.project_id));
            if (pn) t.project_names.push(pn);
            // Active anywhere counts as active. An invite still open on one site
            // should not make someone look pending everywhere.
            if (m.status === "active") t.status = "active";
        }

        // Most owed first, because that is the list a builder acts on.
        const clientList = [...clients.values()]
            .map((c) => ({ ...c, due: money.toRupees(c.due_paise) }))
            .sort((a, b) => b.due_paise - a.due_paise || b.projects - a.projects);

        const teamList = [...team.values()].sort(
            (a, b) => b.projects - a.projects || a.name.localeCompare(b.name)
        );

        return ok(res, {
            clients: clientList,
            team: teamList,
            projects_count: projects.length,
        });
    } catch (err) {
        console.error("peopleOverview error:", err);
        return fail(res, 500, "Server error");
    }
};
