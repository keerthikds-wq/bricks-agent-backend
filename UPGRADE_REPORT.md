# Bricks Agent — Full Project Upgrade Report
**Date:** May 2026 | **Scope:** All three repos

---

## Architecture Overview

The Bricks Agent system is a three-part marketplace platform for the construction/real-estate materials industry:

| Layer | Repo | Stack |
|---|---|---|
| Mobile App (Buyers & Sellers) | `bricks_agent` | Flutter 3.x |
| Admin Web Panel | `bricks_agent_adminpanel-master` | Flutter Web |
| REST API Backend | `bricks_agent_adminpanel_nodejs-main` | Node.js + Express + MongoDB Atlas |

**Flow:** Flutter apps → `https://bricks-agent-backend.onrender.com/` → MongoDB Atlas + Cloudinary

**Key domain concepts:** Users (buyers) post Orders → Sellers submit Bids on those orders → Buyer accepts a Bid → Order moves to "ongoing" → Seller marks it "completed". Products, Categories, Brands, Packages, and Subscriptions are all managed via the Admin panel.

---

## 🔴 Critical Bugs Fixed

### 1. OTP Returned in Response Body (Security)
**File:** `Controller/login-seller.js` line 31  
**Before:** `return res.send({ "data": otpnum, ... })`  
**After:** OTP is never sent over the wire — only "OTP sent successfully" is returned.  
**Impact:** Any attacker who intercepted or logged the login response could bypass SMS verification entirely.

### 2. `jwt` Not Imported in Middleware
**File:** `Middleware/index.js`  
**Before:** `jwt.verify(...)` was called but `jwt` was never imported — immediate runtime crash on any authenticated route.  
**After:** `jwt` is now properly imported from `jsonwebtoken`.

### 3. Empty `adminAuth` Middleware
**File:** `Middleware/index.js`  
**Before:** `const adminAuth = (req, res, next) => {}` — called `next()` for everyone, meaning admin routes were unprotected.  
**After:** Properly checks `req.user.isAdmin` before proceeding.

### 4. `Model.count()` Removed in Mongoose 8
**Files:** `Controller/product.js`, `Controller/order.js` (3 calls)  
**Before:** `Product.count(condition)` — throws `TypeError` with Mongoose 8.  
**After:** `Product.countDocuments(condition)` — correct modern API.

### 5. TextLocal API Key Hardcoded in Source
**File:** `Utils/sms.js`  
**Before:** `apiKey: "Njk1NDM5NjI0..."` baked into the file.  
**After:** `apiKey: process.env.TEXTLOCAL_API_KEY` — rotated via environment variables.

### 6. Firebase Admin SDK JSON Committed to Repo
**File:** `bricks-agent-cdcff-firebase-adminsdk-d9esr-5dbe751f18.json`  
**Impact:** The private key for your Firebase project was publicly visible in git history.  
**Action Required:** Rotate the Firebase service account key immediately in the Firebase console (Project Settings → Service accounts → Generate new private key). Add the new key as an environment variable or use Firebase Application Default Credentials on Render — do NOT commit it to the repo. It is now in `.gitignore`.

### 7. Real Secrets in `.env` Committed to Repo
**Files:** `.env` (MongoDB URI, Cloudinary, SendGrid keys)  
**Action Required:** Rotate all credentials in the respective dashboards. The `.env` file is now properly gitignored. Use Render's Environment tab to set these values.

### 8. CORS Headers Set Manually Inside Controller
**File:** `Controller/product.js`  
**Before:** Three `res.header()` calls inside `addProduct` duplicating what the global CORS middleware already does.  
**After:** Removed the manual headers — the global `cors()` middleware in `index.js` handles this uniformly.

### 9. `session.MemoryStore()` Instead of `new session.MemoryStore()`
**File:** `index.js`  
**Before:** `store: session.MemoryStore()` — calling without `new` is incorrect.  
**After:** Removed the explicit store (defaults to MemoryStore correctly) and added `saveUninitialized: false` to reduce session bloat since the API uses JWT primarily.

### 10. Cloudinary v1 / v2 Inconsistency
**Before:** `config.js` used `require('cloudinary')` (v1 API), while `Utils/cloudinary.js` used `require('cloudinary').v2`. Controllers that imported from `config` used v1; those importing from `Utils` used v2.  
**After:** All files now use `const { v2: cloudinary } = require('cloudinary')` consistently.

---

## 📦 Dependency Upgrades — Node.js Backend

