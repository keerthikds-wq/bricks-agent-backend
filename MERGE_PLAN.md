# Bricks Agent — v1 + v2 Merge Plan (builder-centric)

Merges the live Node/Flutter app (`bricks_agent` + `bricks_agent_adminpanel_nodejs`)
with the Emergent-generated prototype (`Bricks_agent_v2-main`) into one product.

**The organising decision:** the builder is the centre and the only paying user.
Clients/owners, field staff (site engineer, supervisor, mason, contractor) and
vendors all exist *linked to a builder*, and get the app free.

Branch: `merge-v2-builder-centric`

---

## 1. What each side contributed

Neither codebase was better overall — they were better at different things.

| Kept from **live app** (v1) | Kept from **v2 prototype** |
|---|---|
| Deterministic **BOQ engine** (real quantity math, not an LLM guess) | **Project** as the central entity |
| **RFQ → quote → order** procurement flow | **Role-based access control** (`require_project_access`) |
| **Cloudinary** media pipeline | **Workflow orchestrator** ("what do I do next?") |
| **Groq** AI at ~free + `AiCache`/`AiUsage` cost guards | **Two-party approvals** (raiser ≠ decider) |
| **Runware FLUX** interior restyling (~$0.002/img) | **Daily logs**, **document vault**, **milestones** |
| Real **Razorpay** with HMAC verification | **Invite links** (WhatsApp-shareable) |
| **FCM push**, OTP auth, i18n, price trends | Progress **feed** + realtime updates |

### Why v2's access control was worth porting
v1 checked ownership inline in every handler
(`project.builder_id.toString() !== userId.toString()`), repeated across
`Controller/project_timeline.js`. That pattern caused the masonry lockout bug
fixed in `8abda8d`. v2 centralised it. Now: `Middleware/projectAccess.js` is the
**only** place project permissions are decided.

### Why v1's AI stack was worth keeping
v2 routed every AI call through the Emergent Universal LLM Key — a metered proxy
with a markup, usable only inside Emergent's platform — with **no cache and no
rate limit**. v1 already had `AiCache` + `AiUsage` and free-tier Groq.
`Utils/aiGuard.js` now fronts every ported AI feature with cache + per-plan
daily caps.

---

## 2. The unified role model

The old app had **four separate auth silos** (`User`, `Seller`, `Builder`,
`Masonry`) each with their own login and home screen. That is why a masonry user
got logged out opening Construction Tracking.

Now there is **one `user` collection** with a `role`:

| Role | Who | Pays? | Home screen |
|---|---|---|---|
| `builder` | Owns projects, runs the build | **Yes** | Project portfolio |
| `client` | Owner/homeowner being built for | No | Their build, live |
| `field_staff` | Site engineer / supervisor / mason / contractor | No | Today's site work |
| `vendor` | Material supplier on a builder's roster | No | Incoming RFQs |

Linking happens through **`ProjectMember`** (project-scoped) and **`VendorLink`**
(builder-scoped, so a vendor is onboarded once and reused across projects).

Capabilities are explicit flags on `ProjectMember`, not derived from role, so a
builder can promote one supervisor without a code change:
`can_log_progress`, `can_view_finance`, `can_approve`.

---

## 3. What was built (backend — complete)

### Models (11 new, 5 extended)
`Project` · `ProjectMember` · `ProjectUpdate` · `Milestone` · `ProjectPayment` ·
`Approval` · `ProjectDocument` · `DailyLog` · `VendorLink` · `ProjectNotification` ·
`AiArtifact`

Extended: `User` (+role/staff_type/plan), `BOQ` (+`project_id`),
`RFQ` (+`project_id`, `dispatch_mode`, `sent_to`), `HomeDesign` (+`project_id`),
`SubscriptionLog` (**bug fix**, see §7).

### Middleware
`Middleware/projectAccess.js` — `projectAccess(...roles)`, `requireCapability(flag)`,
`resolveProjectRole()`, `visibleProjectFilter()`.

### Utilities
`Utils/aiGuard.js` (cache + quota + Groq) · `Utils/subscription.js` (plans + paywall
gate) · `Utils/projectInvite.js` (JWT invites) · `Utils/projectNotify.js` (in-app +
FCM fan-out) · `Utils/realtime.js` (authenticated Socket.IO rooms)

