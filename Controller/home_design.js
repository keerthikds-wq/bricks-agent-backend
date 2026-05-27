/**
 * AI Home Design Controller
 *
 * Features:
 *  1. Design Styles Catalog   — 8 Indian styles with full details
 *  2. Style Advisor           — AI-powered personalised style advice (Groq)
 *  3. Vastu Shastra Analyzer  — rule-based scoring + remedies
 *  4. Interior Cost Estimator — ₹ breakdown by room, 4 quality tiers
 *  5. Room Planner            — AI layout & furniture advice (Groq)
 *  6. Design Q&A              — multilingual free-form questions (Groq)
 *  7. Floor Plan Analyzer     — AI analysis with optional image URL
 *  8. Project CRUD            — save / retrieve / update / delete
 *
 * Cost strategy (identical to ai_assistant.js):
 *  — Groq free tier (llama-3.1-8b-instant), shared 15-query/day rate limit
 *  — Vastu check & Interior Estimate are purely computational (zero API cost)
 *  — Style catalog & Room Furniture Guide served from memory (zero API cost)
 */

const crypto     = require('crypto');
const axios      = require('axios');
const HomeDesign = require('../Model/HomeDesign');
const AiCache    = require('../Model/AiCache');
const AiUsage    = require('../Model/AiUsage');

// ── Groq config (mirrors ai_assistant.js) ─────────────────────────────────────
const GROQ_API_URL    = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL      = 'llama-3.1-8b-instant';
const MAX_TOKENS_EN   = 400;
const MAX_TOKENS_INDIC = 900;
const DAILY_LIMIT     = 15;

const INDIC_SCRIPT_RE = new RegExp(
    '[' +
    'ऀ-ॿ' +
    'ঀ-৿' +
    '਀-੿' +
    '઀-૿' +
    '଀-୿' +
    '஀-௿' +
    'ఀ-౿' +
    'ಀ-೿' +
    'ഀ-ൿ' +
    ']'
);
const isIndic = (t) => INDIC_SCRIPT_RE.test(String(t || ''));

const GROQ_KEYS = [
    process.env.GROQ_API_KEY,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3,
].filter(Boolean);
let _ki = 0;
const getKey = () => {
    if (!GROQ_KEYS.length) throw new Error('GROQ_API_KEY not set');
    return GROQ_KEYS[(_ki++) % GROQ_KEYS.length];
};

const todayKey  = () => new Date().toISOString().slice(0, 10);
const hashText  = (t) => crypto.createHash('md5').update(t.toLowerCase().trim()).digest('hex');

async function callGroq(messages, maxTokens = MAX_TOKENS_EN) {
    const resp = await axios.post(
        GROQ_API_URL,
        { model: GROQ_MODEL, messages, max_tokens: maxTokens, temperature: 0.5 },
        {
            headers: { Authorization: `Bearer ${getKey()}`, 'Content-Type': 'application/json' },
            timeout: 18000,
        }
    );
    return resp.data.choices[0].message.content.trim();
}

