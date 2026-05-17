# Bricks Agent — Product Planning & Implementation Guide

## What We're Building

A 3-sided B2B construction marketplace for India:
- **Buyers** (contractors, builders, homeowners) — post material + labour needs
- **Sellers** (material suppliers) — bid on material orders
- **Masonry** (labour contractors) — bid on labour requirements

Differentiator: **AI cost estimation from floor plans + procurement in one flow**. No other Indian platform combines these two.

---

## Subscription Model

| Tier | Who | Price | Features |
|---|---|---|---|
| Free | Individual buyers, homeowners | ₹0 | Browse catalog, post basic requirements, see bids |
| Builder Pro | Contractors, developers | ₹7,999/mo | AI cost estimator, BOQ from drawings, labour booking, voice input, all AI features |
| Seller | Material suppliers | ₹699/mo | Listed on marketplace, receive orders |
| Masonry | Labour contractors | ₹399/mo | Listed by area, receive labour requests |

---

## Tech Decisions

| Concern | Decision |
|---|---|
| Auth | Firebase Authentication (replace SMS OTP) |
| Voice Input | Sarvam AI — Saarika STT (Indian language specialist) |
| AI Estimator | Claude claude-opus-4-7 (vision) + custom BOQ calculator |
| Static i18n | Google Translate (offline script) → static JSON files |
| Dynamic translation | Sarvam AI — Mayura translation API |
| Languages | English, Hindi, Telugu, Tamil, Kannada, Marathi, Gujarati |

---

## Architecture Overview

```
3-Sided Marketplace
├── Materials flow: Buyer → Order/Requirement → Seller bids → Accepted
├── Labour flow:   Buyer → LabourRequirement → Masonry bids → Accepted
└── AI flow:       Buyer uploads drawing → BOQ generated → auto-creates Requirement
```

### New Models Needed
```
Model/Masonry.js              ← new user type (labour contractor)
Model/MasonryPremium.js       ← masonry subscription record
Model/LabourRequirement.js    ← buyer posts labour need
Model/LabourBid.js            ← masonry quotes on labour requirements
Model/EstimateLog.js          ← AI estimation history
```

### Updated Models
```
Model/Package.js   ← type enum: ['seller', 'builder_pro', 'masonry', 'free']
Model/User.js      ← add subscription_tier, subscription_expires_at, language
Model/Seller.js    ← add language field
```

### New Routes
```
/api/auth          ← Firebase sync endpoint
/api/masonry       ← masonry CRUD + nearby search
/api/masonry-premiums
/api/labour-requirement
/api/labour-bid
/api/voice/requirement   ← Sarvam STT → Claude → Requirement created
/api/ai/estimate         ← floor plan → BOQ → cost estimate (Builder Pro only)
/api/ai/my-estimates
```

---

## Implementation Order

```
Prompt 1  →  Prompt 2  →  Prompt 3  →  Prompt 4
 (Auth)     (Masonry)   (Packages)    (Gating)
                                          ↓
              Prompt 7  ←  Prompt 5  ←  Prompt 6
             (Labour)     (i18n)       (Voice)
                              ↓
                          Prompt 8
                         (AI Estimator)
```

Prompts 5 and 6 can run in parallel after Prompt 4.

### Recommended Week-by-Week

**Week 1 (Core product — shippable v1):**
- Day 1–2: Prompt 1 (Firebase Auth)
- Day 3: Prompt 2 + 3 (Masonry + Packages)
- Day 4: Prompt 4 + 7 (Gating + Labour flow)
- Day 5: Prompt 8 (AI Estimator basic)

**Week 2 (Enhancements):**
- Day 1: Prompt 5 (i18n)
- Day 2–3: Prompt 6 (Voice input)
- Day 4–5: Testing + bug fixes

---

## Implementation Prompts

Copy each prompt into Claude Code (cowork session) one at a time in order.

---

### Prompt 1 — Firebase Auth (Replace OTP Login)

