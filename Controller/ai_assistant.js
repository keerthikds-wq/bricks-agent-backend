/**
 * AI Construction Assistant Controller
 *
 * Cost strategy (near-zero for 2000 users):
 *  1. Rate limit  — 15 AI queries / user / day
 *  2. Exact cache — MongoDB stores Q&A pairs; same question = free answer
 *  3. Groq API    — free tier (llama-3.1-8b-instant, 14,400 req/day)
 *  4. Short prompts — system prompt <400 tokens, output capped at
 *     280 tokens for English / 700 tokens for Indic scripts
 *     (Telugu/Tamil/Kannada/Hindi/Devanagari etc. cost ~2–3× more tokens
 *     per character, so we need a higher cap to avoid mid-sentence truncation).
 */

const crypto  = require('crypto');
const axios   = require('axios');
const AiCache = require('../Model/AiCache');
const AiUsage = require('../Model/AiUsage');

// ── Config ────────────────────────────────────────────────────────────────────
const DAILY_LIMIT   = 15;   // free queries per user per day
const GROQ_API_URL  = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL    = 'llama-3.1-8b-instant';   // fastest free model
const MAX_TOKENS_EN    = 280;   // English (and other Latin-script) — short & cheap
const MAX_TOKENS_INDIC = 700;   // Indic scripts need ~2–3× more tokens for the same answer length

// Detect any Indic script (Devanagari, Bengali, Gurmukhi, Gujarati, Oriya, Tamil,
// Telugu, Kannada, Malayalam) anywhere in the user's message. Used to size the
// completion budget so we don't get cut off mid-sentence on long multilingual answers.
const INDIC_SCRIPT_RE = new RegExp(
    '[' +
    '\u0900-\u097F' +   // Devanagari (Hindi/Marathi/Sanskrit)
    '\u0980-\u09FF' +   // Bengali / Assamese
    '\u0A00-\u0A7F' +   // Gurmukhi (Punjabi)
    '\u0A80-\u0AFF' +   // Gujarati
    '\u0B00-\u0B7F' +   // Oriya
    '\u0B80-\u0BFF' +   // Tamil
    '\u0C00-\u0C7F' +   // Telugu
    '\u0C80-\u0CFF' +   // Kannada
    '\u0D00-\u0D7F' +   // Malayalam
    ']'
);
const hasIndicScript = (text) => INDIC_SCRIPT_RE.test(String(text || ''));

// Rotating keys: add up to 3 free Groq keys in your .env to triple the free quota
const GROQ_KEYS = [
    process.env.GROQ_API_KEY,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3,
].filter(Boolean);

let _keyIndex = 0;
const getKey = () => {
    if (!GROQ_KEYS.length) throw new Error('GROQ_API_KEY not set in environment');
    const key = GROQ_KEYS[_keyIndex % GROQ_KEYS.length];
    _keyIndex++;
    return key;
};

// ── System prompt (construction-specific, multilingual) ───────────────────────
const SYSTEM_PROMPT = `You are Bricks AI — a practical construction assistant for Indian construction workers, buyers, builders and masons.

Expertise: material quantities, construction advice, waterproofing, foundation, plastering, tiling, pricing guidance, and Bricks app usage.

Rules:
- ALWAYS reply in the SAME language the user writes in (Telugu, Kannada, Tamil, Hindi, or English)
- Keep answers under 150 words — practical and direct
- For quantities: use standard Indian ratios (1:2:4 mix, thumb rules per sqft/cum)
- For prices: say "prices vary by region/season" and give a general INR range
- For app help: guide them through the Bricks app features (post requirements, find sellers, BOQ, RFQ, etc.)
- Never recommend competitors or external platforms
- If unsure, say "consult a local engineer" rather than guessing

Indian construction knowledge you must know:
- 1 sqft wall (4.5 inch) needs ~8 bricks and 0.4 bags cement
- M20 concrete: 1:1.5:3 (cement:sand:aggregate), needs 8 bags/cum
- 1 sqft floor tiling needs ~1.1 sqft tiles (10% wastage)
- Thumb rule: 1 bag cement = 50 kg, covers ~3 sqft plaster (12mm thick)`;