async function checkAndIncrementUsage(userId) {
    const key      = todayKey();
    const tomorrow = new Date(); tomorrow.setUTCHours(24, 0, 0, 0);
    const rec = await AiUsage.findOneAndUpdate(
        { user_id: userId, date_key: key },
        { $inc: { count: 1 }, $setOnInsert: { expires_at: tomorrow } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return rec.count;
}

const groqUnavailable = (res, err) => {
    console.error('Groq error (home_design):', err?.response?.data || err.message);
    return res.status(503).json({
        error:   true,
        message: GROQ_KEYS.length === 0
            ? 'AI needs setup: add GROQ_API_KEY to environment. Free key at console.groq.com'
            : 'AI temporarily unavailable. Vastu & cost estimate tools still work. Try again shortly.',
    });
};

const rateLimitResp = (res, count) => res.status(429).json({
    error:        true,
    rate_limited: true,
    message:      `Daily AI limit of ${DAILY_LIMIT} queries reached. Come back tomorrow!`,
    message_hi:   `आज की ${DAILY_LIMIT} सवालों की सीमा पूरी हुई। कल फिर आएं!`,
    message_te:   `రోజువారీ ${DAILY_LIMIT} ప్రశ్నల పరిమితి అయిపోయింది!`,
    message_ta:   `இன்றைய ${DAILY_LIMIT} கேள்விகள் தீர்ந்தன!`,
    message_kn:   `ಇಂದಿನ ${DAILY_LIMIT} ಪ್ರಶ್ನೆಗಳ ಮಿತಿ ಮೀರಿದೆ!`,
    used: count, limit: DAILY_LIMIT,
});

// ══════════════════════════════════════════════════════════════════════════════
// DESIGN STYLES CATALOG — 8 Indian home styles
// ══════════════════════════════════════════════════════════════════════════════
const DESIGN_STYLES = [
    {
        id: 'modern_contemporary',
        name: 'Modern Contemporary',
        name_hi: 'आधुनिक समकालीन',
        short_desc: 'Clean lines, neutral palette, smart home features',
        description: 'Sleek, clutter-free interiors with neutral whites and greys, concealed storage, smart lighting, and high-quality finishes. Blends international aesthetics with Indian living needs.',
        ideal_for: ['apartment', 'villa', 'independent_house'],
        climate_suitable: ['composite', 'temperate', 'hot_humid'],
        color_palette: {
            primary: ['#F5F5F0', '#E8E0D5', '#2C2C2C'],
            accent:  ['#4A90D9', '#E67E22', '#27AE60'],
            neutral: ['#FFFFFF', '#F0F0F0', '#888888'],
            wall_suggestion: 'Warm white (Asian Paints Apricot White or OBD White) with one feature wall in charcoal or deep teal',
        },
        material_recommendations: {
            flooring:    'Vitrified tiles 800×800mm (Johnson / Kajaria / Somany), or engineered wood',
            wall_finish: 'Smooth emulsion (Asian Paints / Berger), textured wallpaper feature wall',
            ceiling:     'POP / Gypsum false ceiling with concealed LED strip lights and cove lighting',
            kitchen:     'Lacquered / acrylic finish modular kitchen, quartz/granite countertop (Sleek / Hafele / Hettich)',
            bathroom:    'Large format wall tiles (600×1200), wall-hung WC (Kohler / Hindware), rainfall shower',
            woodwork:    'Pre-laminated MDF boards, matt finish shutters, aluminium/SS handles',
        },
        key_features: ['Minimalist décor', 'Concealed wiring & storage', 'Smart lighting', 'Open-plan living', 'False ceiling with coves'],
        indian_elements: ['Modern wooden pooja unit with backlit panel', 'Multipurpose balcony with garden', 'Study nook with ergonomic setup'],
        brand_suggestions: {
            paint:    'Asian Paints Royale Matt / Berger Silk',
            tiles:    'Kajaria Eternity / Johnson Endura',
            kitchen:  'Sleek / Hafele / Greenply modular',
            bathroom: 'Kohler / Hindware / TOTO',
            lighting: 'Philips Hue / Wipro Garnet / Havells',
        },
        budget_range: 'Standard ₹1,200–2,000/sqft | Premium ₹2,000–4,000/sqft',
        popular_in: 'Bangalore, Hyderabad, Mumbai, Pune, Delhi NCR',
        vastu_tip: 'Use white and light colours in Northeast areas. Dark colours only in South/West zones.',
    },
    {
        id: 'traditional_indian',
        name: 'Traditional Indian',
        name_hi: 'पारंपरिक भारतीय',
        short_desc: 'Rich heritage with ornate woodwork, ethnic textiles, warm earth tones',
        description: 'A timeless celebration of Indian craft traditions — carved wood, brass accents, ethnic textiles, and warm earth palettes. Deeply rooted in heritage while remaining functional for modern families.',
        ideal_for: ['independent_house', 'bungalow', 'villa', 'farmhouse'],
        climate_suitable: ['hot_dry', 'composite', 'temperate'],
        color_palette: {
            primary: ['#8B4513', '#DAA520', '#6B2737'],
            accent:  ['#FF6B35', '#FFD700', '#228B22'],
            neutral: ['#F5DEB3', '#D2B48C', '#FFFACD'],
            wall_suggestion: 'Terracotta / Ochre / Deep Burgundy walls (Nerolac Impressions / Asian Paints Heritage collection)',
        },
        material_recommendations: {
            flooring:    'Kota stone, Shahabad stone, Athangudi tiles, or Jaipur marble',
            wall_finish: 'Lime wash, texture paint with stencil patterns, exposed brick accent wall',
            ceiling:     'Wooden beam rafters (teak / pine), or painted POP with traditional motifs',
            kitchen:     'Stone counter, handmade tile backsplash, open shelving with brass handles',
            bathroom:    'Stone/slate wall tiles, copper/brass fixtures, stone basin',
            woodwork:    'Sheesham or teak with traditional carvings, brass hardware, dark stain finish',
        },
        key_features: ['Carved wooden doors', 'Brass & copper accents', 'Courtyards / central space', 'Jaali screens', 'Hand-block printed textiles'],
        indian_elements: ['Dedicated pooja room with traditional stone/marble temple', 'Charpai or diwan in sitting area', 'Brass diyas and lamps', 'Rangoli space at entrance'],
        brand_suggestions: {
            paint:    'Asian Paints Heritage / Nerolac Excel Total (for earthy tones)',
            tiles:    'Bharat Tiles / H&R Johnson Rustic range',
            kitchen:  'Stone counter + custom carpenter (local craftsman)',
            bathroom: 'Jaquar Traditional / Cera antique finish',
            lighting: 'Decorative brass pendant lights / Craftroot handmade lamps',
        },
        budget_range: 'Standard ₹1,000–1,800/sqft | Premium ₹1,800–3,500/sqft',
        popular_in: 'Rajasthan, Gujarat, UP, Bihar, Madhya Pradesh, Haryana',
        vastu_tip: 'Vastu is inherently embedded in traditional Indian design. Ensure central courtyard (Brahmasthan) remains open.',
    },
    {
        id: 'south_indian_classical',
        name: 'South Indian Classical',
        name_te: 'దక్షిణ భారత క్లాసికల్',
        name_ta: 'தென்னிந்திய பாரம்பரியம்',
        name_kn: 'ದಕ್ಷಿಣ ಭಾರತೀಯ ಶಾಸ್ತ್ರೀಯ',
        short_desc: 'Teak, terracotta, brass, carved pillars — classic Deccan elegance',
        description: 'Rooted in Dravidian heritage — teak and rosewood furniture, Athangudi and terracotta tiles, carved wooden pillars, brass lamps, and a deep connection to nature and Vastu. Perfectly suited to South Indian climate.',
        ideal_for: ['independent_house', 'bungalow', 'villa'],
        climate_suitable: ['hot_humid', 'composite', 'temperate'],
        color_palette: {
            primary: ['#5C3317', '#B8860B', '#8B0000'],
            accent:  ['#FF4500', '#FFD700', '#006400'],
            neutral: ['#F0EAD6', '#DEB887', '#FAEBD7'],
            wall_suggestion: 'Off-white / cream walls (Asian Paints Ivory White) with rust or ochre accent elements',
        },
        material_recommendations: {
            flooring:    'Athangudi tiles (Chettinad), terracotta tiles, polished Tandur stone, black Kadappa stone',
            wall_finish: 'Lime plaster in natural colours, hand-painted traditional border designs (kolam/rangoli-inspired)',
            ceiling:     'Teak wood rafters in main hall, Mangalore clay roof tiles visible in verandah, POP in bedrooms',
            kitchen:     'Black granite counter, terracotta tile backsplash, open storage with brass handles',
            bathroom:    'Stone mosaic tiles, traditional copper/brass fixtures, stone wash basin',
            woodwork:    'Teak or rosewood (Vengai) with traditional South Indian carvings, brass fittings',
        },
        key_features: ['Nadumuttam (inner courtyard)', 'Carved teak doors & pillars', 'Kolam patterns', 'Brass vilakku lamps', 'Verandah (Thinnai)'],
        indian_elements: ['Pooja room with brass vilakku and stone/marble God platform', 'Thulasi katte (holy basil planter)', 'Traditional swing (Oonjal)', 'Sitting platform at entrance (Thinnai)'],
        brand_suggestions: {
            paint:    'Asian Paints Apcolite / Berger WeatherCoat for exteriors',
            tiles:    'Athangudi handmade tiles (Chettinad artisans), Kajaria Rustic range',
            kitchen:  'Black granite (local) + custom carpenter with teak wood',
            bathroom: 'Jaquar / Parryware brass/copper finish fittings',
            lighting: 'Traditional brass hanging lamps, stone niches for diyas',
        },
        budget_range: 'Standard ₹1,200–2,000/sqft | Premium ₹2,000–4,000/sqft',
        popular_in: 'Tamil Nadu, Karnataka, Andhra Pradesh, Telangana, Kerala (interior regions)',
        vastu_tip: 'Nadumuttam should align with Brahmasthan. Main entrance facing East or North is most auspicious.',
    },
    {
        id: 'kerala_traditional',
        name: 'Kerala Nalukettu',
        name_ml: 'കേരള നാലുകെട്ട്',
        short_desc: 'Central courtyard, sloped roof, dark wood, natural ventilation',
        description: "The iconic Nalukettu (four-sided courtyard home) — designed for Kerala's humid climate with steep tiled roofs, dark jackwood and teak interiors, open courtyards for natural cooling, and hand-crafted details.",
        ideal_for: ['independent_house', 'bungalow', 'villa'],
        climate_suitable: ['hot_humid'],
        color_palette: {
            primary: ['#2C1810', '#8B7355', '#556B2F'],
            accent:  ['#DC143C', '#FFD700', '#FF8C00'],
            neutral: ['#F5F5DC', '#E8DCC8', '#FFFEF0'],
            wall_suggestion: 'Pure white lime-washed walls with dark teak trim — timeless Kerala look',
        },
        material_recommendations: {
            flooring:    'Traditional red oxide floor, Athangudi tiles in rooms, teak parquet in bedrooms',
            wall_finish: 'Lime wash (white / cream), traditional Kerala murals in key areas',
            ceiling:     'Sloped teak ceiling with exposed rafters, Mangalore tiles, POP only in modern additions',
            kitchen:     'Black granite counter, traditional Kerala cooking area layout, wood-fired area optional',
            bathroom:    'Simple stone/ceramic tiles, natural slate, good ventilation priority',
            woodwork:    'Jackwood (Artocarpus) and teak with traditional carvings, Padmanapuram-style doors',
        },
        key_features: ['Central Nadumuttam courtyard', 'Cross ventilation by design', 'Steep roof for heavy rain', 'Natural cooling without AC', 'Charupady (verandah)'],
        indian_elements: ['Pooja room (Thidappally) with traditional oil lamp niche', 'Nilavara (basement food storage)', 'Charupady (sitting verandah)', 'Poomukham (formal entrance)'],
        brand_suggestions: {
            paint:    'Lime wash (natural) / Asian Paints WeatherCoat for exteriors',
            tiles:    'Athangudi tiles, traditional red oxide (local artisans)',
            kitchen:  'Granite + custom Kerala carpenter (teak/jack)',
            bathroom: 'Jaquar / local stone fixtures',
            lighting: 'Traditional brass lamps, clay pot pendant lights',
        },
        budget_range: 'Premium ₹2,500–4,000/sqft | Luxury ₹4,000–7,000/sqft',
        popular_in: 'Kerala (Thrissur, Palakkad, Kottayam, Malappuram regions)',
        vastu_tip: 'Nalukettu is inherently Vastu-compliant. Northeast corner should be the prayer space (Thidappally). Never close the Nadumuttam.',
    },
    {
        id: 'rajasthani_haveli',
        name: 'Rajasthani Haveli',
        name_hi: 'राजस्थानी हवेली',
        short_desc: 'Vibrant colors, jaali screens, mirror inlay, stone carvings',
        description: 'Inspired by Rajput palaces and merchant havelis — vibrant pigments, intricate Jodhpur sandstone carving, Sheesh Mahal mirror inlay, Jharokha bay windows, and bold geometric patterns.',
        ideal_for: ['independent_house', 'villa', 'bungalow', 'farmhouse'],
        climate_suitable: ['hot_dry'],
        color_palette: {
            primary: ['#CC0000', '#FF8C00', '#006400'],
            accent:  ['#FFD700', '#9932CC', '#00CED1'],
            neutral: ['#FFF8DC', '#F5DEB3', '#FFFACD'],
            wall_suggestion: 'Peacock blue, royal red, or saffron walls with off-white borders and gold stencil patterns',
        },
        material_recommendations: {
            flooring:    'Jodhpur sandstone, Makrana white marble, Jaisalmer yellow stone, Kota blue stone',
            wall_finish: 'Lime plaster with natural mineral pigments, hand-painted frescoes, mirror inlay (Sheesh Mahal)',
            ceiling:     'Painted ceiling with floral/geometric motifs, stone jaali pendants, carved brackets',
            kitchen:     'Sandstone counter, hand-painted tile backsplash, copper and brass utensil display',
            bathroom:    'Stone/mosaic wall tiles, antique copper fixtures, stone washbasin',
            woodwork:    'Sheesham (Indian rosewood) with traditional carvings, brass fittings, painted jharokhas',
        },
        key_features: ['Jaali lattice screens', 'Mirror inlay (Sheesh Mahal)', 'Carved stone arches', 'Jharokha bay windows', 'Bold jewel-tone colours'],
        indian_elements: ['Baithak (formal sitting room)', 'Chowk (inner courtyard)', 'Chhatri (ornamental pavilion detail)', 'Haveli-style main door with carved pediment'],
        brand_suggestions: {
            paint:    'Asian Paints Heritage / Royale Play Texture for accent walls',
            tiles:    'Jodhpur sandstone (local Rajasthan quarries), Bharat Tiles Rajasthani range',
            kitchen:  'Stone + custom Rajasthani craftsman woodwork',
            bathroom: 'Jaquar antique / copper finish, Hindware stone collection',
            lighting: 'Rajasthani lanterns (fanoos), coloured glass pendant lights',
        },
        budget_range: 'Premium ₹2,000–3,500/sqft | Luxury ₹3,500–7,000+/sqft',
        popular_in: 'Rajasthan, Gujarat, Delhi (heritage bungalows), Haryana',
        vastu_tip: 'Chowk (inner courtyard) acts as natural Brahmasthan. Ensure it remains open. Main entrance traditionally faces East or North.',
    },
    {
        id: 'vastu_modern',
        name: 'Vastu-Compliant Modern',
        name_hi: 'वास्तु अनुकूल आधुनिक',
        short_desc: 'Modern aesthetics with strict Vastu Shastra compliance',
        description: 'The best of both worlds — contemporary clean lines and materials, but designed from the ground up around Vastu Shastra principles. Every room, colour, and element is placed for harmony, health, and prosperity.',
        ideal_for: ['independent_house', 'villa', 'apartment', 'bungalow'],
        climate_suitable: ['hot_dry', 'hot_humid', 'composite', 'temperate', 'cold'],
        color_palette: {
            primary: ['#F5F5F0', '#E8E4D9', '#4A3728'],
            accent:  ['#FF6B2B', '#4CAF50', '#2196F3'],
            neutral: ['#FFFFFF', '#F0EDE8', '#8B8680'],
            wall_suggestion: 'White/cream in North & East zones; warm yellow in kitchen (SE); green in North; blue in West; saffron/yellow in living room',
        },
        material_recommendations: {
            flooring:    'White marble or light vitrified in Northeast zones; darker granite in Southwest',
            wall_finish: 'Direction-specific Vastu colours: pale yellow (living), off-white (bedroom), light green (study), cream (kitchen)',
            ceiling:     'Clean false ceiling with open Brahmasthan (centre must not have beam/pillar); warm LED downlights',
            kitchen:     'Red/orange accents in SE corner kitchen; granite counter, standard modular layout',
            bathroom:    'NW placement; white/light blue tiles; no cluttered space',
            woodwork:    'Natural wood tones, lightweight furniture, no heavy shelving in Northeast',
        },
        key_features: ['Brahmasthan (centre) kept open', 'Direction-specific room placement', 'Five-element balance', 'Natural light maximised in NE', 'Positive energy flow'],
        indian_elements: ['Northeast pooja room with marble flooring', 'Southwest master bedroom with heavy bed', 'Southeast modular kitchen', 'Northwest guest/servant room'],
        brand_suggestions: {
            paint:    'Asian Paints Vastu colour range / Berger Silk in Vastu-prescribed tones',
            tiles:    'Kajaria / Johnson — white for NE zones, darker for SW',
            kitchen:  'Any modular brand; key is placement in SE corner',
            bathroom: 'Standard; focus on NW placement, good drainage',
            lighting: 'Warm 3000K LED in bedrooms; cool 5000K in study; Philips / Havells',
        },
        budget_range: 'Standard ₹1,200–2,000/sqft | Premium ₹2,000–3,500/sqft',
        popular_in: 'All India — especially preferred by homebuyers across Tier 1 & 2 cities',
        vastu_tip: 'Consult a Vastu expert for your specific plot orientation. Use our Vastu Analyzer tool for room-by-room compliance score.',
    },
    {
        id: 'apartment_urban',
        name: 'Urban Apartment Contemporary',
        short_desc: 'Space-smart, multifunctional design for Indian city apartments',
        description: 'Designed for urban Indian apartments — maximising every square foot with smart storage, multifunctional furniture, modular kitchens, and a fresh, bright aesthetic that works well in compact homes.',
        ideal_for: ['apartment'],
        climate_suitable: ['hot_dry', 'hot_humid', 'composite', 'temperate'],
        color_palette: {
            primary: ['#FFFFFF', '#F0F0F0', '#2B2B2B'],
            accent:  ['#E74C3C', '#3498DB', '#F39C12'],
            neutral: ['#ECF0F1', '#BDC3C7', '#7F8C8D'],
            wall_suggestion: 'White walls throughout for space illusion; one bold accent wall (coral / navy / olive) in living or bedroom',
        },
        material_recommendations: {
            flooring:    'Vitrified tiles (600×600 or 800×800), anti-skid in kitchen & bathroom, laminate in bedrooms',
            wall_finish: 'Emulsion paint, removable wallpaper for feature wall, washable paint in kitchen',
            ceiling:     'Simple plaster/POP false ceiling; concealed AC unit; no complex designs in smaller rooms',
            kitchen:     'Compact modular kitchen — pull-out units, corner carousels, overhead cabinets up to ceiling',
            bathroom:    'Wall-hung WC (saves 30cm), compact vanity, tempered glass shower partition',
            woodwork:    'Pre-laminated boards, mirror wardrobe doors (makes room look larger)',
        },
        key_features: ['Space optimisation', 'Smart hidden storage', 'Multifunctional furniture', 'Mirror & light tricks for spaciousness', 'Modular flexibility'],
        indian_elements: ['Compact wall-mounted pooja unit with concealed storage', 'Balcony converted to study/garden space', 'Study nook built into wardrobe', 'Efficient kitchen triangle'],
        brand_suggestions: {
            paint:    'Asian Paints Apcolite / Nerolac Excel Clean (easy wash)',
            tiles:    'Kajaria / Somany (value range)',
            kitchen:  'Sleek Kitchens / Häfele / local modular carpenter',
            bathroom: 'Hindware / Cera (compact range), Jaquar Quartz',
            lighting: 'Wipro Garnet LED / Philips LED (value range)',
        },
        budget_range: 'Basic ₹400–800/sqft | Standard ₹800–1,500/sqft | Premium ₹1,500–2,500/sqft',
        popular_in: 'Mumbai, Bangalore, Hyderabad, Delhi NCR, Pune, Chennai, Ahmedabad',
        vastu_tip: 'Even in apartments, you can have Vastu: pooja corner in Northeast, study facing North/East, keep centre of home clutter-free.',
    },
    {
        id: 'scandinavian_indian',
        name: 'Scandinavian-Indian Fusion',
        short_desc: 'Scandi minimalism warmed with Indian textiles & handcraft',
        description: 'Clean Scandinavian lines and light palette fused with the warmth of Indian handloom textiles, block-printed cushions, brass accents, and natural materials. Ideal for the design-conscious urban Indian.',
        ideal_for: ['apartment', 'villa', 'independent_house'],
        climate_suitable: ['composite', 'temperate'],
        color_palette: {
            primary: ['#FFFFFF', '#F5F0EB', '#4A4A4A'],
            accent:  ['#E8A87C', '#8B7355', '#4CAF50'],
            neutral: ['#EDE8E3', '#D9D2C8', '#A8A090'],
            wall_suggestion: 'Warm white or linen-toned walls (Berger Silk Linen / Asian Paints Broken White) + jute/macramé wall art',
        },
        material_recommendations: {
            flooring:    'Warm-toned vitrified tiles (Kajaria Beige Rustic), jute dhurrie rugs, light engineered wood',
            wall_finish: 'White/off-white smooth emulsion; woven wall hangings; minimal décor',
            ceiling:     'Simple cove ceiling; warm 2700K LEDs for hygge atmosphere',
            kitchen:     'White/light grey modular with warm wooden accents (open shelving for spice display)',
            bathroom:    'Hexagonal mosaic floor tiles; simple white wall tiles; indoor plant shelf',
            woodwork:    'Light mango wood or sheesham with natural/whitewash finish',
        },
        key_features: ['Light & airy atmosphere', 'Natural & sustainable materials', 'Indoor plants (biophilic)', 'Handcrafted personal accents', 'Hygge (cosy) corners'],
        indian_elements: ['Block-print Rajasthani / Bagru cushion covers', 'Brass/copper accent pieces', 'Traditional Dhurrie or Kilim rug', 'Warli / Madhubani art prints on white walls'],
        brand_suggestions: {
            paint:    'Berger Silk / Asian Paints Royale Matt (warm whites)',
            tiles:    'Kajaria Rustic Beige / Johnson Endura Almond',
            kitchen:  'IKEA (for urban), or local with white shutter + wood shelves',
            bathroom: 'Kohler white / Duravit minimal',
            lighting: 'Edison bulb pendants / Wipro Garnet warm LED',
        },
        budget_range: 'Standard ₹1,200–2,000/sqft | Premium ₹2,000–3,500/sqft',
        popular_in: 'Bangalore, Pune, Hyderabad, Delhi (South/West Delhi)',
        vastu_tip: 'Keep clutter-free living aligned with Vastu principle of positive energy flow. Light colours in NE rooms enhance prosperity.',
    },
];

// ══════════════════════════════════════════════════════════════════════════════
// VASTU SHASTRA RULES ENGINE
// ══════════════════════════════════════════════════════════════════════════════
const VASTU_ROOM_RULES = {
    pooja_room:      { ideal: ['northeast'],              acceptable: ['east', 'north'],              weight: 15 },
    master_bedroom:  { ideal: ['southwest'],              acceptable: ['south', 'west'],              weight: 14 },
    kitchen:         { ideal: ['southeast'],              acceptable: ['northwest'],                  weight: 12 },
    bathroom:        { ideal: ['northwest', 'west'],      acceptable: ['southeast'],                  weight: 10 },
    living_room:     { ideal: ['north', 'northeast', 'east'], acceptable: ['northwest', 'southeast'], weight: 10 },
    bedroom:         { ideal: ['west', 'northwest'],      acceptable: ['south', 'southwest'],         weight: 8  },
    study_room:      { ideal: ['northeast', 'north', 'east'], acceptable: ['northwest'],              weight: 8  },
    dining_room:     { ideal: ['west', 'east'],           acceptable: ['north', 'south'],             weight: 7  },
    servant_quarter: { ideal: ['northwest'],              acceptable: ['south', 'west'],              weight: 5  },
    storage:         { ideal: ['southwest', 'south'],     acceptable: ['west', 'northwest'],          weight: 5  },
    garage:          { ideal: ['northwest', 'southeast'], acceptable: ['south', 'west'],              weight: 4  },
    balcony:         { ideal: ['north', 'east', 'northeast'], acceptable: ['northwest', 'southeast'], weight: 3  },
    garden:          { ideal: ['north', 'east', 'northeast'], acceptable: ['northwest'],              weight: 3  },
    terrace:         { ideal: ['north', 'east'],          acceptable: ['northwest', 'northeast'],     weight: 2  },
};

const VASTU_ROOM_TIPS = {
    pooja_room:      { good: 'Pooja room in Northeast (Ishaan) — most auspicious, enhances spiritual energy.',      bad: 'Move pooja room to Northeast. Current placement disrupts positive energy flow.' },
    master_bedroom:  { good: 'Master bedroom in Southwest — ideal for stability, deep sleep, and good health.',     bad: 'Southwest is ideal for master bedroom (earth element = stability). Current placement may cause restlessness.' },
    kitchen:         { good: 'Kitchen in Southeast (Agni/fire corner) — correct placement for fire element.',       bad: 'Kitchen should be in Southeast (Agni corner). Northeast kitchen is especially bad (fire + water conflict).' },
    bathroom:        { good: 'Bathroom in Northwest/West — proper placement for water element disposal.',            bad: 'Bathroom in Northeast is highly inauspicious. Move it to Northwest or West if possible.' },
    living_room:     { good: 'Living room in North/East/Northeast — promotes positive energy and visitor wealth.',   bad: 'Living room is best in North, East, or Northeast for optimal energy flow.' },
    bedroom:         { good: 'Bedroom in West/Northwest — suitable for children and guests.',                        bad: 'Bedrooms are best placed in West or Northwest. Avoid Northeast bedrooms.' },
    study_room:      { good: 'Study in Northeast/North/East — enhances concentration, memory, and knowledge.',      bad: 'Study/office room should be in Northeast, North, or East for better focus.' },
    dining_room:     { good: 'Dining room in West/East — good for nourishment and family bonding.',                  bad: 'Dining room is best in West or East direction.' },
    servant_quarter: { good: 'Servant quarter in Northwest — correct as per Vastu.',                                 bad: 'Servant quarters should ideally be in Northwest direction.' },
    storage:         { good: 'Storage in Southwest/South — good for heavy storage.',                                 bad: 'Storage room is best in Southwest or South. Avoid Northeast (blocks energy).' },
    garage:          { good: 'Garage in Northwest/Southeast — correct placement.',                                   bad: 'Garage is best in Northwest or Southeast. Avoid Northeast or Southwest.' },
    balcony:         { good: 'Balcony in North/East/Northeast — welcomes morning light and positive energy.',        bad: 'Balcony is best in North or East direction for good light and energy.' },
    garden:          { good: 'Garden in North/East — excellent for prosperity and health energy.',                   bad: 'Garden is best in North or East. Avoid South or Southwest.' },
    terrace:         { good: 'Terrace in North/East — good placement.',                                              bad: 'Terrace is best opened towards North or East.' },
};

const VASTU_DOOR_RATINGS = {
    north:     { rating: 'excellent', tip: 'North-facing main door is very auspicious — brings wealth and prosperity (Kubera direction).' },
    east:      { rating: 'excellent', tip: 'East-facing main door is highly auspicious — brings health, energy, and morning sunlight.' },
    northeast: { rating: 'excellent', tip: 'Northeast (Ishaan) entrance is the most auspicious of all directions — maximum positive energy.' },
    west:      { rating: 'good',      tip: 'West-facing main door is generally neutral — can bring stability with proper remedies.' },
    northwest: { rating: 'neutral',   tip: 'Northwest entrance is moderate — may cause guests/visitors to not stay long. Manageable.' },
    south:     { rating: 'caution',   tip: 'South-facing main door needs Vastu attention. Use a Vastu yantra and red doormat to remediate.' },
    southeast: { rating: 'caution',   tip: 'Southeast entrance can cause financial strain. Use proper remedies: copper strip threshold, red nameplate.' },
    southwest: { rating: 'poor',      tip: 'Southwest entrance is the most inauspicious. Strong remedies needed: Vastu pyramid, heavy main door, avoid red colour.' },
};

const VASTU_PLOT_RATINGS = {
    north:     { rating: 'excellent', tip: 'North-facing plot — excellent for business prosperity (Mercury/Kubera direction).' },
    east:      { rating: 'excellent', tip: 'East-facing plot — highly auspicious for health and overall well-being (Sun direction).' },
    northeast: { rating: 'excellent', tip: 'Northeast-facing plot — the most auspicious of all. Maximum positive energy.' },
    west:      { rating: 'good',      tip: 'West-facing plot — good for professionals and service-sector families (Saturn direction).' },
    northwest: { rating: 'neutral',   tip: 'Northwest-facing plot — moderate. Good for business families if designed carefully.' },
    south:     { rating: 'moderate',  tip: 'South-facing plot — acceptable with correct Vastu design. Many successful homes face South.' },
    southeast: { rating: 'moderate',  tip: 'Southeast-facing plot — acceptable with careful room placement. Follow kitchen-in-SE rule.' },
    southwest: { rating: 'caution',   tip: 'Southwest-facing plot — needs careful Vastu planning. Main door must not be exactly SW. Consult expert.' },
};

const VASTU_REMEDIES = {
    pooja_in_south:      'Place a Vastu copper yantra near the pooja room. Use Ganpati idol facing North to neutralise.',
    kitchen_in_northeast: 'This is highly inauspicious. If relocation is not possible, keep a bowl of sea salt in the corner and change it monthly.',
    bathroom_in_northeast: 'Keep the bathroom door always closed and place a Vastu pyramid on the outside wall.',
    master_bed_northeast: 'Avoid sleeping with head pointing North. Head to South (best) or East while sleeping. Place a Vastu crystal under bed.',
    general_energy:       'Place Vastu crystals in Northeast corner. Keep that area clean and clutter-free at all times.',
    south_entrance:       'Place a red doormat, copper threshold strip, and a Vastu yantra above the main door to reduce south entrance effects.',
    southwest_entrance:   'Use a heavy main door (solid wood, not hollow). Paint it dark brown or black. Avoid red colour at entrance.',
};

function runVastuAnalysis(plotFacing, mainDoorDirection, rooms, staircaseDir, overheadTankDir) {
    const issues        = [];
    const recommendations = [];
    let totalWeight     = 0;
    let earnedScore     = 0;

    // Evaluate each room
    for (const room of (rooms || [])) {
        const rule = VASTU_ROOM_RULES[room.room_type];
        const tips = VASTU_ROOM_TIPS[room.room_type];
        if (!rule || !room.vastu_direction) continue;

        totalWeight += rule.weight;
        const dir = room.vastu_direction.toLowerCase();

        if (rule.ideal.includes(dir)) {
            earnedScore += rule.weight;
            recommendations.push(`✅ ${room.name || room.room_type}: ${tips.good}`);
        } else if (rule.acceptable.includes(dir)) {
            earnedScore += rule.weight * 0.6;
            recommendations.push(`⚠️ ${room.name || room.room_type}: ${tips.good} (Acceptable placement)`);
        } else {
            earnedScore += 0;
            const severity = rule.weight >= 12 ? 'high' : rule.weight >= 8 ? 'medium' : 'low';
            issues.push({ area: room.name || room.room_type, issue: tips.bad, severity });
            recommendations.push(`❌ ${room.name || room.room_type}: ${tips.bad}`);
        }
    }

    // Staircase check
    if (staircaseDir) {
        totalWeight += 6;
        const goodStair = ['south', 'west', 'southwest'].includes(staircaseDir.toLowerCase());
        if (goodStair) {
            earnedScore += 6;
            recommendations.push('✅ Staircase: Correct placement in South/West/Southwest.');
        } else if (['northeast', 'north', 'east'].includes(staircaseDir.toLowerCase())) {
            issues.push({ area: 'Staircase', issue: 'Staircase in Northeast/North/East is inauspicious — drains positive energy. Best placement is South, West, or Southwest.', severity: 'high' });
        } else {
            earnedScore += 3;
        }
    }

    // Overhead water tank check
    if (overheadTankDir) {
        totalWeight += 4;
        if (['southwest', 'west', 'south'].includes(overheadTankDir.toLowerCase())) {
            earnedScore += 4;
            recommendations.push('✅ Overhead water tank: Correct placement in SW/West/South.');
        } else if (overheadTankDir.toLowerCase() === 'northeast') {
            issues.push({ area: 'Water Tank', issue: 'Overhead water tank in Northeast blocks prosperity. Move to Southwest or West.', severity: 'high' });
        } else {
            earnedScore += 2;
        }
    }

    // If no room rules were evaluated, give a base weight
    if (totalWeight === 0) totalWeight = 100;

    const rawScore = Math.round((earnedScore / totalWeight) * 100);

    // Main door and plot ratings (do not affect score, only informational)
    const doorInfo  = mainDoorDirection ? VASTU_DOOR_RATINGS[mainDoorDirection.toLowerCase()] || null : null;
    const plotInfo  = plotFacing        ? VASTU_PLOT_RATINGS[plotFacing.toLowerCase()] || null : null;

    // Door affects score
    if (doorInfo) {
        if (doorInfo.rating === 'excellent') {
            /* bonus already included in room scoring */
        } else if (doorInfo.rating === 'poor') {
            issues.push({ area: 'Main Door', issue: doorInfo.tip, severity: 'high' });
        }
    }

    const finalScore = Math.min(100, Math.max(0, rawScore));
    const level = finalScore >= 80 ? 'excellent' : finalScore >= 60 ? 'good' : finalScore >= 40 ? 'average' : 'poor';

    // Standard remedies for common issues
    const remedies = [];
    if (issues.some(i => i.area.toLowerCase().includes('kitchen')))      remedies.push(VASTU_REMEDIES.kitchen_in_northeast);
    if (issues.some(i => i.area.toLowerCase().includes('bathroom')))     remedies.push(VASTU_REMEDIES.bathroom_in_northeast);
    if (issues.some(i => i.area.toLowerCase().includes('master')))       remedies.push(VASTU_REMEDIES.master_bed_northeast);
    if (issues.some(i => i.area.toLowerCase().includes('door')))         remedies.push(VASTU_REMEDIES.south_entrance);
    if (issues.length > 0)                                                remedies.push(VASTU_REMEDIES.general_energy);

    return {
        compliance_score:  finalScore,
        compliance_level:  level,
        issues,
        recommendations,
        remedies: [...new Set(remedies)],
        door_vastu:        doorInfo ? { direction: mainDoorDirection, ...doorInfo } : null,
        plot_facing_vastu: plotInfo ? { direction: plotFacing, ...plotInfo } : null,
        analyzed_at: new Date(),
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// INTERIOR COST RATES (₹, Indian market 2024–25)
// ══════════════════════════════════════════════════════════════════════════════
const INTERIOR_RATES = {
    basic: {
        living_room:     { type: 'per_sqft', rate: 700  },
        master_bedroom:  { type: 'per_sqft', rate: 550  },
        bedroom:         { type: 'per_sqft', rate: 450  },
        dining_room:     { type: 'per_sqft', rate: 350  },
        study_room:      { type: 'per_sqft', rate: 350  },
        balcony:         { type: 'per_sqft', rate: 150  },
        servant_quarter: { type: 'per_sqft', rate: 200  },
        storage:         { type: 'per_sqft', rate: 100  },
        garage:          { type: 'per_sqft', rate: 200  },
        terrace:         { type: 'per_sqft', rate: 100  },
        garden:          { type: 'per_sqft', rate: 80   },
        kitchen:         { type: 'flat',     rate: 75000  },
        bathroom:        { type: 'flat',     rate: 40000  },
        pooja_room:      { type: 'flat',     rate: 18000  },
    },
    standard: {
        living_room:     { type: 'per_sqft', rate: 1400 },
        master_bedroom:  { type: 'per_sqft', rate: 1100 },
        bedroom:         { type: 'per_sqft', rate: 850  },
        dining_room:     { type: 'per_sqft', rate: 700  },
        study_room:      { type: 'per_sqft', rate: 650  },
        balcony:         { type: 'per_sqft', rate: 300  },
        servant_quarter: { type: 'per_sqft', rate: 400  },
        storage:         { type: 'per_sqft', rate: 200  },
        garage:          { type: 'per_sqft', rate: 350  },
        terrace:         { type: 'per_sqft', rate: 200  },
        garden:          { type: 'per_sqft', rate: 150  },
        kitchen:         { type: 'flat',     rate: 175000  },
        bathroom:        { type: 'flat',     rate: 85000   },
        pooja_room:      { type: 'flat',     rate: 40000   },
    },
    premium: {
        living_room:     { type: 'per_sqft', rate: 2500 },
        master_bedroom:  { type: 'per_sqft', rate: 2000 },
        bedroom:         { type: 'per_sqft', rate: 1600 },
        dining_room:     { type: 'per_sqft', rate: 1400 },
        study_room:      { type: 'per_sqft', rate: 1200 },
        balcony:         { type: 'per_sqft', rate: 600  },
        servant_quarter: { type: 'per_sqft', rate: 700  },
        storage:         { type: 'per_sqft', rate: 400  },
        garage:          { type: 'per_sqft', rate: 600  },
        terrace:         { type: 'per_sqft', rate: 450  },
        garden:          { type: 'per_sqft', rate: 350  },
        kitchen:         { type: 'flat',     rate: 375000  },
        bathroom:        { type: 'flat',     rate: 185000  },
        pooja_room:      { type: 'flat',     rate: 95000   },
    },
    luxury: {
        living_room:     { type: 'per_sqft', rate: 5000 },
        master_bedroom:  { type: 'per_sqft', rate: 4000 },
        bedroom:         { type: 'per_sqft', rate: 3000 },
        dining_room:     { type: 'per_sqft', rate: 2500 },
        study_room:      { type: 'per_sqft', rate: 2000 },
        balcony:         { type: 'per_sqft', rate: 1200 },
        servant_quarter: { type: 'per_sqft', rate: 1200 },
        storage:         { type: 'per_sqft', rate: 800  },
        garage:          { type: 'per_sqft', rate: 1200 },
        terrace:         { type: 'per_sqft', rate: 900  },
        garden:          { type: 'per_sqft', rate: 700  },
        kitchen:         { type: 'flat',     rate: 850000  },
        bathroom:        { type: 'flat',     rate: 500000  },
        pooja_room:      { type: 'flat',     rate: 250000  },
    },
};

const TIER_INCLUDES = {
    basic:    'Basic modular kitchen & bathroom, standard tiles (Kajaria/Johnson 300×300), simple emulsion paint, basic false ceiling in living room',
    standard: 'Good modular kitchen (Sleek/Hafele), branded sanitaryware (Hindware/Parryware), vitrified tiles (600×600), textured feature wall, POP false ceiling in all rooms, concealed LED lighting',
    premium:  'Premium modular kitchen (Hafele/Hettich), Kohler/Jaquar sanitaryware, large-format tiles (800×800), smart lighting, imported wallpaper, gypsum false ceiling with coves, smart home provisions',
    luxury:   'Designer modular kitchen (imported brands), Kohler/TOTO/Duravit sanitary, marble/hardwood flooring, custom-made furniture, smart home automation, imported fixtures, architectural lighting design',
};

function formatInr(n) {
    if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
    if (n >= 100000)   return `₹${(n / 100000).toFixed(2)} L`;
    if (n >= 1000)     return `₹${(n / 1000).toFixed(1)}K`;
    return `₹${n}`;
}

function computeInteriorEstimate(rooms, tier) {
    const rates  = INTERIOR_RATES[tier] || INTERIOR_RATES.standard;
    const breakdown = [];
    let subtotal = 0;

    for (const room of rooms) {
        const ruleKey = room.room_type;
        const rateObj = rates[ruleKey];
        if (!rateObj) continue;

        let cost = 0;
        let basis = '';
        if (rateObj.type === 'flat') {
            cost  = rateObj.rate;
            basis = `flat rate (${formatInr(rateObj.rate)})`;
        } else {
            const area = room.area_sqft || (room.length_ft && room.width_ft ? room.length_ft * room.width_ft : 0);
            if (!area) continue;
            cost  = Math.round(rateObj.rate * area);
            basis = `${area} sqft × ${formatInr(rateObj.rate)}/sqft`;
        }
        subtotal += cost;
        breakdown.push({
            room:  room.name || room.room_type.replace(/_/g, ' '),
            type:  room.room_type,
            basis,
            cost,
            cost_formatted: formatInr(cost),
        });
    }

    const contingencyPct = 10;
    const contingencyAmt = Math.round(subtotal * contingencyPct / 100);
    const total          = subtotal + contingencyAmt;
    const totalArea      = rooms.reduce((s, r) => s + (r.area_sqft || 0), 0);

    return {
        tier,
        includes:        TIER_INCLUDES[tier],
        rooms_breakdown: breakdown,
        subtotal,
        subtotal_formatted: formatInr(subtotal),
        contingency_pct: contingencyPct,
        contingency_amt: contingencyAmt,
        total_estimate:  total,
        total_formatted: formatInr(total),
        cost_per_sqft:   totalArea > 0 ? Math.round(total / totalArea) : null,
        generated_at:    new Date(),
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// DESIGN AI SYSTEM PROMPT
// ══════════════════════════════════════════════════════════════════════════════
const DESIGN_SYSTEM_PROMPT = `You are Bricks Home Designer — an AI interior design expert specialising in Indian homes.

Expertise: Interior styles, Vastu Shastra, space planning, colour coordination, material selection, Indian regional design, budget planning.

Rules:
- ALWAYS reply in the SAME language the user writes in (Telugu, Kannada, Tamil, Hindi, or English)
- Keep answers practical, specific, and under 200 words
- Reference Indian brands (Asian Paints, Kajaria, Johnson Tiles, Kohler, Jaquar, Hafele, Sleek, Hindware, Cera, Livspace)
- Cost ranges MUST be in ₹ (Indian Rupees), 2024–25 market rates
- Always consider Vastu Shastra — most Indian homeowners deeply care about it
- Include pooja room advice in room-planning questions
- Consider joint family living scenarios when relevant
- Be aware of Indian climate zones and suggest climate-appropriate design

Key Indian knowledge:
- Interior budget: Basic ₹500–800/sqft | Standard ₹800–1,500/sqft | Premium ₹1,500–3,000/sqft | Luxury ₹3,000+/sqft
- Vastu: Northeast=pooja, Southwest=master bedroom, Southeast=kitchen, Northwest=bathroom/guest
- Standard BHK areas: 1BHK 450–650sqft, 2BHK 700–1,100sqft, 3BHK 1,100–1,600sqft, 4BHK 1,600–2,200sqft
- Essential Indian rooms: pooja room, servant quarter (if independent house), study room, storage
- Popular tiles: Kajaria, Johnson, Somany, Orient Bell | Paint: Asian Paints, Berger, Nerolac | Sanitaryware: Hindware, Cera, Jaquar, Kohler`;

// ══════════════════════════════════════════════════════════════════════════════
// ROOM PLANNER GUIDE (static, no API cost)
// ══════════════════════════════════════════════════════════════════════════════
const ROOM_GUIDE = {
    living_room: {
        standard_size: '12ft × 15ft (180 sqft) for 2BHK; 14ft × 18ft (252 sqft) for 3BHK',
        furniture: ['3-seater sofa (7ft×3ft)', '2-seater sofa/loveseat (5ft×3ft)', 'Coffee table (4ft×2ft)', 'TV unit (6-7ft wide)'],
        optional: ['Display unit/bookshelf', 'Pooja corner unit', 'Side tables'],
        clearance: 'Min 3ft walking clearance between furniture. Keep centre (Brahmasthan) clear.',
        vastu: 'Sofa against South or West wall. TV on East or North wall. Avoid beam over seating.',
        lighting: 'Central false ceiling light + wall sconces + LED strip in cove. Warm 3000K for ambience.',
    },
    master_bedroom: {
        standard_size: '12ft × 13ft (156 sqft) minimum; 14ft × 14ft ideal',
        furniture: ['King bed (6.5ft×6ft) or Queen (5ft×6ft)', 'Side tables (pair, 1.5ft×1.5ft)', 'Wardrobe (6–8ft wide, 2ft deep)', 'Dressing table (4ft×1.5ft)'],
        optional: ['Seating bench at foot of bed', 'Compact study table', 'Reading chair'],
        clearance: 'Min 3ft both sides of bed; min 4ft at foot of bed',
        vastu: 'Head pointing South (best) or East. Wardrobe against South/West wall. Mirror should not face bed directly.',
        lighting: 'Ambient: false ceiling downlights. Task: bedside reading lamps. Avoid harsh white LEDs; use warm 2700K.',
    },
    kitchen: {
        standard_size: '8ft × 10ft minimum; L-shape works best for 80+ sqft',
        furniture: ['Modular platform (L/straight/U shape)', 'Overhead cabinets (14-18 inch depth)', 'Appliance zone: fridge, microwave'],
        optional: ['Breakfast counter/bar', 'Kitchen island (if >12ft wide)', 'Chimney (mandatory for Indian cooking)'],
        clearance: 'Min 4ft working corridor; work triangle stove-sink-fridge should total 12-26ft',
        vastu: 'Stove in Southeast corner. Cook facing East. Sink on North or Northeast. Refrigerator: Southwest. No water & fire adjacent.',
        lighting: 'Bright white 5000K task lights under overhead cabinets. Ambient ceiling lights. Avoid shadows on work surface.',
    },
    bathroom: {
        standard_size: '5ft × 8ft (40 sqft) toilet+bath combo; master bath 7ft × 9ft',
        furniture: ['WC (wall-hung preferred, saves 30cm)', 'Wash basin/vanity (600–900mm wide)', 'Shower area min 3ft×3ft or bathtub 5ft×2.5ft'],
        optional: ['Storage cabinet above/beside basin', 'Heated towel rail'],
        clearance: 'Min 2.5ft in front of WC; 2ft in front of basin; glass partition for shower',
        vastu: 'WC should not face East or North while sitting. Basin on East is good. Good ventilation is essential (opens negative energy).',
        lighting: 'Waterproof IP44 rated lights. Vanity mirror with front lighting (not overhead — avoids shadows on face). Warm 3000K.',
    },
    pooja_room: {
        standard_size: '4ft × 5ft (20 sqft) dedicated room; 3ft × 4ft alcove minimum',
        furniture: ['Temple/mandap unit (wall-mounted, 3ft wide × 2.5ft deep)', 'Lower storage for prasad items', 'Sitting mat space (2ft×3ft in front)'],
        optional: ['Brass diya stand', 'Incense holder niche', 'Bell hook from ceiling'],
        clearance: 'Min 3ft open space in front of deity for sitting/prostrating',
        vastu: 'Temple faces East or West (devotee faces East or North). Never below staircase. Marble/stone base preferred. No overhead beam on deity.',
        lighting: 'Warm yellow 2700K LEDs inside temple unit (backlit panel). Diya niche lighting. No harsh white lights.',
    },
    dining_room: {
        standard_size: '10ft × 12ft for 6-seater; 8ft × 10ft for 4-seater',
        furniture: ['Dining table: 4-seater (4ft×3ft), 6-seater (6ft×3ft), 8-seater (7ft×3.5ft)', 'Dining chairs (18 inch width each)', 'Crockery cabinet/sideboard (4–5ft wide)'],
        optional: ['Bar unit', 'Serving trolley cart'],
        clearance: 'Min 3ft on all sides for chairs to pull out comfortably',
        vastu: 'Dining best in West direction. Head of family faces East. Do not sit with back to entrance. Avoid water features near dining.',
        lighting: 'Pendant light 30–36 inches above table centre. Warm 2700–3000K. Dimmer switch recommended for ambience control.',
    },
    study_room: {
        standard_size: '8ft × 10ft (80 sqft) is sufficient; can be carved from bedroom corner',
        furniture: ['Study desk 4ft × 2ft', 'Ergonomic chair (24 inches deep)', 'Bookshelf (4–6ft wide, wall-mounted preferred)'],
        optional: ['Whiteboard (3ft×2ft)', 'Small reading sofa/chair', 'Filing cabinet'],
        clearance: 'Min 3ft behind study chair for movement',
        vastu: 'Face North or East while studying/working. Bookshelf on South or West wall. Good natural daylight from North or East window. No beam over head.',
        lighting: 'Task lighting: 6500K (cool white, daylight) LED desk lamp. Avoid eye strain. Ambient: 4000K neutral white ceiling lights.',
    },
    bedroom: {
        standard_size: '10ft × 12ft minimum for secondary bedrooms',
        furniture: ['Queen/double bed (5ft×6ft or 4.5ft×6ft)', 'Wardrobe (5–6ft wide, 2ft deep)', 'Study table (if children\'s room)'],
        optional: ['Bunk bed for children', 'Under-bed storage'],
        clearance: 'Min 2.5ft on sides of bed; min 3ft at foot',
        vastu: 'Head pointing South or East. Wardrobe on South or West wall. Keep North and East walls relatively clear.',
        lighting: 'Soft warm 2700K ambient ceiling light. Bedside table lamps or wall-mounted reading lights.',
    },
    balcony: {
        standard_size: '5ft × 8ft minimum usable balcony',
        furniture: ['Foldable 2-seater bistro set', 'Vertical garden panel', 'Outdoor rug (weather-resistant)'],
        optional: ['Hammock/swing (if structurally permitted)', 'Herb garden pots'],
        clearance: 'Keep 18 inches clearance from railing for safety',
        vastu: 'North or East balcony is most auspicious. Grow green plants for positive energy. Keep it clean and clutter-free.',
        lighting: 'Warm fairy lights / weather-proof wall lamp. Solar-powered stake lights in plant area.',
    },
};

// ══════════════════════════════════════════════════════════════════════════════
// CONTROLLERS
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/home-design/styles
exports.getStyles = (_req, res) => {
    const list = DESIGN_STYLES.map(s => ({
        id:          s.id,
        name:        s.name,
        short_desc:  s.short_desc,
        ideal_for:   s.ideal_for,
        budget_range: s.budget_range,
        popular_in:  s.popular_in,
    }));
    res.json({ error: false, count: list.length, data: list });
};

// GET /api/home-design/styles/:id
exports.getStyleById = (req, res) => {
    const style = DESIGN_STYLES.find(s => s.id === req.params.id);
    if (!style) return res.status(404).json({ error: true, message: 'Style not found. Valid IDs: ' + DESIGN_STYLES.map(s => s.id).join(', ') });
    res.json({ error: false, data: style });
};

// GET /api/home-design/room-guide
exports.getRoomGuide = (req, res) => {
    const { room_type } = req.query;
    if (room_type) {
        const guide = ROOM_GUIDE[room_type];
        if (!guide) return res.status(404).json({ error: true, message: 'Room type not found. Valid types: ' + Object.keys(ROOM_GUIDE).join(', ') });
        return res.json({ error: false, room_type, data: guide });
    }
    const summary = Object.entries(ROOM_GUIDE).map(([k, v]) => ({
        room_type: k,
        standard_size: v.standard_size,
        vastu_tip: v.vastu,
    }));
    res.json({ error: false, data: summary });
};

// POST /api/home-design/vastu-check
exports.vastuCheck = async (req, res) => {
    try {
        const {
            plot_facing,
            main_door_direction,
            rooms = [],
            staircase_direction,
            overhead_tank_direction,
        } = req.body;

        if (!rooms.length && !plot_facing && !main_door_direction) {
            return res.status(400).json({
                error: true,
                message: 'Provide at least: plot_facing, main_door_direction, or rooms[] with vastu_direction',
            });
        }

        const result = runVastuAnalysis(plot_facing, main_door_direction, rooms, staircase_direction, overhead_tank_direction);

        return res.json({
            error: false,
            data:  result,
            summary: {
                score: result.compliance_score,
                level: result.compliance_level,
                issues_count: result.issues.length,
                high_priority_issues: result.issues.filter(i => i.severity === 'high').length,
            },
        });
    } catch (err) {
        console.error('vastuCheck error:', err);
        return res.status(500).json({ error: true, message: err.message });
    }
};

// POST /api/home-design/interior-estimate
exports.interiorEstimate = async (req, res) => {
    try {
        const { rooms, budget_tier = 'standard', save_to_project } = req.body;

        if (!rooms || !Array.isArray(rooms) || rooms.length === 0) {
            return res.status(400).json({
                error: true,
                message: 'rooms[] is required. Each room needs room_type and area_sqft (or length_ft + width_ft)',
            });
        }
        const validTiers = ['basic', 'standard', 'premium', 'luxury'];
        if (!validTiers.includes(budget_tier)) {
            return res.status(400).json({ error: true, message: `budget_tier must be one of: ${validTiers.join(', ')}` });
        }

        const estimate = computeInteriorEstimate(rooms, budget_tier);

        return res.json({
            error: false,
            data:  estimate,
            tip:   `This estimate covers interior work only (not civil/structural). Add 10–15% for structural repairs if needed. Use Bricks BOQ tool for civil construction estimates.`,
        });
    } catch (err) {
        console.error('interiorEstimate error:', err);
        return res.status(500).json({ error: true, message: err.message });
    }
};

// POST /api/home-design/style-advisor  [AI — uses Groq quota]
exports.styleAdvisor = async (req, res) => {
    try {
        const userId = req.user?.id || req.user?._id;
        const {
            property_type, bhk_config, total_area, state, city,
            climate_zone, family_type = 'nuclear', has_pooja_room = true,
            preferred_styles = [], budget_tier = 'standard',
            special_requirements = '', language = 'english',
        } = req.body;

        const usageCount = await checkAndIncrementUsage(userId);
        if (usageCount > DAILY_LIMIT) return rateLimitResp(res, usageCount);

        const prompt = `You are a home interior design advisor for Indian homes. Give personalised design style recommendations.

Property: ${property_type || 'independent house'}, ${bhk_config || ''}, ${total_area || ''}sqft
Location: ${city || ''}, ${state || 'India'}, Climate: ${climate_zone || 'composite'}
Family: ${family_type}, Budget tier: ${budget_tier}
Pooja room required: ${has_pooja_room ? 'Yes' : 'No'}
Preferred styles (if any): ${preferred_styles.join(', ') || 'open to suggestions'}
Special requirements: ${special_requirements || 'none'}

Available Indian styles: Modern Contemporary, Traditional Indian, South Indian Classical, Kerala Nalukettu, Rajasthani Haveli, Vastu-Compliant Modern, Urban Apartment Contemporary, Scandinavian-Indian Fusion.

Provide:
1. Top 2 recommended styles with reasons (2–3 sentences each)
2. Key colour palette (3–4 colours with names)
3. Top 3 material picks with Indian brand names
4. One important Vastu tip for this property
5. Estimated interior cost range in ₹

Reply in ${language}. Keep total under 250 words. Be specific and practical.`;

        let advice;
        try {
            advice = await callGroq([
                { role: 'system', content: DESIGN_SYSTEM_PROMPT },
                { role: 'user',   content: prompt },
            ], isIndic(prompt) ? MAX_TOKENS_INDIC : MAX_TOKENS_EN);
        } catch (err) {
            return groqUnavailable(res, err);
        }

        return res.json({
            error:     false,
            advice,
            usage:     usageCount,
            limit:     DAILY_LIMIT,
            remaining: Math.max(0, DAILY_LIMIT - usageCount),
            styles_catalog_url: '/api/home-design/styles',
        });
    } catch (err) {
        console.error('styleAdvisor error:', err);
        return res.status(500).json({ error: true, message: err.message });
    }
};

// POST /api/home-design/room-planner  [AI — uses Groq quota]
exports.roomPlanner = async (req, res) => {
    try {
        const userId = req.user?.id || req.user?._id;
        const { room_type, length_ft, width_ft, area_sqft, style, budget_tier = 'standard', language = 'english', special_needs = '' } = req.body;

        if (!room_type) return res.status(400).json({ error: true, message: 'room_type is required' });

        const area    = area_sqft || (length_ft && width_ft ? length_ft * width_ft : null);
        const guide   = ROOM_GUIDE[room_type];
        const staticInfo = guide ? {
            standard_size:  guide.standard_size,
            essential_furniture: guide.furniture,
            optional_furniture:  guide.optional,
            clearance_rules:     guide.clearance,
            vastu_tip:           guide.vastu,
            lighting_guide:      guide.lighting,
        } : null;

        const usageCount = await checkAndIncrementUsage(userId);
        if (usageCount > DAILY_LIMIT) return rateLimitResp(res, usageCount);

        const prompt = `Design a practical ${room_type.replace(/_/g, ' ')} layout for an Indian home.

Room dimensions: ${length_ft ? `${length_ft}ft × ${width_ft}ft` : area ? `${area} sqft` : 'not specified'}
Design style: ${style || 'modern'}
Budget tier: ${budget_tier}
Special needs: ${special_needs || 'standard Indian family needs'}

Provide:
1. Furniture placement plan (list each piece with size and position)
2. Key measurements to follow (clearances, heights)
3. Vastu Shastra tip for this room
4. Lighting recommendation (type + colour temperature)
5. One Indian brand recommendation for a key item in this room

Reply in ${language}. Under 200 words. Practical, actionable advice.`;

        let aiPlan;
        try {
            aiPlan = await callGroq([
                { role: 'system', content: DESIGN_SYSTEM_PROMPT },
                { role: 'user',   content: prompt },
            ], isIndic(prompt) ? MAX_TOKENS_INDIC : MAX_TOKENS_EN);
        } catch (err) {
            return groqUnavailable(res, err);
        }

        return res.json({
            error:        false,
            room_type,
            static_guide: staticInfo,
            ai_plan:      aiPlan,
            usage:        usageCount,
            limit:        DAILY_LIMIT,
            remaining:    Math.max(0, DAILY_LIMIT - usageCount),
        });
    } catch (err) {
        console.error('roomPlanner error:', err);
        return res.status(500).json({ error: true, message: err.message });
    }
};

// POST /api/home-design/ask  [AI — uses Groq quota]
exports.askDesignAI = async (req, res) => {
    try {
        const userId  = req.user?.id || req.user?._id;
        const { question, language = 'english', context = '' } = req.body;

        if (!question || question.trim().length < 3) {
            return res.status(400).json({ error: true, message: 'question is required (min 3 chars)' });
        }
        const cleanQ = question.trim().slice(0, 500);

        // Cache check
        const cacheKey = hashText(`design:${cleanQ}`);
        const cached = await AiCache.findOneAndUpdate(
            { question_hash: cacheKey },
            { $inc: { hit_count: 1 }, $set: { last_hit: new Date() } },
            { new: true }
        );
        if (cached) {
            return res.json({ error: false, answer: cached.answer_text, cached: true });
        }

        const usageCount = await checkAndIncrementUsage(userId);
        if (usageCount > DAILY_LIMIT) return rateLimitResp(res, usageCount);

        const msgs = [
            { role: 'system', content: DESIGN_SYSTEM_PROMPT },
            ...(context ? [{ role: 'user', content: context }, { role: 'assistant', content: 'Understood. I will help with your home design questions based on this context.' }] : []),
            { role: 'user', content: cleanQ },
        ];

        let answer;
        try {
            answer = await callGroq(msgs, isIndic(cleanQ) ? MAX_TOKENS_INDIC : MAX_TOKENS_EN);
        } catch (err) {
            return groqUnavailable(res, err);
        }

        // Cache for future hits
        AiCache.create({ question_hash: cacheKey, question_text: cleanQ, answer_text: answer }).catch(() => {});

        return res.json({
            error:     false,
            answer,
            cached:    false,
            usage:     usageCount,
            limit:     DAILY_LIMIT,
            remaining: Math.max(0, DAILY_LIMIT - usageCount),
        });
    } catch (err) {
        console.error('askDesignAI error:', err);
        return res.status(500).json({ error: true, message: err.message });
    }
};

// POST /api/home-design/analyze-plan  [AI — uses Groq quota]
exports.analyzeFloorPlan = async (req, res) => {
    try {
        const userId = req.user?.id || req.user?._id;
        const {
            description,
            total_area, bhk_config, floors = 1, rooms = [],
            plot_facing, language = 'english',
        } = req.body;

        if (!description && rooms.length === 0) {
            return res.status(400).json({
                error: true,
                message: 'Provide either description (text description of your floor plan) or rooms[] array',
            });
        }

        const usageCount = await checkAndIncrementUsage(userId);
        if (usageCount > DAILY_LIMIT) return rateLimitResp(res, usageCount);

        const roomList = rooms.length > 0
            ? rooms.map(r => `${r.room_type?.replace(/_/g, ' ')} (${r.vastu_direction || 'direction unknown'}, ${r.area_sqft || '?'} sqft)`).join('; ')
            : 'see description';

        const prompt = `Analyse this Indian home floor plan and provide expert advice.

Property: ${bhk_config || ''} ${total_area ? `(${total_area} sqft)` : ''}, ${floors} floor(s)
Plot facing: ${plot_facing || 'unknown'}
Rooms & positions: ${roomList}
${description ? `Owner's description: ${description}` : ''}

Provide:
1. Overall floor plan assessment (strengths & weaknesses)
2. Top 3 Vastu compliance observations
3. Space optimization suggestions (2–3 points)
4. Natural light & ventilation recommendations
5. One key recommendation specific to ${plot_facing ? `a ${plot_facing}-facing` : 'this type of'} Indian home

Reply in ${language}. Under 250 words. Focus on practical, actionable advice for an Indian family.`;

        let analysis;
        try {
            analysis = await callGroq([
                { role: 'system', content: DESIGN_SYSTEM_PROMPT },
                { role: 'user',   content: prompt },
            ], isIndic(prompt) ? MAX_TOKENS_INDIC : MAX_TOKENS_EN);
        } catch (err) {
            return groqUnavailable(res, err);
        }

        return res.json({
            error:     false,
            analysis,
            usage:     usageCount,
            limit:     DAILY_LIMIT,
            remaining: Math.max(0, DAILY_LIMIT - usageCount),
            tip:       'For Vastu compliance score, use /api/home-design/vastu-check with your room directions.',
        });
    } catch (err) {
        console.error('analyzeFloorPlan error:', err);
        return res.status(500).json({ error: true, message: err.message });
    }
};

// GET /api/home-design/suggestions — design starter prompts per language
exports.designSuggestions = (_req, res) => {
    res.json({
        error: false,
        data: {
            en: [
                'What design style suits a 3BHK independent house in Hyderabad?',
                'Which colours are Vastu-compliant for a living room?',
                'How should I design my pooja room?',
                'What is the cost of a modular kitchen in India?',
                'How to maximise space in a small 2BHK apartment?',
            ],
            hi: [
                '3BHK घर के लिए कौन सा interior design style अच्छा है?',
                'Vastu के अनुसार living room का रंग क्या होना चाहिए?',
                'पूजा घर को कैसे design करें?',
                'Modular kitchen में कितना खर्च आता है?',
                'छोटे 2BHK apartment में space कैसे बढ़ाएं?',
            ],
            te: [
                'హైదరాబాద్‌లో 3BHK ఇంటికి ఏ design style అనుకూలం?',
                'వాస్తు ప్రకారం లివింగ్ రూమ్ రంగు ఏమిటి?',
                'పూజా గది design ఎలా చేయాలి?',
                'మాడ్యులర్ కిచెన్ ఖర్చు ఎంత?',
                'చిన్న 2BHK అపార్ట్‌మెంట్‌లో స్పేస్ ఎలా పెంచాలి?',
            ],
            ta: [
                '3BHK வீட்டிற்கு எந்த design style ஏற்றது?',
                'வாஸ்து படி living room நிறம் என்ன?',
                'பூஜை அறை எப்படி design செய்வது?',
                'Modular kitchen செலவு எவ்வளவு?',
                'சிறிய 2BHK அபார்ட்மென்டில் இடத்தை எப்படி பயன்படுத்துவது?',
            ],
            kn: [
                '3BHK ಮನೆಗೆ ಯಾವ design style ಸೂಕ್ತ?',
                'ವಾಸ್ತು ಪ್ರಕಾರ living room ಬಣ್ಣ ಯಾವುದು?',
                'ಪೂಜಾ ಕೋಣೆ design ಹೇಗೆ ಮಾಡಬೇಕು?',
                'Modular kitchen ಖರ್ಚು ಎಷ್ಟು?',
                'ಚಿಕ್ಕ 2BHK ಅಪಾರ್ಟ್‌ಮೆಂಟ್‌ನಲ್ಲಿ ಜಾಗ ಹೇಗೆ ಬಳಸುವುದು?',
            ],
        },
    });
};

// ── Project CRUD ──────────────────────────────────────────────────────────────

// POST /api/home-design/project
exports.saveProject = async (req, res) => {
    try {
        const userId = req.user?.id || req.user?._id;
        const {
            project_name, property_type, bhk_config, total_area_sqft, floors,
            city, state, climate_zone, plot_facing, main_door_direction,
            design_style, budget_tier, family_type, language, rooms, status,
        } = req.body;

        if (!project_name) return res.status(400).json({ error: true, message: 'project_name is required' });

        const project = await HomeDesign.create({
            user_id: userId,
            project_name, property_type, bhk_config, total_area_sqft, floors,
            city, state, climate_zone, plot_facing, main_door_direction,
            design_style, budget_tier, family_type, language, rooms: rooms || [],
            status: status || 'planning',
        });

        return res.status(201).json({ error: false, message: 'Project saved!', data: project });
    } catch (err) {
        console.error('saveProject error:', err);
        return res.status(500).json({ error: true, message: err.message });
    }
};

// GET /api/home-design/project/my
exports.getMyProjects = async (req, res) => {
    try {
        const userId = req.user?.id || req.user?._id;
        const projects = await HomeDesign.find({ user_id: userId, is_deleted: false })
            .select('project_name property_type bhk_config total_area_sqft city state design_style budget_tier status createdAt vastu_analysis.compliance_score interior_estimate.total_estimate')
            .sort({ createdAt: -1 })
            .lean();

        return res.json({ error: false, count: projects.length, data: projects });
    } catch (err) {
        return res.status(500).json({ error: true, message: err.message });
    }
};

// GET /api/home-design/project/:id
exports.getProject = async (req, res) => {
    try {
        const userId  = req.user?.id || req.user?._id;
        const project = await HomeDesign.findOne({ _id: req.params.id, user_id: userId, is_deleted: false }).lean();
        if (!project) return res.status(404).json({ error: true, message: 'Project not found' });
        return res.json({ error: false, data: project });
    } catch (err) {
        return res.status(500).json({ error: true, message: err.message });
    }
};

// PATCH /api/home-design/project/:id
exports.updateProject = async (req, res) => {
    try {
        const userId = req.user?.id || req.user?._id;
        const allowed = [
            'project_name', 'property_type', 'bhk_config', 'total_area_sqft', 'floors',
            'city', 'state', 'climate_zone', 'plot_facing', 'main_door_direction',
            'design_style', 'budget_tier', 'family_type', 'language', 'rooms', 'status',
            'vastu_analysis', 'design_advice', 'interior_estimate', 'floor_plan_url',
            'floor_plan_analysis', 'linked_boq_id',
        ];
        const updates = {};
        for (const key of allowed) {
            if (req.body[key] !== undefined) updates[key] = req.body[key];
        }
        if (!Object.keys(updates).length) {
            return res.status(400).json({ error: true, message: 'No valid fields to update' });
        }

        const project = await HomeDesign.findOneAndUpdate(
            { _id: req.params.id, user_id: userId, is_deleted: false },
            { $set: updates },
            { new: true, runValidators: true }
        );
        if (!project) return res.status(404).json({ error: true, message: 'Project not found' });
        return res.json({ error: false, message: 'Project updated', data: project });
    } catch (err) {
        return res.status(500).json({ error: true, message: err.message });
    }
};

// DELETE /api/home-design/project/:id
exports.deleteProject = async (req, res) => {
    try {
        const userId = req.user?.id || req.user?._id;
        const project = await HomeDesign.findOneAndUpdate(
            { _id: req.params.id, user_id: userId, is_deleted: false },
            { $set: { is_deleted: true } },
            { new: true }
        );
        if (!project) return res.status(404).json({ error: true, message: 'Project not found' });
        return res.json({ error: false, message: 'Project deleted' });
    } catch (err) {
        return res.status(500).json({ error: true, message: err.message });
    }
};

// POST /api/home-design/project/:id/save-vastu  — save vastu analysis to a project
exports.saveVastuToProject = async (req, res) => {
    try {
        const userId = req.user?.id || req.user?._id;
        const { plot_facing, main_door_direction, rooms, staircase_direction, overhead_tank_direction } = req.body;

        const analysis = runVastuAnalysis(plot_facing, main_door_direction, rooms, staircase_direction, overhead_tank_direction);

        const project = await HomeDesign.findOneAndUpdate(
            { _id: req.params.id, user_id: userId, is_deleted: false },
            { $set: { vastu_analysis: analysis, plot_facing, main_door_direction } },
            { new: true }
        );
        if (!project) return res.status(404).json({ error: true, message: 'Project not found' });

        return res.json({ error: false, message: 'Vastu analysis saved to project', data: analysis });
    } catch (err) {
        return res.status(500).json({ error: true, message: err.message });
    }
};

// POST /api/home-design/project/:id/save-estimate  — save interior estimate to a project
exports.saveEstimateToProject = async (req, res) => {
    try {
        const userId = req.user?.id || req.user?._id;
        const { rooms, budget_tier = 'standard' } = req.body;

        if (!rooms || !rooms.length) return res.status(400).json({ error: true, message: 'rooms[] required' });

        const estimate = computeInteriorEstimate(rooms, budget_tier);

        const project = await HomeDesign.findOneAndUpdate(
            { _id: req.params.id, user_id: userId, is_deleted: false },
            { $set: { interior_estimate: estimate, budget_tier } },
            { new: true }
        );
        if (!project) return res.status(404).json({ error: true, message: 'Project not found' });

        return res.json({ error: false, message: 'Estimate saved to project', data: estimate });
    } catch (err) {
        return res.status(500).json({ error: true, message: err.message });
    }
};