```
I have a Node.js/Express backend at this repo. I need to replace the existing 
SMS OTP login system with Firebase Authentication.

Current state:
- OTP login is in Controller/login.js, Controller/login-seller.js, Controller/login-admin.js
- OTP model is in Model/Otp.js
- JWT is signed manually using process.env.SECRET
- Middleware/index.js verifies the JWT

What to do:
1. Install firebase-admin package
2. Create Utils/firebase.js that initializes firebase-admin using FIREBASE_SERVICE_ACCOUNT env variable
3. Update Middleware/index.js to verify Firebase ID tokens instead of custom JWT
   - Replace jwt.verify() with admin.auth().verifyIdToken(token)
   - Extract uid, email, phone_number from decoded token
   - Keep the same req.user shape: { id, isUser, isSeller, isAdmin }
4. Add a POST /api/auth/sync endpoint in Controller/login.js that:
   - Receives a valid Firebase ID token from client
   - Verifies it with firebase-admin
   - Finds or creates the user in MongoDB by phone/email
   - Returns the user object (the Firebase token itself is used for all subsequent auth)
5. Keep admin login (Controller/login-admin.js) as email+password with bcrypt 
   (replace current MD5 with bcrypt)
6. Add FIREBASE_SERVICE_ACCOUNT to .env.example

Do NOT delete the OTP model yet, just stop using it. Keep backwards compatibility 
on the response shape so the frontend doesn't break.
```

---

### Prompt 2 — Masonry Model + Auth

```
I have a Node.js/Express/MongoDB backend for a B2B construction materials marketplace.
It has three user types: User (buyer), Seller, Admin. I need to add a fourth: Masonry 
(labour contractor).

Existing patterns to follow:
- Model/Seller.js for schema reference
- Controller/login-seller.js for auth controller reference  
- Routes/login.js for route reference
- Middleware/index.js has sellerAuth middleware — follow same pattern

What to build:

1. Model/Masonry.js with fields:
   - name, phone (unique), email, company_name
   - gstin (optional)
   - specializations: [String] enum: ['brickwork', 'plastering', 'tiling', 'rcc', 'plumbing', 'electrical', 'full_construction']
   - team_size: Number
   - experience_years: Number
   - daily_rate: Number, project_rate: Number
   - service_radius_km: { type: Number, default: 20 }
   - location: { type: { type: String, default: 'Point' }, coordinates: [Number] }
   - profile_url: String
   - fcm_token: String
   - is_verified: { type: Number, enum: [0,1], default: 0 }
   - is_active_subscription: { type: Number, enum: [0,1], default: 0 }
   - language: { type: String, enum: ['en','hi','te','ta','kn','mr','gu'], default: 'en' }
   - isMasonry: { type: Boolean, default: true }
   - is_delete: { type: Number, enum: [0,1], default: 0 }
   - Add 2dsphere index on location field

2. Controller/masonry.js with:
   - getMasonry(id), updateMasonry(id), getAllMasonry, deleteMasonry
   - searchNearby(lat, lng, radius, specialization) using MongoDB $near query
   - updateFcmToken

3. Controller/login-masonry.js — Firebase Auth sync (same pattern as login.js after 
   Prompt 1 is done, but creates/finds Masonry document)

4. Add masonryAuth middleware to Middleware/index.js following same pattern as sellerAuth

5. Routes/masonry.js mounted at /api/masonry
```

---

### Prompt 3 — Subscription Model Update (3 Tiers)

```
I have a Node.js/Express/MongoDB backend. The current Package model (Model/Package.js) 
has a type field with enum ['seller', 'buyer', 'both']. I need to expand the 
subscription system for 3 new tiers.

New subscription tiers:
- "builder_pro": Contractors/builders, ~₹7999/month, gets AI features + labour access
- "seller": Material suppliers, ~₹699/month (already exists, keep it)  
- "masonry": Labour contractors, ~₹399/month, gets listed in search
- "free": Regular buyers, ₹0, basic marketplace only (no model needed, it's the default)

What to do:

1. Update Model/Package.js:
   - Change type enum to: ['seller', 'builder_pro', 'masonry', 'free']
   - Add features: [String] field to store what's unlocked
   - Keep existing fields: label, month, single, complete, active

2. Create Model/MasonryPremium.js following exact same structure as Model/SellerPremium.js
   but reference Masonry model instead of Seller

3. Update Model/User.js:
   - Add subscription_tier: { type: String, enum: ['free', 'builder_pro'], default: 'free' }
   - Add subscription_expires_at: Date

4. Update Controller/package.js:
   - Seed 4 default packages if none exist (in Utils/seedPackages.js):
     { label: 'Builder Pro Monthly', type: 'builder_pro', month: 1, single: 7999, complete: 7999, active: 1 }
     { label: 'Seller Monthly', type: 'seller', month: 1, single: 699, complete: 699, active: 1 }
     { label: 'Masonry Monthly', type: 'masonry', month: 1, single: 399, complete: 399, active: 1 }

5. Create Controller/masonry_premium.js following same pattern as Controller/sellerpremium.js

6. Add Routes/masonry_premium.js mounted at /api/masonry-premiums
```