// ── Static FAQ — 100 entries, 5 languages, zero API cost ─────────────────────
const STATIC_FAQ = [

  // ═══════════════════════════ ENGLISH (1–30) ═══════════════════════════════

  { q: ['how many bricks', 'bricks for wall', 'brick count', 'bricks needed'],
    a: 'Brick Quantity (4.5-inch wall):\n• 1 sqft = ~8 bricks + 0.4 bags cement\n• 100 sqft = ~800 bricks + 40 bags cement\n• 1000 sqft = ~8,000 bricks + 400 bags cement\n\nAlways add 10% extra for wastage.' },

  { q: ['m20 concrete', 'concrete ratio', 'concrete mix', 'cement sand aggregate'],
    a: 'M20 Concrete Mix (1:1.5:3):\n• 1 part Cement : 1.5 Sand : 3 Aggregate\n• Per 1 cubic meter: 8 bags cement (400 kg), 600 kg sand, 1200 kg aggregate\n• Water-cement ratio: 0.5\n\nMost common mix for residential slabs, beams & columns.' },

  { q: ['waterproof bathroom', 'waterproofing', 'bathroom leak', 'wet area leak'],
    a: 'Bathroom Waterproofing Steps:\n1. Clean surface — remove dust, oil, loose paint\n2. Apply primer/bonding agent\n3. Apply Dr. Fixit / SikaTop — 2 coats\n4. Cure 48 hours\n5. Flood test — fill water for 24 hrs\n6. Then tile\n\nCover: full floor + 30cm up all walls + pipe joints.' },

  { q: ['roof slab', 'ceiling slab', 'slab cement', 'how much cement for roof', 'rcc slab'],
    a: 'RCC Roof Slab — 1000 sqft (M20, 4-inch thick):\n• Cement: 50 bags (2500 kg)\n• Sand: 3750 kg\n• Aggregate: 7500 kg\n• Steel: ~750 kg Fe500\n\nThumb rule: ₹1,500–1,800/sqft complete slab with labour.' },

  { q: ['plastering', 'plaster mix', 'wall plaster', 'cement plaster'],
    a: 'Wall Plastering:\n• Internal: 1:6 (cement:sand), 12mm thick\n• External: 1:4, 15–20mm thick\n• Per 100 sqft internal: 1.5 bags cement + 9 bags sand\n• 2 coats: scratch coat → finish coat\n• Cure 7 days by water spraying.' },

  { q: ['flooring tile', 'tiles needed', 'how many tiles', 'tile calculation', 'tile quantity'],
    a: 'Tile Quantity:\n• Always order 10% extra for cuts & breakage\n• 600×600mm tiles: 1 sqft = 1.1 tiles\n• 300×300mm tiles: 1 sqft = 1.1 tiles\n• Grout needed: ~1 kg per 100 sqft\n\nFormula: (Total area ÷ tile area) × 1.10' },

  { q: ['steel bar', 'rebar', 'how much steel', 'tmt bar', 'iron rod'],
    a: 'Steel (TMT Fe500) Thumb Rules:\n• Slab: 3–4 kg/sqft\n• Column: 2.5% of column volume\n• Beam: 1–2% of beam volume\n• Footing: 0.5–0.8% of footing volume\n\n1000 sqft slab ≈ 750–1000 kg steel\nPrice: ₹55–65/kg (region varies)' },

  { q: ['post requirement', 'how to post', 'get quotes bricks app', 'post req'],
    a: 'Post a Requirement on Bricks App:\n1. Tap "Post Req." on home screen\n2. Enter material name (cement, bricks, sand…)\n3. Add quantity & unit\n4. Set your location\n5. Submit — nearby sellers quote within hours!\n\nView all quotes in "My Quotations" tab.' },

  { q: ['boq', 'bill of quantities', 'material estimate', 'cost estimate', 'boq calculator'],
    a: 'BOQ Calculator on Bricks App:\n• Home → Pro Tools → BOQ Calculator\n• Enter project dimensions\n• Auto-calculates all materials\n• Uses live market prices\n• Save or convert to RFQ for bulk quotes\n\nBest for planning full house construction costs.' },

  { q: ['find seller', 'nearby seller', 'building material shop', 'buy material'],
    a: 'Find Sellers on Bricks App:\n• Browse by category from home screen\n• Post a Requirement → nearby sellers quote you\n• RFQ for bulk orders\n• Sellers are verified & rated\n• Compare quotes and accept the best\n\nNo need to visit multiple shops!' },

  { q: ['foundation', 'footing', 'pcc mix', 'foundation depth', 'plinth'],
    a: 'Foundation Basics:\n• Depth: min 3–4 ft (1–1.5m) for residential\n• PCC (lean concrete): 1:4:8, 100mm thick under footing\n• RCC footing: M20 concrete + Fe500 steel\n• Steps: Excavation → PCC → RCC footing → Plinth beam → Wall\n\nDo soil test before starting — load capacity varies.' },

  { q: ['cement type', 'opc 43', 'opc 53', 'ppc cement', 'which cement', 'best cement'],
    a: 'Cement Types:\n• OPC 43: General masonry, plaster, flooring — economical\n• OPC 53: High-strength RCC, precast — premium\n• PPC: Best for RCC, waterproof, reduces cracks — most popular\n• PSC: Coastal/humid areas — very durable\n\nRecommendation: PPC for all RCC, OPC 43 for masonry/plaster.' },

  { q: ['river sand', 'm sand', 'm-sand', 'manufactured sand', 'which sand', 'sand type'],
    a: 'Sand Types:\n• River Sand: Best quality, smooth — getting scarce & costly\n• M-Sand (Manufactured): Crushed stone, economical, good bond — widely available ✓\n• Pit Sand: For filling/backfill only — NOT for concrete/plaster\n• Sea Sand: Never use — salt corrodes steel\n\nBest value today: M-Sand.' },

  { q: ['concrete grade', 'm10', 'm15', 'm25', 'what grade concrete', 'which concrete grade'],
    a: 'Concrete Grade Guide:\n• M10 (1:3:6): PCC under foundations only\n• M15 (1:2:4): Light non-structural work\n• M20 (1:1.5:3): Standard residential RCC — slabs, beams, columns ✓\n• M25 (1:1:2): G+3 and above, commercial\n• M30+: Industrial — use RMC\n\nFor a normal home: M20 everywhere is fine.' },

  { q: ['curing', 'how long cure', 'curing time', 'water curing', 'when remove shuttering'],
    a: 'Curing Guide:\n• Start: 24 hrs after pouring\n• Minimum: 7 days wet (28 days for full strength)\n• Methods: wet gunny bags, pond curing, sand cover\n• Shuttering removal: Columns 2–3 days, Slabs 14–21 days, Beams 21 days\n• Plaster: 7 days, twice daily sprinkling\n\nSkipping curing = 30–40% strength loss!' },

  { q: ['paint quantity', 'how much paint', 'emulsion paint', 'wall paint litres', 'primer quantity'],
    a: 'Paint Quantity:\n• Emulsion: 1 litre = 100–120 sqft (2 coats)\n• Primer: 1 litre = 120–150 sqft\n• Putty: 1 kg = 30–35 sqft\n\n1000 sqft house (walls ~3500 sqft total):\n• Putty: 100 kg | Primer: 25L | Emulsion: 30–35L\n\nAdd 10% extra for touch-ups.' },

  { q: ['column size', 'pillar size', 'column dimensions', 'column reinforcement'],
    a: 'Standard Column Sizes:\n• G+0: 9"×9" (230×230mm), 4 bars 10mm Fe500\n• G+1: 9"×9", 4 bars 12mm Fe500\n• G+2: 9"×12" (230×300mm), 6 bars 12mm\n• G+3: 12"×12" (300×300mm), 8 bars 12mm\n\nMinimum: 9"×9". Get structural engineer design for G+2+.' },

  { q: ['beam size', 'beam dimensions', 'plinth beam', 'roof beam reinforcement'],
    a: 'Standard Beam Sizes:\n• Plinth beam: 9"×9", 4 bars 10mm\n• Floor beam (up to 10ft span): 9"×12", 4 bars 12mm\n• Floor beam (10–16ft): 9"×15", 4 bars 16mm\n\nRule of thumb: Beam depth = span ÷ 12 (minimum)\nAlways M20 concrete for beams.' },

  { q: ['dpc', 'damp proof course', 'rising damp', 'moisture wall', 'dampness'],
    a: 'DPC (Damp Proof Course):\n• Applied at plinth level to stop rising moisture\n• Method: 75mm PCC (1:2:4) + 2 coats hot bitumen\n• OR: Dr. Fixit Dampguard / Fosroc Brushbond\n\n1. Complete brickwork to plinth level\n2. Apply 75mm PCC\n3. Apply bitumen/waterproof coat\n4. Continue wall above\n\nSkipping DPC = damp walls, mold, peeling paint!' },

  { q: ['water tank size', 'overhead tank', 'water tank capacity', 'how many litres tank'],
    a: 'Water Tank Sizing:\n• 135 litres/person/day (CPHEEO standard)\n• 2 persons: 500L | 4 persons: 1000L | 6 persons: 2000L\n• Keep tank 6–8 ft above highest tap for good pressure\n• Underground sump: 3–5× overhead tank size\n\nBrands: Sintex, Ashirvad, Vectus (food-grade).' },

  { q: ['septic tank', 'sewage tank', 'toilet drainage', 'septic tank size'],
    a: 'Septic Tank Sizing (IS 2470):\n• 1 cubic meter per person\n• 2 persons: 1.5m×0.9m×1.2m\n• 4 persons: 2m×1m×1.5m (3 cu.m)\n• 6 persons: 2.5m×1.2m×1.5m\n\nMust have soak pit after septic tank.\nMin 15m from water source.\nClean every 2–3 years.' },

  { q: ['house cost', 'construction cost', 'cost per sqft', 'home building cost', 'rate per sqft'],
    a: 'House Construction Cost (India 2024):\n• Economy: ₹1,200–1,500/sqft\n• Standard: ₹1,500–2,000/sqft (good tiles, modular kitchen)\n• Premium: ₹2,000–3,000/sqft\n• Ultra premium: ₹3,000+/sqft\n\n1000 sqft: Economy ₹12–15L | Standard ₹15–20L\nUse Bricks BOQ for accurate estimates!' },

  { q: ['labour rate', 'mason rate', 'worker rate', 'carpenter rate', 'daily wage construction'],
    a: 'Labour Rates (South India 2024):\n• Mason: ₹800–1,200/day\n• Helper: ₹450–650/day\n• Bar bender: ₹800–1,000/day\n• Carpenter: ₹900–1,400/day\n• Painter: ₹700–1,000/day\n• Plumber/Electrician: ₹900–1,400/day\n\nNorth India ~20–30% lower. Peak season rates rise.' },

  { q: ['staircase', 'stair design', 'riser tread', 'staircase dimensions', 'steps size'],
    a: 'Staircase Design:\n• Riser: 150–175mm (6–7 inches)\n• Tread: 250–300mm (10–12 inches)\n• Width: min 900mm (3 ft) residential\n• ~17–20 steps for 10ft floor height\n• Rule: Riser + Tread = 430mm\n\nRCC staircase: M20 concrete, 100mm slab.\nGranite/marble treads popular in South India.' },

  { q: ['lintel', 'door lintel', 'window lintel', 'lintel size', 'chajja'],
    a: 'Lintel Sizing:\n• Depth: 150mm (6") standard\n• Width: same as wall (230mm / 9")\n• Length: opening + 600mm (300mm bearing each side)\n\nDoor 900mm opening → lintel 1500mm long\nWindow 1200mm → lintel 1800mm long\n\nConcrete: M20 | Steel: 2 bars 10mm bottom + 6mm stirrups\nSunshade/Chajja: 600mm projection, 75–100mm thick.' },

  { q: ['termite', 'anti termite', 'white ants', 'termite treatment', 'pest control'],
    a: 'Anti-Termite Treatment:\nPre-construction (best):\n• Trench around foundation — chlorpyrifos 1.5%, 5L/sq.m\n• Treat all plinth soil before screeding\n\nPost-construction:\n• Drill holes every 300mm along base of walls\n• Inject Fipronil (Termidor) under pressure\n\nCost: ₹3–8/sqft full house. Treat before tiling — much harder after.' },

  { q: ['compound wall', 'boundary wall', 'boundary wall cost', 'compound wall height'],
    a: 'Compound Wall:\n• Standard height: 5–6 ft (1.5–1.8m)\n• Construction: 4.5" brick wall, plaster both sides, coping on top\n\nPer 100 running ft, 5ft wall:\n• Bricks: ~3,500 | Cement: ~25 bags\n• Cost: ₹450–700/running ft\n\nPrecast panels: ₹300–500/ft, faster to install.' },

  { q: ['crack repair', 'wall crack', 'ceiling crack', 'hairline crack', 'structural crack'],
    a: 'Crack Repair Guide:\n• Hairline (<1mm): Putty + paint — no structural concern\n• Minor (1–3mm): Widen to V-shape, fill cement slurry + bonding agent\n• Wide (3–6mm): Epoxy injection or polymer mortar\n• Structural (>6mm or diagonal): STOP — call structural engineer!\n\nPrevention: proper curing, DPC, expansion joints every 10–15m.' },

  { q: ['ready mix concrete', 'rmc', 'ready mixed', 'batching plant', 'site mix vs rmc'],
    a: 'RMC vs Site Mix:\nRMC:\n✓ Consistent tested quality | ✓ Faster pouring\n• Min order: 1–3 cubic meters\n• Cost: ₹4,500–6,000/cum (M20)\n\nSite Mix:\n✓ Economical for small quantities | ✓ Flexible\n✗ Quality depends on skill\n\nRecommendation: RMC for all structural elements (slab, beams, columns).' },

  { q: ['rfq', 'request for quote', 'bulk order app', 'rfq bricks app'],
    a: 'RFQ (Request for Quotation) on Bricks App:\n1. Home → Pro Tools → RFQ\n2. Create New RFQ\n3. Add materials: name, quantity, unit\n4. Set delivery date & location\n5. Submit — multiple sellers quote in 24–48 hrs\n6. Compare & accept best offer\n\nBest for bulk orders: 50+ cement bags, sand/aggregate by ton, steel.' },

  // ═══════════════════════════ TELUGU (31–50) ═══════════════════════════════

  { q: ['ఇటుకలు ఎన్ని', 'ఇటుకలు కావాలి', 'గోడకు ఇటుకలు', 'ఇటుక లెక్క'],
    a: '4.5 అంగుళాల గోడకు ఇటుక లెక్క:\n• 1 sqft = ~8 ఇటుకలు + 0.4 సిమెంట్ బ్యాగులు\n• 100 sqft = ~800 ఇటుకలు + 40 బ్యాగులు\n• 1000 sqft = ~8,000 ఇటుకలు + 400 బ్యాగులు\n\n10% వేస్టేజ్ కోసం అదనంగా ఆర్డర్ చేయండి.' },

  { q: ['M20 కాంక్రీట్', 'కాంక్రీట్ నిష్పత్తి', 'సిమెంట్ ఇసుక నిష్పత్తి'],
    a: 'M20 కాంక్రీట్ మిక్స్ (1:1.5:3):\n• 1 భాగం సిమెంట్ : 1.5 ఇసుక : 3 గ్రావెల్\n• 1 cubic meter కి: 8 బ్యాగులు సిమెంట్, 600 kg ఇసుక, 1200 kg గ్రావెల్\n\nస్లాబ్, బీమ్, కాలమ్ అన్నిటికీ M20 ఉపయోగించండి.' },

  { q: ['వాటర్‌ప్రూఫ్', 'బాత్రూమ్ లీక్', 'నీరు పట్టకుండా', 'వాటర్‌ప్రూఫింగ్'],
    a: 'బాత్రూమ్ వాటర్‌ప్రూఫింగ్:\n1. సర్ఫేస్ శుభ్రం చేయండి\n2. ప్రైమర్ కోట్ వేయండి\n3. Dr. Fixit / SikaTop — 2 కోట్లు వేయండి\n4. 48 గంటలు ఆరనివ్వండి\n5. 24 గంటలు ఫ్లడ్ టెస్ట్\n6. తర్వాత టైల్స్ వేయండి\n\nముఖ్యమైన ప్రదేశాలు: నేల + గోడలు 30cm + పైపు జాయింట్లు.' },

  { q: ['పైకప్పు స్లాబ్', 'రూఫ్ స్లాబ్', 'స్లాబ్ సిమెంట్', 'చాకప్పు'],
    a: 'RCC పైకప్పు స్లాబ్ — 1000 sqft (M20, 4 అంగుళాలు):\n• సిమెంట్: 50 బ్యాగులు (2500 kg)\n• ఇసుక: 3750 kg\n• గ్రావెల్: 7500 kg\n• స్టీల్: ~750 kg Fe500\n\nఖర్చు: ₹1,500–1,800/sqft (కూలీతో సహా)\nస్లాబ్ తర్వాత 21 రోజులు తడి చేయండి.' },

  { q: ['ప్లాస్టరింగ్', 'గోడ ప్లాస్టర్', 'సిమెంట్ ప్లాస్టర్', 'ప్లాస్టర్ నిష్పత్తి'],
    a: 'గోడ ప్లాస్టరింగ్:\n• లోపలి గోడ: 1:6 (సిమెంట్:ఇసుక), 12mm\n• బయటి గోడ: 1:4, 15–20mm\n• 100 sqft కి: 1.5 బ్యాగ్ సిమెంట్ + 9 బ్యాగ్ ఇసుక\n• 2 పొరలు: రఫ్ కోట్ → ఫినిష్ కోట్\n• 7 రోజులు తడి చేయండి.' },

  { q: ['టైల్స్ ఎన్ని', 'ఫ్లోరింగ్ టైల్స్', 'టైల్ లెక్క', 'సెరామిక్ టైల్'],
    a: 'టైల్ పరిమాణం లెక్క:\n• 10% అదనంగా ఆర్డర్ చేయండి\n• 600×600mm టైల్: 1 sqft కి 1.1 టైల్\n• 100 sqft కి: ~28–30 టైల్లు\n• గ్రౌట్: 100 sqft కి ~1 kg\n\nBricks App లో సెల్లర్ల నుండి ధరలు పోల్చండి.' },

  { q: ['స్టీల్ ఎంత', 'TMT బార్', 'రీబార్ లెక్క', 'ఐరన్ కావాలి'],
    a: 'స్టీల్ (TMT Fe500) అంచనా:\n• స్లాబ్: 3–4 kg/sqft\n• కాలమ్: కాలమ్ వాల్యూమ్ లో 2.5%\n• బీమ్: బీమ్ వాల్యూమ్ లో 1–2%\n• ఫుటింగ్: 0.5–0.8%\n\n1000 sqft స్లాబ్ కి ~750 kg స్టీల్\nధర: ₹55–65/kg' },

  { q: ['requirement పోస్ట్', 'అవసరం పోస్ట్', 'bricks app వాడటం', 'ఏప్ లో ఎలా'],
    a: 'Bricks App లో Requirement పోస్ట్:\n1. హోమ్ స్క్రీన్ లో "Post Req." నొక్కండి\n2. మెటీరియల్ పేరు నమోదు చేయండి\n3. పరిమాణం & యూనిట్ జోడించండి\n4. లొకేషన్ సెట్ చేయండి\n5. సబ్మిట్ — దగ్గరి సెల్లర్లు గంటల్లో కోట్ పంపుతారు!\n\n"My Quotations" లో అన్ని కోట్లు చూడండి.' },

  { q: ['పునాది', 'ఫండేషన్', 'ఫుటింగ్', 'నేల తవ్వడం'],
    a: 'పునాది నిర్మాణం:\n• లోతు: కనీసం 3–4 అడుగులు (1–1.5m)\n• PCC మిక్స్: 1:4:8, 100mm మందం\n• RCC ఫుటింగ్: M20 కాంక్రీట్ + Fe500 స్టీల్\n\nదశలు: తవ్వకం → PCC → RCC ఫుటింగ్ → ప్లింత్ బీమ్ → గోడ\n\nముందే నేల పరీక్ష చేయించుకోండి.' },

  { q: ['సిమెంట్ రకాలు', 'ఏ సిమెంట్ వాడాలి', 'OPC PPC సిమెంట్'],
    a: 'సిమెంట్ రకాలు:\n• OPC 43: గోడలు, ప్లాస్టర్, ఫ్లోరింగ్ — అందుబాటు ధర\n• OPC 53: అధిక బలం కావాలసిన నిర్మాణాలకు\n• PPC: RCC కి అత్యుత్తమం, వాటర్‌ప్రూఫ్, పగుళ్లు తగ్గుతాయి — అత్యంత ప్రజాదరణ\n\nసిఫార్సు: RCC పనులకు PPC, గోడలు/ప్లాస్టర్ కు OPC 43.' },

  { q: ['క్యూరింగ్', 'కాంక్రీట్ తడి', 'ఎన్ని రోజులు నీళ్లు', 'కాంక్రీట్ ఎంత రోజులు'],
    a: 'క్యూరింగ్ నిర్దేశాలు:\n• 24 గంటల తర్వాత క్యూరింగ్ మొదలు పెట్టండి\n• కనీసం 7 రోజులు తడి (28 రోజులు పూర్తి బలం)\n• పద్ధతులు: తడి గోనె బట్టలు, ఇసుక పొర\n• స్లాబ్ ఫాంవర్క్: 14–21 రోజుల తర్వాత తీయండి\n• ప్లాస్టర్: 7 రోజులు, రోజుకు 2 సార్లు నీళ్లు\n\nక్యూరింగ్ లేకుంటే 30–40% బలం తగ్గుతుంది!' },

  { q: ['పెయింటింగ్', 'పెయింట్ ఎంత కావాలి', 'ఎమల్షన్ పెయింట్', 'గోడ రంగు'],
    a: 'పెయింట్ పరిమాణం:\n• ఎమల్షన్: 1 లీటర్ = 100–120 sqft (2 కోట్లు)\n• ప్రైమర్: 1 లీటర్ = 120–150 sqft\n• పుట్టీ: 1 kg = 30–35 sqft\n\n1000 sqft ఇంటి లోపలి గోడలకు (~3500 sqft):\n• పుట్టీ 100 kg | ప్రైమర్ 25L | ఎమల్షన్ 30–35L' },

  { q: ['ఇంటి ధర', 'నిర్మాణ ఖర్చు', 'sqft ధర', 'ఇల్లు కట్టడం ఖర్చు'],
    a: 'ఇంటి నిర్మాణ ఖర్చు (2024):\n• ఇకానమీ: ₹1,200–1,500/sqft\n• స్టాండర్డ్: ₹1,500–2,000/sqft\n• ప్రీమియం: ₹2,000–3,000/sqft\n\n1000 sqft ఇంటికి:\n• ఇకానమీ: ₹12–15 లక్షలు\n• స్టాండర్డ్: ₹15–20 లక్షలు\n\nఖచ్చితమైన అంచనా కోసం Bricks BOQ Calculator వాడండి!' },

  { q: ['కూలీ రేట్', 'మేస్త్రీ రేట్', 'కార్పెంటర్ రేట్', 'రోజు కూలి'],
    a: 'నిర్మాణ కూలీ రేట్లు (దక్షిణ భారతం 2024):\n• మేస్త్రీ: ₹800–1,200/రోజు\n• హెల్పర్: ₹450–650/రోజు\n• కార్పెంటర్: ₹900–1,400/రోజు\n• పెయింటర్: ₹700–1,000/రోజు\n• ప్లంబర్/ఎలక్ట్రీషియన్: ₹900–1,400/రోజు\n\nసీజన్ & ప్రాంతాన్ని బట్టి మారతాయి.' },

  { q: ['నీటి ట్యాంక్', 'ఓవర్‌హెడ్ ట్యాంక్', 'ట్యాంక్ సైజు', 'నీరు నిల్వ'],
    a: 'నీటి ట్యాంక్ సైజు:\n• 1 వ్యక్తికి: 135 లీటర్లు/రోజు\n• 2 మంది: 500L | 4 మంది: 1000L | 6 మంది: 2000L\n\nమంచి ఒత్తిడికి ట్యాంక్ అత్యున్నత నల్లా కంటే 6–8 అడుగులు పైన ఉంచండి.\nబ్రాండ్లు: Sintex, Ashirvad, Vectus.' },

  { q: ['కాంక్రీట్ గ్రేడ్', 'M10 M15 M25', 'ఏ కాంక్రీట్ వాడాలి'],
    a: 'కాంక్రీట్ గ్రేడ్ గైడ్:\n• M10 (1:3:6): పునాది కింద PCC మాత్రమే\n• M15 (1:2:4): చిన్న నిర్మాణాలకు\n• M20 (1:1.5:3): నివాస RCC — స్లాబ్, బీమ్, కాలమ్ ✓\n• M25 (1:1:2): అంతస్తులు 3+ కట్టడాలకు\n\nసాధారణ నిల్లుకు: అన్నిచోట్లా M20 సరిపోతుంది.' },

  { q: ['ఇసుక రకాలు', 'నది ఇసుక', 'M sand తెలుగు', 'మేనుఫాక్చర్డ్ ఇసుక'],
    a: 'ఇసుక రకాలు:\n• నది ఇసుక: అత్యుత్తమ నాణ్యత — కానీ ఖరీదు ఎక్కువ\n• M-Sand: పగులగొట్టిన రాయి, అందుబాటులో, ఆర్థికం — కాంక్రీట్ & ప్లాస్టర్ కోసం బాగుంది ✓\n• గోతి ఇసుక: నింపడానికి మాత్రమే\n• సముద్రపు ఇసుక: వాడకండి — ఉప్పు స్టీల్‌ను తుప్పు పట్టిస్తుంది\n\nసిఫార్సు: M-Sand.' },

  { q: ['కాలమ్ సైజు', 'పిల్లర్ సైజు', 'కాలమ్ పరిమాణం', 'స్తంభం సైజు'],
    a: 'కాలమ్ పరిమాణాలు (నివాస నిర్మాణం):\n• G+0: 9"×9" (230×230mm), 4 బార్లు 10mm Fe500\n• G+1: 9"×9", 4 బార్లు 12mm Fe500\n• G+2: 9"×12" (230×300mm), 6 బార్లు 12mm\n• G+3: 12"×12" (300×300mm), 8 బార్లు 12mm\n\nG+2 మరియు పైన: స్ట్రక్చరల్ ఇంజనీర్ సలహా తప్పనిసరి.' },

  { q: ['పగులు రిపేర్', 'గోడ పగులు', 'క్రాక్ రిపేర్', 'పగులు సరి చేయడం'],
    a: 'పగులు రిపేర్:\n• మందపాటి (<1mm): పుట్టీ + పెయింట్ — సమస్య కాదు\n• మధ్యస్థ (1–3mm): V ఆకారంలో చేసి, సిమెంట్ స్లర్రీ + బాండింగ్ ఏజెంట్\n• వెడల్పైన (3–6mm): ఎపాక్సీ ఇంజెక్షన్\n• నిర్మాణ పగులు (>6mm): STOP — స్ట్రక్చరల్ ఇంజనీర్‌ని సంప్రదించండి!' },

  { q: ['కాంపౌండ్ వాల్', 'సరిహద్దు గోడ', 'బౌండరీ వాల్ ఖర్చు'],
    a: 'కాంపౌండ్ వాల్:\n• సాధారణ ఎత్తు: 5–6 అడుగులు\n• 4.5" ఇటుక గోడ, రెండు వైపులా ప్లాస్టర్\n\n100 అడుగుల పొడవు, 5 అడుగుల ఎత్తుకు:\n• ఇటుకలు: ~3,500 | సిమెంట్: ~25 బ్యాగులు\n• ఖర్చు: ₹450–700/అడుగు\n\nప్రీకాస్ట్ ప్యానెల్స్: ₹300–500/అడుగు, వేగంగా వేయవచ్చు.' },

  // ═══════════════════════════ TAMIL (51–67) ════════════════════════════════

  { q: ['செங்கல் எத்தனை', 'சுவருக்கு செங்கல்', 'எத்தனை செங்கல்', 'செங்கல் கணக்கு'],
    a: '4.5 அங்குல சுவருக்கு செங்கல்:\n• 1 sqft = ~8 செங்கல் + 0.4 சிமெண்ட் பைகள்\n• 100 sqft = ~800 செங்கல் + 40 பைகள்\n• 1000 sqft = ~8,000 செங்கல் + 400 பைகள்\n\n10% கூடுதலாக ஆர்டர் செய்யுங்கள்.' },

  { q: ['M20 கான்கிரீட்', 'கான்கிரீட் விகிதம்', 'சிமெண்ட் மணல் விகிதம்'],
    a: 'M20 கான்கிரீட் கலவை (1:1.5:3):\n• 1 பங்கு சிமெண்ட் : 1.5 மணல் : 3 கல்\n• 1 cubic meter-க்கு: 8 பைகள் சிமெண்ட், 600 kg மணல், 1200 kg கல்\n\nஸ்லாப், கீல், தூண் அனைத்திற்கும் M20 பயன்படுத்துங்கள்.' },

  { q: ['வாட்டர்புரூஃப்', 'குளியலறை கசிவு', 'தண்ணீர் படாமல்', 'வாட்டர்புரூஃபிங்'],
    a: 'குளியலறை வாட்டர்புரூஃபிங்:\n1. மேற்பரப்பை சுத்தம் செய்யுங்கள்\n2. ப்ரைமர் தடவுங்கள்\n3. Dr. Fixit / SikaTop — 2 கோட்டுகள்\n4. 48 மணி உலர விடுங்கள்\n5. 24 மணி தண்ணீர் சோதனை\n6. டைல்ஸ் போடுங்கள்\n\nதரை + சுவர் 30cm + குழாய் இணைப்புகள் மூடவும்.' },

  { q: ['கூரை ஸ்லாப்', 'சீலிங் ஸ்லாப்', 'ஸ்லாப் சிமெண்ட்', 'கூரை சிமெண்ட்'],
    a: 'RCC கூரை ஸ்லாப் — 1000 sqft (M20, 4 அங்குல தடிமன்):\n• சிமெண்ட்: 50 பைகள் (2500 kg)\n• மணல்: 3750 kg\n• கல்: 7500 kg\n• ஸ்டீல்: ~750 kg Fe500\n\nசெலவு: ₹1,500–1,800/sqft (கூலி உட்பட)\nஸ்லாப் போட்ட பிறகு 21 நாட்கள் நனைக்கவும்.' },

  { q: ['பிளாஸ்டரிங்', 'சுவர் பிளாஸ்டர்', 'சிமெண்ட் பிளாஸ்டர்'],
    a: 'சுவர் பிளாஸ்டரிங்:\n• உள் சுவர்: 1:6 (சிமெண்ட்:மணல்), 12mm\n• வெளி சுவர்: 1:4, 15–20mm\n• 100 sqft-க்கு: 1.5 பைகள் சிமெண்ட் + 9 பைகள் மணல்\n• 2 அடுக்குகள்: ரஃப் கோட் → ஃபினிஷ் கோட்\n• 7 நாட்கள் நனைக்கவும்.' },

  { q: ['டைல்ஸ் எத்தனை', 'தரையில் டைல்', 'டைல் கணக்கு', 'செரமிக் டைல்'],
    a: 'டைல் அளவு:\n• 10% கூடுதலாக ஆர்டர் செய்யுங்கள்\n• 600×600mm டைல்: 1 sqft-க்கு 1.1 டைல்\n• 100 sqft அறைக்கு: ~28–30 டைல்கள்\n• க்ரவுட்: 100 sqft-க்கு ~1 kg\n\nBricks App-ல் விலை ஒப்பிட்டு வாங்குங்கள்.' },

  { q: ['ஸ்டீல் எவ்வளவு', 'TMT பார்', 'ரீபார் கணக்கு', 'இரும்பு தேவை'],
    a: 'ஸ்டீல் (TMT Fe500) மதிப்பீடு:\n• ஸ்லாப்: 3–4 kg/sqft\n• தூண்: தூண் கனத்தில் 2.5%\n• கீல்: கீல் கனத்தில் 1–2%\n• அடித்தளம்: 0.5–0.8%\n\n1000 sqft ஸ்லாப்-க்கு ~750 kg ஸ்டீல்\nவிலை: ₹55–65/kg' },

  { q: ['தேவை பதிவிட', 'requirement பதிவு', 'bricks app தேவை', 'கோட் பெற'],
    a: 'Bricks App-ல் தேவை பதிவிட:\n1. "Post Req." அழுத்துங்கள்\n2. பொருளின் பெயர் உள்ளிடுங்கள்\n3. அளவு & அலகு சேர்க்கவும்\n4. இடம் அமைக்கவும்\n5. சமர்ப்பிக்கவும் — விற்பனையாளர்கள் மணிக்குள் மேற்கோள் அனுப்புவர்!\n\n"My Quotations"-ல் அனைத்து கோட்களும் காணலாம்.' },

  { q: ['அடித்தளம்', 'அஸ்திவாரம்', 'ஃபவுண்டேஷன்', 'நீர்ப்பாசனம்'],
    a: 'அடித்தளம் நிர்மாணம்:\n• ஆழம்: குறைந்தது 3–4 அடி (1–1.5m)\n• PCC கலவை: 1:4:8, 100mm தடிமன்\n• RCC ஃபுட்டிங்: M20 + Fe500 ஸ்டீல்\n\nபடிகள்: தோண்டுதல் → PCC → RCC ஃபுட்டிங் → பிளிந்த் கீல் → சுவர்\n\nதொடங்குமுன் மண் சோதனை செய்யுங்கள்.' },

  { q: ['சிமெண்ட் வகை', 'எந்த சிமெண்ட்', 'OPC PPC சிமெண்ட்'],
    a: 'சிமெண்ட் வகைகள்:\n• OPC 43: சுவர்கள், பிளாஸ்டர், தரை — மலிவான விலை\n• OPC 53: அதிக வலிமை தேவையான கட்டிடங்களுக்கு\n• PPC: RCC-க்கு சிறந்தது, நீர்ப்புகா, வெடிப்பு குறைவு — மிகவும் பிரபலம் ✓\n\nRCC கட்டமைப்புக்கு PPC, சுவர்/பிளாஸ்டருக்கு OPC 43.' },

  { q: ['க்யூரிங் தமிழ்', 'கான்கிரீட் நனைக்கு', 'எத்தனை நாள் நீர்'],
    a: 'க்யூரிங் வழிகாட்டி:\n• ஊற்றிய 24 மணி பின் தொடங்குங்கள்\n• குறைந்தது 7 நாட்கள் ஈரமாக வைக்கவும்\n• ஃபார்ம்வொர்க் நீக்கம்: ஸ்லாப் 14–21 நாட்கள், கீல் 21 நாட்கள்\n• பிளாஸ்டர்: 7 நாட்கள் தினமும் இருமுறை தண்ணீர்\n\nக்யூரிங் இல்லாமல் 30–40% வலிமை இழப்பு!' },

  { q: ['பெயிண்டிங் தமிழ்', 'பெயிண்ட் எவ்வளவு', 'எமல்ஷன் பெயிண்ட்'],
    a: 'பெயிண்ட் அளவு:\n• எமல்ஷன்: 1 லிட்டர் = 100–120 sqft (2 கோட்டுகள்)\n• ப்ரைமர்: 1 லிட்டர் = 120–150 sqft\n• புட்டி: 1 kg = 30–35 sqft\n\n1000 sqft வீட்டு சுவர்களுக்கு (~3500 sqft):\n• புட்டி 100 kg | ப்ரைமர் 25L | எமல்ஷன் 30–35L' },

  { q: ['வீடு கட்டும் செலவு', 'கட்டுமான செலவு', 'sqft செலவு தமிழ்'],
    a: 'வீட்டு கட்டுமான செலவு (2024):\n• சாதாரண: ₹1,200–1,500/sqft\n• நிலையான: ₹1,500–2,000/sqft\n• உயர்தர: ₹2,000–3,000/sqft\n\n1000 sqft-க்கு:\n• சாதாரண: ₹12–15 லட்சம்\n• நிலையான: ₹15–20 லட்சம்\n\nBricks BOQ Calculator-ல் துல்லியமான மதிப்பீடு பெறுங்கள்!' },

  { q: ['கூலி விகிதம்', 'கட்டுமான கூலி', 'மேஸ்திரி கூலி', 'நாள் கூலி'],
    a: 'கட்டுமான கூலி (தென் இந்தியா 2024):\n• மேஸ்திரி: ₹800–1,200/நாள்\n• உதவியாளர்: ₹450–650/நாள்\n• தச்சர்: ₹900–1,400/நாள்\n• சாயம் பூசுபவர்: ₹700–1,000/நாள்\n• குழாய்/மின் பணியாளர்: ₹900–1,400/நாள்' },

  { q: ['தண்ணீர் தொட்டி', 'ஓவர்ஹெட் தொட்டி', 'தண்ணீர் சேமிப்பு தமிழ்'],
    a: 'தண்ணீர் தொட்டி அளவு:\n• 1 நபர் = 135 லிட்டர்/நாள்\n• 2 நபர்: 500L | 4 நபர்: 1000L | 6 நபர்: 2000L\n\nநல்ல அழுத்தத்திற்கு தொட்டியை அதிகமான குழாயை விட 6–8 அடி மேலே வையுங்கள்.\nBrands: Sintex, Ashirvad, Vectus.' },

  { q: ['கான்கிரீட் தரங்கள்', 'M10 M15 M25 தமிழ்', 'எந்த கான்கிரீட்'],
    a: 'கான்கிரீட் தர வழிகாட்டி:\n• M10 (1:3:6): அடித்தளத்தின் கீழ் PCC மட்டும்\n• M15 (1:2:4): சிறிய கட்டமைப்புகளுக்கு\n• M20 (1:1.5:3): வழக்கமான குடியிருப்பு RCC ✓\n• M25 (1:1:2): 3+ மாடி கட்டிடங்களுக்கு\n\nசாதாரண வீட்டிற்கு எல்லா இடங்களிலும் M20 போதும்.' },

  { q: ['மணல் வகை', 'ஆற்று மணல்', 'M sand தமிழ்', 'கட்டுமான மணல்'],
    a: 'மணல் வகைகள்:\n• ஆற்று மணல்: சிறந்த தரம் — விலை அதிகம்\n• M-Sand (செயற்கை மணல்): நொறுக்கப்பட்ட கல், மலிவு, கான்கிரீட் & பிளாஸ்டருக்கு நல்லது ✓\n• குழி மணல்: நிரப்புவதற்கு மட்டும்\n• கடல் மணல்: வேண்டாம் — உப்பு ஸ்டீலை அரிக்கும்\n\nபரிந்துரை: M-Sand சிறந்த தேர்வு.' },

  // ═══════════════════════════ KANNADA (68–84) ══════════════════════════════

  { q: ['ಇಟ್ಟಿಗೆ ಎಷ್ಟು', 'ಗೋಡೆಗೆ ಇಟ್ಟಿಗೆ', 'ಇಟ್ಟಿಗೆ ಲೆಕ್ಕ', 'ಗೋಡೆ ಇಟ್ಟಿಗೆ'],
    a: '4.5 ಅಂಗುಲ ಗೋಡೆಗೆ ಇಟ್ಟಿಗೆ ಲೆಕ್ಕ:\n• 1 sqft = ~8 ಇಟ್ಟಿಗೆ + 0.4 ಸಿಮೆಂಟ್ ಚೀಲ\n• 100 sqft = ~800 ಇಟ್ಟಿಗೆ + 40 ಚೀಲ\n• 1000 sqft = ~8,000 ಇಟ್ಟಿಗೆ + 400 ಚೀಲ\n\n10% ಹೆಚ್ಚುವರಿ ಆರ್ಡರ್ ಮಾಡಿ.' },

  { q: ['M20 ಕಾಂಕ್ರೀಟ್', 'ಕಾಂಕ್ರೀಟ್ ಅನುಪಾತ', 'ಸಿಮೆಂಟ್ ಮರಳು ಅನುಪಾತ'],
    a: 'M20 ಕಾಂಕ್ರೀಟ್ ಮಿಶ್ರಣ (1:1.5:3):\n• 1 ಭಾಗ ಸಿಮೆಂಟ್ : 1.5 ಮರಳು : 3 ಜಲ್ಲಿ\n• 1 cubic meter ಗೆ: 8 ಚೀಲ ಸಿಮೆಂಟ್, 600 kg ಮರಳು, 1200 kg ಜಲ್ಲಿ\n\nಸ್ಲ್ಯಾಬ್, ಕಿರಣ, ಕಾಲಮ್ ಎಲ್ಲದಕ್ಕೂ M20 ಬಳಸಿ.' },

  { q: ['ವಾಟರ್‌ಪ್ರೂಫ್', 'ಬಾತ್‌ರೂಮ್ ಸೋರುವಿಕೆ', 'ನೀರು ಆಗದಂತೆ', 'ವಾಟರ್‌ಪ್ರೂಫಿಂಗ್'],
    a: 'ಬಾತ್‌ರೂಮ್ ವಾಟರ್‌ಪ್ರೂಫಿಂಗ್:\n1. ಮೇಲ್ಮೈ ಸ್ವಚ್ಛ ಮಾಡಿ\n2. ಪ್ರೈಮರ್ ಕೋಟ್ ಹಚ್ಚಿ\n3. Dr. Fixit / SikaTop — 2 ಪದರ\n4. 48 ಗಂಟೆ ಒಣಗಲು ಬಿಡಿ\n5. 24 ಗಂಟೆ ನೀರು ಪರೀಕ್ಷೆ\n6. ಟೈಲ್ಸ್ ಹಾಕಿ\n\nನೆಲ + ಗೋಡೆ 30cm + ಕೊಳಾಯಿ ಜಾಯಿಂಟ್‌ಗಳು ಮುಚ್ಚಿ.' },

  { q: ['ಚಾವಣಿ ಸ್ಲ್ಯಾಬ್', 'ರೂಫ್ ಸ್ಲ್ಯಾಬ್', 'ಸ್ಲ್ಯಾಬ್ ಸಿಮೆಂಟ್'],
    a: 'RCC ಚಾವಣಿ ಸ್ಲ್ಯಾಬ್ — 1000 sqft (M20, 4 ಅಂಗುಲ):\n• ಸಿಮೆಂಟ್: 50 ಚೀಲ (2500 kg)\n• ಮರಳು: 3750 kg\n• ಜಲ್ಲಿ: 7500 kg\n• ಸ್ಟೀಲ್: ~750 kg Fe500\n\nಖರ್ಚು: ₹1,500–1,800/sqft (ಕೂಲಿ ಸೇರಿ)\nಸ್ಲ್ಯಾಬ್ ನಂತರ 21 ದಿನ ನೆನೆಸಿ.' },

  { q: ['ಪ್ಲಾಸ್ಟರಿಂಗ್', 'ಗೋಡೆ ಪ್ಲಾಸ್ಟರ್', 'ಸಿಮೆಂಟ್ ಪ್ಲಾಸ್ಟರ್'],
    a: 'ಗೋಡೆ ಪ್ಲಾಸ್ಟರಿಂಗ್:\n• ಒಳ ಗೋಡೆ: 1:6 (ಸಿಮೆಂಟ್:ಮರಳು), 12mm\n• ಹೊರ ಗೋಡೆ: 1:4, 15–20mm\n• 100 sqft ಗೆ: 1.5 ಚೀಲ ಸಿಮೆಂಟ್ + 9 ಚೀಲ ಮರಳು\n• 2 ಪದರ: ರಫ್ → ಫಿನಿಶ್ ಕೋಟ್\n• 7 ದಿನ ನೀರು ಹಾಕಿ.' },

  { q: ['ಟೈಲ್ಸ್ ಎಷ್ಟು', 'ಫ್ಲೋರಿಂಗ್ ಟೈಲ್', 'ಟೈಲ್ ಲೆಕ್ಕ'],
    a: 'ಟೈಲ್ ಪ್ರಮಾಣ:\n• 10% ಹೆಚ್ಚುವರಿ ಆರ್ಡರ್ ಮಾಡಿ\n• 600×600mm ಟೈಲ್: 1 sqft ಗೆ 1.1 ಟೈಲ್\n• 100 sqft ಕೋಣೆಗೆ: ~28–30 ಟೈಲ್ಗಳು\n• ಗ್ರೌಟ್: 100 sqft ಗೆ ~1 kg\n\nBricks App ನಲ್ಲಿ ಹತ್ತಿರದ ಮಾರಾಟಗಾರರಿಂದ ಬೆಲೆ ಹೋಲಿಸಿ.' },

  { q: ['ಸ್ಟೀಲ್ ಎಷ್ಟು', 'TMT ಬಾರ್', 'ರೀಬಾರ್ ಲೆಕ್ಕ'],
    a: 'ಸ್ಟೀಲ್ (TMT Fe500) ಮೆದು ನಿಯಮಗಳು:\n• ಸ್ಲ್ಯಾಬ್: 3–4 kg/sqft\n• ಕಾಲಮ್: ಗಾತ್ರದ 2.5%\n• ಕಿರಣ: ಗಾತ್ರದ 1–2%\n• ಅಡಿಪಾಯ: 0.5–0.8%\n\n1000 sqft ಸ್ಲ್ಯಾಬ್ ಗೆ ~750 kg\nಬೆಲೆ: ₹55–65/kg' },

  { q: ['ಅವಶ್ಯಕತೆ ಪೋಸ್ಟ್', 'bricks app ಕನ್ನಡ', 'requirement ಹೇಗೆ'],
    a: 'Bricks App ನಲ್ಲಿ Requirement ಪೋಸ್ಟ್:\n1. "Post Req." ಒತ್ತಿ\n2. ವಸ್ತುವಿನ ಹೆಸರು ನಮೂದಿಸಿ\n3. ಪ್ರಮಾಣ & ಘಟಕ ಸೇರಿಸಿ\n4. ಸ್ಥಳ ಹೊಂದಿಸಿ\n5. ಸಲ್ಲಿಸಿ — ಹತ್ತಿರದ ಮಾರಾಟಗಾರರು ಗಂಟೆಗಳಲ್ಲಿ ಉಲ್ಲೇಖ ಕಳುಹಿಸುತ್ತಾರೆ!' },

  { q: ['ಅಡಿಪಾಯ', 'ಫೌಂಡೇಶನ್', 'ತಳಪಾಯ', 'ಅಡಿಪಾಯ ಆಳ'],
    a: 'ಅಡಿಪಾಯ ನಿರ್ಮಾಣ:\n• ಆಳ: ಕನಿಷ್ಠ 3–4 ಅಡಿ (1–1.5m)\n• PCC ಮಿಶ್ರಣ: 1:4:8, 100mm ದಪ್ಪ\n• RCC ಫೂಟಿಂಗ್: M20 + Fe500 ಸ್ಟೀಲ್\n\nಹಂತಗಳು: ಅಗೆಯುವಿಕೆ → PCC → RCC ಫೂಟಿಂಗ್ → ಪ್ಲಿಂತ್ ಕಿರಣ → ಗೋಡೆ\n\nಮಣ್ಣು ಪರೀಕ್ಷೆ ಮೊದಲು ಮಾಡಿ.' },

  { q: ['ಸಿಮೆಂಟ್ ವಿಧಗಳು', 'ಯಾವ ಸಿಮೆಂಟ್', 'OPC PPC ಕನ್ನಡ'],
    a: 'ಸಿಮೆಂಟ್ ವಿಧಗಳು:\n• OPC 43: ಗೋಡೆ, ಪ್ಲಾಸ್ಟರ್, ನೆಲ — ಕಡಿಮೆ ಬೆಲೆ\n• OPC 53: ಅಧಿಕ ಶಕ್ತಿ ರಚನೆಗಳಿಗೆ\n• PPC: RCC ಗೆ ಅತ್ಯುತ್ತಮ, ನೀರು-ನಿರೋಧಕ, ಬಿರುಕು ತಡೆಯುತ್ತದೆ ✓\n\nRCC ಗೆ PPC, ಗೋಡೆ/ಪ್ಲಾಸ್ಟರ್ ಗೆ OPC 43 ಬಳಸಿ.' },

  { q: ['ಕ್ಯೂರಿಂಗ್', 'ಕಾಂಕ್ರೀಟ್ ನೆನೆಸು', 'ಎಷ್ಟು ದಿನ ನೀರು ಕನ್ನಡ'],
    a: 'ಕ್ಯೂರಿಂಗ್ ಮಾರ್ಗದರ್ಶನ:\n• 24 ಗಂಟೆ ನಂತರ ಪ್ರಾರಂಭಿಸಿ\n• ಕನಿಷ್ಠ 7 ದಿನ ಒದ್ದೆ (28 ದಿನ ಪೂರ್ಣ ಶಕ್ತಿ)\n• ಸ್ಲ್ಯಾಬ್ ಫಾರ್ಮ್‌ವರ್ಕ್: 14–21 ದಿನ ನಂತರ ತೆಗೆಯಿರಿ\n• ಪ್ಲಾಸ್ಟರ್: 7 ದಿನ, ದಿನಕ್ಕೆ 2 ಬಾರಿ ನೀರು\n\nಕ್ಯೂರಿಂಗ್ ಇಲ್ಲದಿದ್ದರೆ 30–40% ಶಕ್ತಿ ಕಡಿಮೆ!' },

  { q: ['ಪೇಂಟಿಂಗ್', 'ಪೇಂಟ್ ಎಷ್ಟು ಬೇಕು', 'ಎಮಲ್ಷನ್ ಪೇಂಟ್ ಕನ್ನಡ'],
    a: 'ಪೇಂಟ್ ಪ್ರಮಾಣ:\n• ಎಮಲ್ಷನ್: 1 ಲೀಟರ್ = 100–120 sqft (2 ಪದರ)\n• ಪ್ರೈಮರ್: 1 ಲೀಟರ್ = 120–150 sqft\n• ಪುಟ್ಟಿ: 1 kg = 30–35 sqft\n\n1000 sqft ಮನೆ (~3500 sqft ಗೋಡೆ):\n• ಪುಟ್ಟಿ 100 kg | ಪ್ರೈಮರ್ 25L | ಎಮಲ್ಷನ್ 30–35L' },

  { q: ['ಮನೆ ನಿರ್ಮಾಣ ವೆಚ್ಚ', 'sqft ದರ ಕನ್ನಡ', 'ಮನೆ ಕಟ್ಟಲು ಖರ್ಚು'],
    a: 'ಮನೆ ನಿರ್ಮಾಣ ವೆಚ್ಚ (2024):\n• ಇಕಾನಮಿ: ₹1,200–1,500/sqft\n• ಸ್ಟ್ಯಾಂಡರ್ಡ್: ₹1,500–2,000/sqft\n• ಪ್ರೀಮಿಯಂ: ₹2,000–3,000/sqft\n\n1000 sqft ಮನೆಗೆ:\n• ಇಕಾನಮಿ: ₹12–15 ಲಕ್ಷ\n• ಸ್ಟ್ಯಾಂಡರ್ಡ್: ₹15–20 ಲಕ್ಷ\n\nBricks BOQ Calculator ನಲ್ಲಿ ನಿಖರ ಮೌಲ್ಯಮಾಪನ ಪಡೆಯಿರಿ!' },

  { q: ['ಕೂಲಿ ದರ ಕನ್ನಡ', 'ಕಟ್ಟಡ ಕೂಲಿ', 'ಮೇಸ್ತ್ರಿ ದರ ಕನ್ನಡ'],
    a: 'ನಿರ್ಮಾಣ ಕೂಲಿ ದರ (ದಕ್ಷಿಣ ಭಾರತ 2024):\n• ಮೇಸ್ತ್ರಿ: ₹800–1,200/ದಿನ\n• ಸಹಾಯಕ: ₹450–650/ದಿನ\n• ಬಡಗಿ: ₹900–1,400/ದಿನ\n• ಬಣ್ಣ ಕೆಲಸಗಾರ: ₹700–1,000/ದಿನ\n• ಪ್ಲಂಬರ್/ಎಲೆಕ್ಟ್ರಿಷಿಯನ್: ₹900–1,400/ದಿನ' },

  { q: ['ನೀರಿನ ಟ್ಯಾಂಕ್', 'ಓವರ್‌ಹೆಡ್ ಟ್ಯಾಂಕ್ ಕನ್ನಡ', 'ನೀರು ಸಂಗ್ರಹ'],
    a: 'ನೀರಿನ ಟ್ಯಾಂಕ್ ಅಳತೆ:\n• 1 ವ್ಯಕ್ತಿಗೆ: 135 ಲೀಟರ್/ದಿನ\n• 2 ಮಂದಿ: 500L | 4 ಮಂದಿ: 1000L | 6 ಮಂದಿ: 2000L\n\nಉತ್ತಮ ಒತ್ತಡಕ್ಕೆ ಟ್ಯಾಂಕ್ ಅತ್ಯಧಿಕ ನಲ್ಲಿಗಿಂತ 6–8 ಅಡಿ ಎತ್ತರದಲ್ಲಿ ಇಡಿ.' },

  { q: ['ಕಾಂಕ್ರೀಟ್ ಗ್ರೇಡ್', 'M10 M15 M25 ಕನ್ನಡ', 'ಯಾವ ಕಾಂಕ್ರೀಟ್'],
    a: 'ಕಾಂಕ್ರೀಟ್ ಗ್ರೇಡ್ ಮಾರ್ಗದರ್ಶಿ:\n• M10 (1:3:6): ಅಡಿಪಾಯದ ಕೆಳಗೆ PCC\n• M15 (1:2:4): ಸಣ್ಣ ರಚನೆಗಳಿಗೆ\n• M20 (1:1.5:3): ಸಾಮಾನ್ಯ ವಸತಿ RCC ✓\n• M25 (1:1:2): 3+ ಮಹಡಿ ಕಟ್ಟಡಗಳಿಗೆ\n\nಸಾಮಾನ್ಯ ಮನೆಗೆ ಎಲ್ಲೆಡೆ M20 ಸಾಕು.' },

  { q: ['ಮರಳಿನ ವಿಧಗಳು', 'ನದಿ ಮರಳು', 'M sand ಕನ್ನಡ'],
    a: 'ಮರಳಿನ ವಿಧಗಳು:\n• ನದಿ ಮರಳು: ಉತ್ತಮ ಗುಣ — ದುಬಾರಿ\n• M-Sand: ಪುಡಿ ಕಲ್ಲು, ಮಿತ ಬೆಲೆ, ಕಾಂಕ್ರೀಟ್ & ಪ್ಲಾಸ್ಟರ್‌ಗೆ ಉತ್ತಮ ✓\n• ಗುಂಡಿ ಮರಳು: ತುಂಬಲು ಮಾತ್ರ\n• ಸಮುದ್ರ ಮರಳು: ಬೇಡ — ಉಪ್ಪು ಸ್ಟೀಲ್ ತಿನ್ನುತ್ತದೆ\n\nಶಿಫಾರಸು: M-Sand ಉತ್ತಮ ಆಯ್ಕೆ.' },

  // ═══════════════════════════ HINDI (85–100) ═══════════════════════════════

  { q: ['ईंट कितनी', 'दीवार के लिए ईंटें', 'ईंटों की गिनती', 'कितनी ईंटें चाहिए'],
    a: '4.5 इंच मोटी दीवार के लिए ईंटें:\n• 1 sqft = ~8 ईंट + 0.4 बैग सीमेंट\n• 100 sqft = ~800 ईंट + 40 बैग\n• 1000 sqft = ~8,000 ईंट + 400 बैग\n\n10% waste के लिए extra order करें।' },

  { q: ['M20 कंक्रीट', 'कंक्रीट अनुपात', 'सीमेंट बालू अनुपात', 'कंक्रीट मिक्स'],
    a: 'M20 कंक्रीट मिक्स (1:1.5:3):\n• 1 भाग सीमेंट : 1.5 बालू : 3 गिट्टी\n• 1 cubic meter में: 8 बैग सीमेंट, 600 kg बालू, 1200 kg गिट्टी\n\nस्लैब, बीम, कॉलम सभी के लिए M20 उपयोग करें।' },

  { q: ['वाटरप्रूफ', 'बाथरूम लीक', 'पानी न आए', 'नमी रोकना'],
    a: 'बाथरूम वाटरप्रूफिंग:\n1. सतह साफ करें\n2. प्राइमर कोट लगाएं\n3. Dr. Fixit / SikaTop — 2 कोट\n4. 48 घंटे सूखने दें\n5. 24 घंटे flood test\n6. फिर टाइल लगाएं\n\nफर्श + दीवार 30cm + पाइप joints जरूर cover करें।' },

  { q: ['छत स्लैब', 'सीलिंग स्लैब', 'छत का सीमेंट', 'स्लैब सामग्री'],
    a: 'RCC छत स्लैब — 1000 sqft (M20, 4 इंच):\n• सीमेंट: 50 बैग (2500 kg)\n• बालू: 3750 kg\n• गिट्टी: 7500 kg\n• स्टील: ~750 kg Fe500\n\nखर्च: ₹1,500–1,800/sqft (मजदूरी सहित)\nस्लैब के बाद 21 दिन पानी डालें।' },

  { q: ['प्लास्टरिंग', 'दीवार पलस्तर', 'सीमेंट पलस्तर', 'प्लास्टर अनुपात'],
    a: 'दीवार पलस्तर:\n• अंदरूनी: 1:6 (सीमेंट:बालू), 12mm\n• बाहरी: 1:4, 15–20mm\n• 100 sqft के लिए: 1.5 बैग सीमेंट + 9 बैग बालू\n• 2 परत: पहले rough, फिर finish\n• 7 दिन पानी से तर रखें।' },

  { q: ['टाइल्स कितनी', 'फ्लोरिंग टाइल', 'टाइल गणना', 'सेरामिक टाइल'],
    a: 'टाइल मात्रा:\n• 10% अतिरिक्त order करें\n• 600×600mm टाइल: 1 sqft = 1.1 टाइल\n• 100 sqft कमरे के लिए: ~28–30 टाइल्स\n• Grout: 100 sqft के लिए ~1 kg\n\nBricks App पर पास के विक्रेताओं से दाम तुलना करें।' },

  { q: ['स्टील कितना', 'TMT बार', 'सरिया', 'लोहा कितना चाहिए'],
    a: 'स्टील (TMT Fe500) thumb rules:\n• स्लैब: 3–4 kg/sqft\n• कॉलम: कॉलम volume का 2.5%\n• बीम: बीम volume का 1–2%\n• नींव footing: 0.5–0.8%\n\n1000 sqft स्लैब के लिए ~750 kg\nवर्तमान दाम: ₹55–65/kg' },

  { q: ['requirement कैसे डालें', 'bricks app requirement', 'सामान की मांग'],
    a: 'Bricks App पर Requirement कैसे डालें:\n1. "Post Req." दबाएं\n2. सामान का नाम डालें\n3. मात्रा & यूनिट जोड़ें\n4. अपना स्थान set करें\n5. Submit — पास के विक्रेता घंटों में quote भेजेंगे!\n\n"My Quotations" में सभी quote देखें।' },

  { q: ['नींव', 'फाउंडेशन', 'नींव की गहराई', 'नींव कैसे बनाएं'],
    a: 'नींव निर्माण:\n• गहराई: कम से कम 3–4 फीट (1–1.5m)\n• PCC mix: 1:4:8, 100mm मोटाई\n• RCC footing: M20 कंक्रीट + Fe500 स्टील\n\nचरण: खुदाई → PCC → RCC footing → Plinth beam → दीवार\n\nशुरू से पहले मिट्टी परीक्षण करवाएं।' },

  { q: ['सीमेंट के प्रकार', 'कौन सा सीमेंट', 'OPC PPC सीमेंट', 'सीमेंट ग्रेड'],
    a: 'सीमेंट के प्रकार:\n• OPC 43: दीवार, पलस्तर, फर्श — किफायती\n• OPC 53: ऊंची ताकत वाले structures के लिए\n• PPC: RCC के लिए सर्वश्रेष्ठ, waterproof, दरारें कम ✓\n\nRCC के लिए PPC, दीवार/पलस्तर के लिए OPC 43 प्रयोग करें।' },

  { q: ['क्यूरिंग', 'कंक्रीट को पानी', 'कितने दिन पानी', 'क्यूरिंग समय'],
    a: 'क्यूरिंग निर्देश:\n• डालने के 24 घंटे बाद शुरू करें\n• कम से कम 7 दिन गीला रखें (28 दिन पूरी ताकत)\n• स्लैब formwork: 14–21 दिन बाद हटाएं\n• पलस्तर: 7 दिन, रोज 2 बार पानी छिड़कें\n\nक्यूरिंग न करने पर 30–40% ताकत कम होती है!' },

  { q: ['पेंटिंग', 'पेंट कितना', 'इमल्शन पेंट', 'दीवार रंग कितना'],
    a: 'पेंट मात्रा:\n• इमल्शन: 1 लीटर = 100–120 sqft (2 कोट)\n• प्राइमर: 1 लीटर = 120–150 sqft\n• पुट्टी: 1 kg = 30–35 sqft\n\n1000 sqft मकान (~3500 sqft दीवार):\n• पुट्टी 100 kg | प्राइमर 25L | इमल्शन 30–35L' },

  { q: ['मकान की लागत', 'निर्माण खर्च', 'sqft का रेट', 'घर बनाने का खर्च'],
    a: 'मकान निर्माण लागत (2024):\n• Economy: ₹1,200–1,500/sqft\n• Standard: ₹1,500–2,000/sqft\n• Premium: ₹2,000–3,000/sqft\n\n1000 sqft मकान:\n• Economy: ₹12–15 लाख\n• Standard: ₹15–20 लाख\n\nBricks App BOQ Calculator से सटीक अनुमान लगाएं!' },

  { q: ['मजदूरी दर', 'राजमिस्त्री दर', 'मजदूर दर', 'रोजाना मजदूरी'],
    a: 'निर्माण मजदूरी दरें (2024):\n• राजमिस्त्री: ₹700–1,100/दिन\n• Helper: ₹400–600/दिन\n• बढ़ई: ₹800–1,300/दिन\n• पेंटर: ₹600–1,000/दिन\n• प्लंबर/इलेक्ट्रीशियन: ₹800–1,200/दिन\n\nराज्य और मौसम के अनुसार दरें बदलती हैं।' },

  { q: ['पानी की टंकी', 'ओवरहेड टंकी', 'पानी भंडारण', 'टंकी का आकार'],
    a: 'पानी की टंकी का आकार:\n• 1 व्यक्ति = 135 लीटर/दिन\n• 2 लोग: 500L | 4 लोग: 1000L | 6 लोग: 2000L\n\nअच्छे दबाव के लिए टंकी सबसे ऊंचे नल से 6–8 फीट ऊपर रखें।\nBrands: Sintex, Ashirvad, Vectus.' },

  { q: ['कंक्रीट ग्रेड', 'M10 M15 M25 हिंदी', 'कौन सा कंक्रीट चाहिए'],
    a: 'कंक्रीट ग्रेड guide:\n• M10 (1:3:6): नींव के नीचे PCC\n• M15 (1:2:4): हल्के structures के लिए\n• M20 (1:1.5:3): सामान्य residential RCC ✓\n• M25 (1:1:2): 3+ मंजिल इमारतों के लिए\n\nसामान्य मकान के लिए हर जगह M20 पर्याप्त है।' },

];