### Routes — 39 endpoints under `/api/projects`, plus `/api/vendors`,
`/api/builder-subscription`, `/api/project-notifications`.

### Storage change
v2 stored generated images and uploaded documents as **base64 inside MongoDB**.
Everything here goes to **Cloudinary**; Mongo holds the URL + `public_id`. v2's
seven per-feature AI collections collapse into one `AiArtifact` keyed by `kind`.

---

## 4. Retired behaviour

**Open marketplace RFQ broadcast.** Previously an RFQ notified every seller
within a geo radius (`send_notification_to_nearby_sellers.dart`,
`Controller/requirement.js`). Now RFQs dispatch to the builder's own
`VendorLink` roster (`POST /api/vendors/dispatch-rfq/:rfqId`).

`RFQ.dispatch_mode` retains an `"open"` value **only** so historical rows still
read correctly — nothing creates them anymore.

**Separate role logins.** `Builder`/`Masonry`/`Seller` collections are no longer
auth sources. They are left in place, untouched, as migration provenance.

---

## 5. Subscription (the money)

Builders only. Ported from v2's catalogue, charged through v1's real Razorpay.

| Plan | Price | Active projects |
|---|---|---|
| Trial | free, 7 days | 3 |
| Starter | ₹699/mo | 3 |
| Pro | ₹999/mo | 5 |

Paywall returns **HTTP 402** with `{ paywall: true, reason: "expired" \| "limit" }`
so the app can route straight to the upgrade screen.

AI daily caps scale with plan: free 15 · trial 40 · starter 100 · pro 300.

> ⚠️ Existing memory note says paywall/gating changes are meant to land in one
> consolidated pass. This ships the **builder plan gate only** and does not touch
> the existing marketplace `subscription_tier` logic — `subscription_tier` is kept
> in sync on upgrade for backward compatibility.

---

## 6. Migration

`Utils/migrations/001_builder_centric.js` — **dry-run by default**.

```bash
node Utils/migrations/001_builder_centric.js            # plan only, no writes
node Utils/migrations/001_builder_centric.js --apply    # commit
```

Maps `Builder→builder`, `Masonry→field_staff` (staff_type inferred from
`specializations`), `Seller→vendor`, remaining users→`client`, and
`ProjectTimeline→Project`.

**Safety properties**
- Additive only. Source collections are never modified or deleted; rollback is
  ignoring the new `role` field.
- Phone is the join key (unique on `user`). A colliding phone **upgrades** the
  existing row instead of inserting a duplicate.
- Never demotes an existing builder.
- Unresolvable rows are reported as conflicts, not silently dropped.

---

## 7. Bug found and fixed en route

`Model/SubscriptionLog.js` read:

```js
expiry: { type: new Date, default: new Date.now() }
```

`Date.now` is a function, not a constructor — `new Date.now()` throws a
`TypeError` at require time. **This model could never be loaded**; any route
touching it would have crashed the process on startup. Fixed to
`type: Date, default: Date.now` and extended with the builder-plan fields.

---

## 8. Verification status

Backend is syntax-clean, loads end-to-end (49 models, 39 project routes), and
passes a 19-case logic suite covering invite round-trips, token tampering
rejection, capability defaults, AI JSON extraction, plan limits and route
ordering.

**Not yet verified against a live database.** No migration has been run and no
endpoint has been exercised against real data — that needs a staging Mongo, and
per the deploy runbook the backend must be restarted and health-checked after
deploy. Do not point this at production until the dry-run output has been read.

---

## 9. Remaining work (Flutter)

The backend contract is complete and stable. The app still needs:

1. **Role-aware shell** — one login, four home screens keyed on `user.role`
   (replaces four separate auth flows).
2. **Project screens** — portfolio, detail with feed/milestones/payments/
   approvals/documents tabs.
3. **Workflow card** — render `GET /:pid/workflow` `next_action` on project home.
4. **Invite/accept flow** — deep link `/invite/:token` → preview → OTP → accept.
5. **Field-staff daily log form** and **client approval screen**.
6. **Vendor roster + RFQ inbox** replacing marketplace seller discovery.
7. **Socket.IO client** for the live feed.
8. **Builder paywall** on 402.

~60 screens. That is a genuine multi-session effort and is **not** done — I am
not going to claim otherwise. Recommended order: 1 → 2 → 4 → 3, since the shell
and project detail unblock everything else.