---

### Prompt 4 — Feature Gating Middleware

```
I have a Node.js/Express backend. Users have a subscription_tier field ('free' or 
'builder_pro'). I need middleware to gate certain routes behind the Builder Pro subscription.

What to do:

1. Add to Middleware/index.js:

isBuilderPro middleware:
- Reads req.user (already set by auth middleware)
- Queries User model for subscription_tier and subscription_expires_at
- If tier !== 'builder_pro' OR expires_at < now: return 403 with message 
  "This feature requires Builder Pro subscription"
- If valid: call next()

isMasonrySubscribed middleware:
- Reads req.masonry (set by masonryAuth)
- Checks Masonry.is_active_subscription === 1
- If not: return 403 with message "Active subscription required to appear in search"
- If valid: call next()

2. Apply isBuilderPro to these route patterns (update Routes/ files accordingly):
- POST /api/voice/requirement (voice input - when built)
- POST /api/ai/estimate (AI cost estimator - when built)  
- GET /api/masonry/search (finding labour)
- POST /api/labour-requirement (posting labour needs)

3. Apply isMasonrySubscribed to:
- GET /api/masonry/search results (filter out unsubscribed masonry from results)

Keep middleware lean — single DB query with only the fields needed (select only 
subscription_tier, subscription_expires_at).
```

---

### Prompt 5 — i18n Setup (Static Strings)

```
I have a Node.js/Express backend. I need to add multilingual support for API response 
messages (errors, success messages) in 7 Indian languages.

Tech: i18next + i18next-http-middleware for runtime, @vitalets/google-translate-api 
(dev dependency) for generating translation files.

What to do:

1. Install: npm install i18next i18next-http-middleware
   Install dev: npm install @vitalets/google-translate-api --save-dev

2. Create locales/en.json with all hardcoded message strings currently in controllers.
   Scan all files in Controller/ and collect every string passed to res.json({ message: ... })
   Organize them by domain: auth, order, bid, requirement, user, seller, masonry, 
   package, errors, success

3. Create scripts/generate-translations.js that:
   - Reads locales/en.json
   - Recursively translates every string using @vitalets/google-translate-api
   - Adds 200ms delay between calls to avoid rate limiting
   - Writes output to locales/hi.json, locales/te.json, locales/ta.json, 
     locales/kn.json, locales/mr.json, locales/gu.json
   - Logs progress per language

4. Create Utils/i18n.js that:
   - Initializes i18next with all locale files
   - Configures LanguageDetector to read from Accept-Language header first, 
     then 'lang' query param, fallback to 'en'
   - Exports { i18next, middleware }

5. In index.js add the middleware: app.use(middleware.handle(i18next))

6. Add "translate": "node scripts/generate-translations.js" to package.json scripts

7. Update Model/User.js, Model/Seller.js to add:
   language: { type: String, enum: ['en','hi','te','ta','kn','mr','gu'], default: 'en' }

8. Replace 3-4 example hardcoded strings in Controller/order.js and Controller/bid.js 
   with req.t('key') to demonstrate the pattern. Leave the rest as comments showing 
   the pattern — don't replace all at once.

Do NOT run the translation script — just set everything up so I can run it manually.
```

---

### Prompt 6 — Sarvam AI Voice Input