// Match question against static FAQ
function findStaticAnswer(question) {
  const q = question.toLowerCase();
  for (const entry of STATIC_FAQ) {
    if (entry.q.some(kw => q.includes(kw.toLowerCase()))) {
      return entry.a;
    }
  }
  return null;
}



// ── Helpers ───────────────────────────────────────────────────────────────────
const hashQuestion = (text) =>
    crypto.createHash('md5').update(text.toLowerCase().trim()).digest('hex');

const todayKey = () => new Date().toISOString().slice(0, 10);  // "2024-01-15"

// ── Rate limit check ──────────────────────────────────────────────────────────
async function checkAndIncrementUsage(userId) {
    const key = todayKey();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const usage = await AiUsage.findOneAndUpdate(
        { user_id: userId, date_key: key },
        { $inc: { count: 1 }, $setOnInsert: { expires_at: tomorrow } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // The increment already happened — check if it exceeded limit
    return usage.count;
}

// ── Call Groq API ─────────────────────────────────────────────────────────────
async function callGroq(messages, maxTokens = MAX_TOKENS_EN) {
    const resp = await axios.post(
        GROQ_API_URL,
        {
            model:      GROQ_MODEL,
            messages,
            max_tokens: maxTokens,
            temperature: 0.4,   // lower = more factual for construction advice
        },
        {
            headers: {
                'Authorization': `Bearer ${getKey()}`,
                'Content-Type':  'application/json',
            },
            timeout: 15000,
        }
    );
    return resp.data.choices[0].message.content.trim();
}

// ── POST /api/ai/chat ─────────────────────────────────────────────────────────
exports.chat = async (req, res) => {
    try {
        const userId   = req.user?.id || req.user?._id || 'anonymous';
        const { message, history = [] } = req.body;

        if (!message || typeof message !== 'string' || message.trim().length < 2) {
            return res.status(400).json({ error: true, message: 'message is required' });
        }

        const cleanMsg = message.trim().slice(0, 500);  // cap input length

        // ── 1. Rate limit ─────────────────────────────────────────────────────
        const usageCount = await checkAndIncrementUsage(userId);
        if (usageCount > DAILY_LIMIT) {
            return res.status(429).json({
                error:        true,
                rate_limited: true,
                message:      `Daily limit of ${DAILY_LIMIT} questions reached. Come back tomorrow!`,
                message_hi:   `आज की ${DAILY_LIMIT} सवालों की सीमा समाप्त हो गई। कल फिर आएं!`,
                message_te:   `రోజువారీ ${DAILY_LIMIT} ప్రశ్నల పరిమితి అయిపోయింది. రేపు తిరిగి రండి!`,
                message_ta:   `இன்றைய ${DAILY_LIMIT} கேள்விகள் தீர்ந்தன. நாளை வாருங்கள்!`,
                message_kn:   `ಇಂದಿನ ${DAILY_LIMIT} ಪ್ರಶ್ನೆಗಳ ಮಿತಿ ಮೀರಿದೆ. ನಾಳೆ ಬನ್ನಿ!`,
            });
        }

        // ── 2. Cache lookup ───────────────────────────────────────────────────
        const qHash = hashQuestion(cleanMsg);
        const cached = await AiCache.findOneAndUpdate(
            { question_hash: qHash },
            { $inc: { hit_count: 1 }, $set: { last_hit: new Date() } },
            { new: true }
        );

        if (cached) {
            return res.json({
                error:    false,
                answer:   cached.answer_text,
                cached:   true,
                usage:    usageCount,
                limit:    DAILY_LIMIT,
                remaining: Math.max(0, DAILY_LIMIT - usageCount),
            });
        }

        // ── 3. Static FAQ check (zero API cost) ─────────────────────────────────
        const staticAnswer = findStaticAnswer(cleanMsg);
        if (staticAnswer) {
            // Cache it too for future hash-based hits
            AiCache.create({ question_hash: qHash, question_text: cleanMsg, answer_text: staticAnswer })
                   .catch(() => {});
            return res.json({
                error: false, answer: staticAnswer, cached: false,
                usage: usageCount, limit: DAILY_LIMIT,
                remaining: Math.max(0, DAILY_LIMIT - usageCount),
            });
        }

        // ── 4. Build message array for Groq ───────────────────────────────────
        // Keep last 3 exchanges max (6 messages) for context — saves tokens
        const recentHistory = (history || []).slice(-6).map(h => ({
            role:    h.role === 'user' ? 'user' : 'assistant',
            content: String(h.content).slice(0, 300),
        }));

        const messages = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...recentHistory,
            { role: 'user',   content: cleanMsg },
        ];

        // ── 5. Call Groq ──────────────────────────────────────────────────────
        // Indic scripts (Telugu/Tamil/Kannada/Hindi/etc.) need ~2–3× more tokens
        // for the same answer length, so we bump max_tokens for those messages
        // to prevent mid-sentence truncation. Detection runs on the user's
        // message only (not history) since that's the language they'll get back.
        const maxTokens = hasIndicScript(cleanMsg) ? MAX_TOKENS_INDIC : MAX_TOKENS_EN;

        let answer;
        try {
            answer = await callGroq(messages, maxTokens);
        } catch (groqErr) {
            console.error('Groq API error:', groqErr?.response?.data || groqErr.message);
            // Groq unavailable — check if key is missing vs network error
            const keyMissing = !process.env.GROQ_API_KEY;
            return res.status(503).json({
                error:   true,
                message: keyMissing
                    ? 'AI assistant needs setup: add GROQ_API_KEY to server environment variables. Get a free key at console.groq.com'
                    : 'AI service temporarily unavailable. Please try again in a moment.',
            });
        }

        // ── 6. Cache the new answer ───────────────────────────────────────────
        AiCache.create({
            question_hash: qHash,
            question_text: cleanMsg,
            answer_text:   answer,
        }).catch(() => {});  // non-blocking, non-fatal

        return res.json({
            error:     false,
            answer,
            cached:    false,
            usage:     usageCount,
            limit:     DAILY_LIMIT,
            remaining: Math.max(0, DAILY_LIMIT - usageCount),
        });

    } catch (err) {
        console.error('ai_assistant.chat error:', err);
        return res.status(500).json({ error: true, message: err.message });
    }
};

// ── GET /api/ai/usage — how many queries left today ───────────────────────────
exports.usage = async (req, res) => {
    try {
        const userId = req.user?.id || req.user?._id;
        const record = await AiUsage.findOne({ user_id: userId, date_key: todayKey() });
        const used   = record ? record.count : 0;
        return res.json({
            error:     false,
            used,
            limit:     DAILY_LIMIT,
            remaining: Math.max(0, DAILY_LIMIT - used),
        });
    } catch (err) {
        return res.status(500).json({ error: true, message: err.message });
    }
};

// ── GET /api/ai/suggestions — starter chips per language ─────────────────────
exports.suggestions = async (_req, res) => {
    res.json({
        error: false,
        data: {
            en: [
                'How many bricks for 1000 sqft wall?',
                'How much cement for roof slab?',
                'What is M20 concrete ratio?',
                'How to waterproof a bathroom?',
                'How to post a requirement on Bricks?',
            ],
            hi: [
                '1000 sqft दीवार के लिए कितनी ईंटें चाहिए?',
                'छत की स्लैब के लिए कितना सीमेंट चाहिए?',
                'M20 कंक्रीट का अनुपात क्या है?',
                'बाथरूम को वाटरप्रूफ कैसे करें?',
                'Bricks ऐप पर requirement कैसे डालें?',
            ],
            te: [
                '1000 sqft గోడకు ఎన్ని ఇటుకలు కావాలి?',
                'పైకప్పు స్లాబ్‌కు ఎంత సిమెంట్ కావాలి?',
                'M20 కాంక్రీట్ నిష్పత్తి ఏమిటి?',
                'బాత్రూమ్‌ను వాటర్‌ప్రూఫ్ ఎలా చేయాలి?',
                'Bricks యాప్‌లో requirement ఎలా పోస్ట్ చేయాలి?',
            ],
            ta: [
                '1000 sqft சுவருக்கு எத்தனை செங்கல் வேண்டும்?',
                'கூரை ஸ்லாப்புக்கு எவ்வளவு சிமெண்ட் வேண்டும்?',
                'M20 கான்கிரீட் விகிதம் என்ன?',
                'குளியலறையை வாட்டர்புரூஃப் செய்வது எப்படி?',
                'Bricks ஆப்பில் requirement எப்படி பதிவிட?',
            ],
            kn: [
                '1000 sqft ಗೋಡೆಗೆ ಎಷ್ಟು ಇಟ್ಟಿಗೆ ಬೇಕು?',
                'ಛಾವಣಿ ಸ್ಲ್ಯಾಬ್‌ಗೆ ಎಷ್ಟು ಸಿಮೆಂಟ್ ಬೇಕು?',
                'M20 ಕಾಂಕ್ರೀಟ್ ಅನುಪಾತ ಏನು?',
                'ಬಾತ್‌ರೂಮ್ ಅನ್ನು ವಾಟರ್‌ಪ್ರೂಫ್ ಮಾಡುವುದು ಹೇಗೆ?',
                'Bricks ಅಪ್‌ನಲ್ಲಿ requirement ಹೇಗೆ ಪೋಸ್ಟ್ ಮಾಡಬೇಕು?',
            ],
        },
    });
};