| Package | Before | After | Reason |
|---|---|---|---|
| `mongoose` | `^6.0.14` | `^8.x` (latest) | v8 removes deprecated options, fixes `count()`, better TS support |
| `cloudinary` | `^1.31.0` | `^2.5.1` | v2 is the current API; v1 is in maintenance |
| `jsonwebtoken` | `^8.5.1` | `^9.0.2` | Security patches, better error types |
| `firebase-admin` | `^11.3.0` | `^12.7.0` | Security patches |
| `dotenv` | `^10.0.0` | `^16.4.5` | Many improvements, better error messages |
| `express` | `^4.17.3` | `^4.21.1` | Latest 4.x patch |
| `@sendgrid/mail` | `^7.6.2` | `^8.1.3` | Latest |
| `socket.io` | `^4.5.1` | `^4.8.1` | Latest |
| `nodemon` | `^2.0.15` | `^3.1.7` | Moved to devDependencies |
| **REMOVED** | `crypto` npm | — | Was the insecure npm shim; Node has built-in `crypto` |
| **REMOVED** | `fcm-node` | — | Deprecated; use `firebase-admin` messaging directly |
| **REMOVED** | `fcm-notification` | — | Deprecated |
| **REMOVED** | `fs` npm | — | Unnecessary; Node has built-in `fs` |
| **REMOVED** | `mongodb` direct | — | Mongoose already includes it |
| **REMOVED** | `path` npm | — | Node has built-in `path` |
| **ADDED** | `helmet` `^8.0.0` | — | Security headers (XSS, clickjacking, etc.) |
| **ADDED** | `morgan` `^1.10.0` | — | HTTP request logging |
| **ADDED** | `express-rate-limit` `^7.4.1` | — | Rate limiting on all routes |
| **ADDED** | `compression` `^1.7.4` | — | Gzip responses |

---

## 📦 Dependency Upgrades — Flutter Admin Panel

| Package | Before | After |
|---|---|---|
| Dart SDK constraint | `>=2.17.6 <3.0.0` | `>=3.0.0 <4.0.0` |
| `flutter_svg` | `^1.1.4` | `^2.0.10` |
| `dio` | `^4.0.6` | `^5.7.0` |
| `google_fonts` | `^4.0.4` | `^6.1.0` |
| `image_picker` | `^0.8.6` | `^1.1.2` |
| `image_picker_for_web` | `^2.1.10` | `^3.0.4` |
| `http` | `^0.13.5` | `^1.2.1` |
| `get` | `^4.6.5` | `^4.6.6` |
| `get_storage` | `^2.0.3` | `^2.1.1` |
| `flutter_spinkit` | `^5.1.0` | `^5.2.1` |
| `flutter_lints` | `^2.0.0` | `^4.0.0` |
| **REMOVED** | `image_picker_web` | — | Replaced by `image_picker` + `image_picker_for_web` combo |

> **Note for admin panel:** After pulling these changes, run `flutter pub get` in the adminpanel directory. The `flutter_svg` v2 upgrade requires changing imports from `flutter_svg/flutter_svg.dart` to `flutter_svg/flutter_svg.dart` (same path but `SvgPicture` API is mostly compatible). `dio` v5 has breaking changes — if you use `DioError`, rename to `DioException`.

---

## 🚀 Deploy to Render (Free Tier) — Step-by-Step

The backend was previously running at `https://bricks-agent-backend.onrender.com/`. Here's how to get it live again:

### Step 1 — Rotate exposed credentials first
Before pushing anything public, rotate these:
- MongoDB Atlas password (Database Access tab)
- Cloudinary API secret (Cloudinary Console → Settings → Access Keys)
- SendGrid API key (SendGrid Settings → API Keys)
- Firebase service account (Firebase Console → Project Settings → Service Accounts → Generate new private key — **do not commit the JSON**)
- TextLocal API key (TextLocal account settings)

### Step 2 — Push the upgraded code to GitHub
```bash
cd bricks_agent_adminpanel_nodejs-main
git add .
git commit -m "chore: upgrade deps, fix critical bugs, add deployment config"
git push origin main
```