```
I have a Node.js/Express backend. I need a voice-to-requirement feature where a user 
records audio in their local Indian language, and it creates a Requirement document.

Dependencies: axios (likely already installed), form-data, multer (already configured 
in Utils/multer.js), @anthropic-ai/sdk

New env vars needed: SARVAM_API_KEY

What to build:

1. Utils/sarvam.js with two functions:

transcribeAudio(audioFilePath, languageCode):
- POST to https://api.sarvam.ai/speech-to-text
- multipart/form-data with: file (audio), model: "saarika:v2", language_code
- Header: api-subscription-key: process.env.SARVAM_API_KEY
- Returns transcript string

translateText(text, sourceLang, targetLang):
- POST to https://api.sarvam.ai/translate
- Body: { input, source_language_code, target_language_code, model: "mayura:v1" }
- Returns translated string

Export LANG_CODE_MAP: { hi: 'hi-IN', te: 'te-IN', ta: 'ta-IN', kn: 'kn-IN', mr: 'mr-IN', gu: 'gu-IN', en: 'en-IN' }

2. Controller/voice.js with createRequirementFromVoice function:
- Gets audio file from req.file (multer), user language from req.user.language
- Step 1: Call transcribeAudio with correct language code
- Step 2: Send transcript to Claude claude-opus-4-7 with prompt to extract:
  { title: string, quantity: number|null, unit: string|null, work_type: 'material'|'labour', message: string }
  Claude must return ONLY valid JSON, no markdown
- Step 3: Parse Claude response, create Requirement document with extra fields:
  source: 'voice', original_transcript, original_language
- Step 4: Delete temp audio file (fs.unlinkSync)
- Step 5: Return created requirement + transcript in response
- Handle errors: if Claude returns invalid JSON, retry once with stricter prompt

3. Routes/voice.js:
- POST /api/voice/requirement → userAuth + isBuilderPro + multer.single('audio') + createRequirementFromVoice

4. Mount in Routes/index.js as /api/voice

5. Add SARVAM_API_KEY to .env.example
```

---

### Prompt 7 — Labour Requirement & Bidding Flow

```
I have a Node.js/Express backend with a construction materials marketplace. It has 
Order, Requirement, Bid models for materials. I need an equivalent flow for labour.

Reference models to follow: Model/Requirement.js, Model/Bid.js
Reference controllers: Controller/requirement.js, Controller/bid.js

What to build:

1. Model/LabourRequirement.js:
   - user: ref User (buyer who needs labour)
   - title: String
   - work_types: [String] (enum: same as Masonry specializations)
   - workers_needed: Number
   - duration_days: Number
   - start_date: Date
   - location: { address: String, pincode: String, lat: Number, lng: Number }
   - budget_min: Number, budget_max: Number
   - description: String
   - status: { type: String, enum: ['open', 'closed'], default: 'open' }
   - accepted_bid: ref LabourBid
   - is_delete: { type: Number, enum: [0,1], default: 0 }
   - timestamps: true

2. Model/LabourBid.js:
   - labour_requirement: ref LabourRequirement
   - masonry: ref Masonry
   - total_price: Number
   - price_per_day: Number
   - workers_available: Number
   - available_from: Date
   - notes: String
   - status: { type: String, enum: ['pending','accepted','declined'], default: 'pending' }
   - is_delete: { type: Number, enum: [0,1], default: 0 }
   - timestamps: true

3. Controller/labour_requirement.js:
   - createLabourRequirement (userAuth + isBuilderPro) — creates doc, notifies nearby 
     masonry via FCM (find masonry within requirement.location radius with matching 
     specialization and active subscription)
   - getMyLabourRequirements (userAuth)
   - getOpenLabourRequirements (masonryAuth) — filtered by masonry's service area + specializations
   - closeLabourRequirement (userAuth) — sets status: closed
   - deleteLabourRequirement (userAuth) — soft delete

4. Controller/labour_bid.js:
   - submitLabourBid (masonryAuth) — masonry submits bid on open requirement
   - getBidsForRequirement (userAuth) — buyer sees all bids on their requirement
   - getMyLabourBids (masonryAuth) — masonry sees their submitted bids
   - acceptLabourBid (userAuth) — sets bid status accepted, closes requirement, declines other bids
   - declineLabourBid (userAuth) — sets specific bid to declined

5. Routes/labour.js with:
   - /api/labour-requirement (CRUD)
   - /api/labour-bid (CRUD)
   Mount both in Routes/index.js
```

---

### Prompt 8 — AI Construction Cost Estimator (Builder Pro Feature)

```
I have a Node.js/Express backend. I need an AI-powered construction cost estimator 
that accepts a floor plan image or PDF and returns a Bill of Quantities (BOQ) with 
cost estimates using our product catalog prices.

Dependencies: @anthropic-ai/sdk (install if not present), multer (already in Utils/multer.js)
This endpoint is gated behind isBuilderPro middleware (already built).

What to build:

1. Utils/boq_calculator.js — Standard Indian construction material formulas:
   Calculate quantities for given total_area (sqft), floors (number), 
   construction_type ('rcc'|'load_bearing'):
   
   - Cement bags: (total_area * floors * 0.4) bags (approx for RCC)
   - Steel kg: (total_area * floors * 4) kg
   - Sand (cft): (total_area * floors * 0.6)
   - Aggregate (cft): (total_area * floors * 0.45)
   - Bricks (nos): (total_area * floors * 8) for load bearing, 0 for full RCC
   - AAC Blocks (nos): (total_area * floors * 6) for RCC frame
   - Flooring tiles (sqft): total_area * floors * 1.1 (10% wastage)
   
   Return array of { material_name, quantity, unit, category }
   
   Export: calculateBOQ(total_area, floors, construction_type)

2. Controller/ai_estimator.js with estimateFromDrawing function:
   
   Step 1: Accept uploaded file (image or PDF) via req.file
   
   Step 2: Read file as base64
   
   Step 3: Send to Claude claude-opus-4-7 with vision:
   - If image: send as image media type
   - If PDF: send as document media type
   - Prompt: "Analyze this architectural floor plan. Extract:
     1. Total floor area in square feet (sum all floors)
     2. Number of floors
     3. Construction type (RCC frame / load bearing / not clear)
     4. List of rooms with approximate dimensions
     Respond ONLY in JSON: { total_area_sqft, floors, construction_type, 
     rooms: [{name, length_ft, width_ft}], confidence: 'high'|'medium'|'low', notes }"
   
   Step 4: Parse Claude response, run calculateBOQ(total_area, floors, construction_type)
   
   Step 5: For each material in BOQ, query Product collection:
   - Match by name similarity (use regex on product name)
   - Get min_price, max_price from matched products
   - If no match found, use regional average (hardcode a price map as fallback)
   
   Step 6: Calculate total_min_cost and total_max_cost
   
   Step 7: Return response:
   {
     drawing_analysis: { total_area_sqft, floors, construction_type, rooms, confidence },
     boq: [{ material_name, quantity, unit, min_price, max_price, total_min, total_max, product_id }],
     total_estimate: { min: Number, max: Number },
     disclaimer: "This is an indicative estimate. Actual costs may vary by 15-20%.",
     cta: "Get exact quotes from verified suppliers"  
   }
   
   Step 8: Save estimate to a new Model/EstimateLog.js (user, drawing_url, boq, total_estimate, timestamps)
   
   Step 9: Cleanup temp file

3. Model/EstimateLog.js:
   - user: ref User
   - drawing_cloudinary_url: String  
   - drawing_analysis: Object
   - boq: [Object]
   - total_estimate: { min: Number, max: Number }
   - construction_type: String
   - timestamps: true

4. Routes/ai.js:
   POST /api/ai/estimate → userAuth + isBuilderPro + multer.single('drawing') + estimateFromDrawing
   GET /api/ai/my-estimates → userAuth + isBuilderPro → paginated EstimateLog for user

5. Mount in Routes/index.js as /api/ai

6. Add to .env.example: ANTHROPIC_API_KEY
```

---

## Market Context

- No Indian platform combines AI estimation + procurement marketplace
- Infra.Market (IPO 2026) and OfBusiness target enterprise — SME contractors underserved
- AI estimation tools (BuildNext, DesignDrafter) exist but are standalone — no procurement hook
- The "estimate → order → bid" funnel is the core differentiator

## Competitor Landscape

| Company | Type | AI Estimation | Labour |
|---|---|---|---|
| Infra.Market | B2B marketplace | No | No |
| OfBusiness | B2B marketplace | No | No |
| BuildNext | Standalone estimator | Yes | No |
| DesignDrafter | Architect tool | Yes | No |
| **Bricks Agent** | Marketplace + AI | **Yes** | **Yes** |