### Step 3 — Connect to Render
1. Go to [render.com](https://render.com) → New → Web Service
2. Connect your GitHub repo (`bricks_agent_adminpanel_nodejs-main`)
3. Settings:
   - **Runtime:** Node
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Plan:** Free (sleeps after 15 min — fine for testing)
   - **Health check path:** `/health`

### Step 4 — Set environment variables in Render
In the Render dashboard → your service → Environment, add:

```
NODE_ENV=production
URL=<your_rotated_mongodb_uri>
SECRET=<long_random_string>
SESSION_SECRET=<another_long_random_string>
SENDGRID_API_KEY=<rotated_sendgrid_key>
EMAIL=<your_verified_sender>
CLOUDANARY_CLOUD_NAME=<your_cloudname>
CLOUDANARY_API_KEY=<your_api_key>
CLOUDANARY_API_SECRET=<rotated_api_secret>
TEXTLOCAL_API_KEY=<rotated_textlocal_key>
TEXTLOCAL_SENDER=SVTPLC
```

### Step 5 — Deploy & verify
Render will auto-deploy. Visit `https://bricks-agent-backend.onrender.com/health` — you should see:
```json
{ "status": "ok", "timestamp": "..." }
```

### Alternative: Railway (no sleep on free tier)
If the 15-min sleep on Render's free tier is a problem during testing, Railway gives $5/month free credit:
1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
2. Set the same environment variables
3. Railway auto-detects Node.js and uses `npm start`

---

## 🌟 Exciting Improvement Roadmap

These are the highest-impact things to build next:

### Backend
- **WebSocket real-time bidding** — Socket.io is already in the deps! Emit events when a seller places a bid so the buyer's app updates live without polling.
- **Push notifications via Firebase Admin** — The FCM infrastructure is there; wire it up properly using `firebase-admin.messaging()` (replacing the removed deprecated `fcm-node`).
- **Swagger / OpenAPI docs** — Add `swagger-jsdoc` + `swagger-ui-express` for auto-generated interactive API docs. Massive time-saver for mobile devs.
- **Input validation with Joi or Zod** — Right now any field can be any value. A validation layer before controllers would catch bad data early and give meaningful error messages.
- **MongoDB indexes** — Add indexes on `phone`, `is_delete`, `seller`, and `user` fields across models for dramatically faster queries as data grows.
- **Redis session store** — Replace MemoryStore with `connect-redis` so sessions survive restarts.
- **Refresh token flow** — JWT tokens currently expire in 3 days with no refresh mechanism. Add a `/auth/refresh` endpoint.

### Flutter Mobile App
- **Offline support** — Cache product/category lists locally with `hive` or `isar` so the app works without connectivity.
- **Location-based seller discovery** — The lat/long is already stored; add geo-proximity filtering so buyers see nearby sellers first.
- **In-app chat** — Socket.io on the backend is ready; add a simple chat screen between buyer and winning seller.
- **Payment success/failure handling** — Razorpay is integrated; add webhook processing on the backend to update order status automatically.
- **Deep links** — Add Firebase Dynamic Links so sellers can share product links that open the app directly.

### Flutter Admin Panel
- **Charts dashboard** — Add `fl_chart` to visualize orders over time, revenue trends, user growth.
- **Export to CSV/PDF** — Let admins download reports of orders and users.
- **Role-based access** — Currently all admins see everything; add sub-admin roles (e.g., "support-only").
- **Bulk actions** — Select multiple products/users and deactivate/activate in one click.

### DevOps / Quality
- **GitHub Actions CI** — The workflow file exists for AWS; adapt it for Render. Auto-run `npm test` on every PR.
- **Automated tests** — Add `jest` + `supertest` for API route testing. Start with auth and order flows.
- **Sentry error monitoring** — Add `@sentry/node` to catch and alert on production errors.
- **Environment-based logging** — Morgan logs everything in dev; use `winston` with JSON format in production for structured log aggregation.

---

## Files Changed / Created

### Backend (`bricks_agent_adminpanel_nodejs-main`)
| File | Change |
|---|---|
| `package.json` | Full dependency upgrade, added helmet/morgan/rate-limit/compression |
| `db.js` | Removed deprecated Mongoose options, added `process.exit(1)` on failure |
| `config.js` | Added `require("dotenv").config()`, switched cloudinary to v2 |
| `index.js` | Added helmet, morgan, compression, rate limiting, CORS config, health endpoint, error handler |
| `handler.js` | Added `require("dotenv").config()` |
| `Middleware/index.js` | Fixed missing `jwt` import, implemented all auth middleware properly |
| `Utils/sms.js` | Moved hardcoded API key to `process.env.TEXTLOCAL_API_KEY` |
| `Utils/cloudinary.js` | Standardized on v2 API |
| `Controller/login-seller.js` | Fixed OTP returned in response body |
| `Controller/product.js` | Removed manual CORS headers, `count()` → `countDocuments()` |
| `Controller/order.js` | `count()` → `countDocuments()` (3 occurrences) |
| `.env.example` | **NEW** — documents all required environment variables |
| `render.yaml` | **NEW** — Render deployment configuration |
| `Dockerfile` | **NEW** — Multi-stage Docker build for portability |
| `.dockerignore` | **NEW** |
| `.gitignore` | Added `.env`, Firebase JSON, and image folders |

### Admin Panel (`bricks_agent_adminpanel-master`)
| File | Change |
|---|---|
| `pubspec.yaml` | Upgraded SDK to Dart 3, updated 9 packages, removed `image_picker_web` |
