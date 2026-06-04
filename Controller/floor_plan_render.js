'use strict';
const crypto     = require('crypto');
const axios      = require('axios');
const cloudinary = require('cloudinary').v2;
const AiUsage    = require('../Model/AiUsage');

// ── Config ────────────────────────────────────────────────────────────────────
const GROQ_API_URL      = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_VISION_MODEL = 'llama-3.2-11b-vision-preview';

// txt2img model — FLUX.1 Schnell (~$0.0015/image, 4-step distilled, fastest quality/cost ratio)
// Override: RUNWARE_RENDER_MODEL=runware:101@1 for FLUX.1 Dev (better quality, ~$0.006/img)
// Override: RUNWARE_RENDER_MODEL=civitai:4201@501240 for DreamShaper XL (SDXL-based, photorealistic)
const RENDER_MODEL = process.env.RUNWARE_RENDER_MODEL || 'runware:100@1';

// Steps and guidance vary by model family:
//   FLUX.1 Schnell (runware:100@1): steps=4, CFGScale=0  (distilled — do NOT increase steps)
//   FLUX.1 Dev     (runware:101@1): steps=28, CFGScale=3.5
//   SDXL-based     (civitai:*)    : steps=30, CFGScale=7.0
const isFluxSchnell = RENDER_MODEL.startsWith('runware:100');
const RENDER_STEPS    = isFluxSchnell ? 4  : (RENDER_MODEL.startsWith('runware:101') ? 28 : 30);
const RENDER_GUIDANCE = isFluxSchnell ? 0  : (RENDER_MODEL.startsWith('runware:101') ? 3.5 : 7.0);

const MAX_ROOMS_PER_JOB    = 6;
const DAILY_RENDER_CREDITS = 12;

const todayKey = () => new Date().toISOString().slice(0, 10);

async function getCurrentCredits(userId) {
    const rec = await AiUsage.findOne({ user_id: userId, date_key: `render:${todayKey()}` });
    return rec ? rec.count : 0;
}

async function deductCredits(userId, n) {
    const tomorrow = new Date(); tomorrow.setUTCHours(24, 0, 0, 0);
    const rec = await AiUsage.findOneAndUpdate(
        { user_id: userId, date_key: `render:${todayKey()}` },
        { $inc: { count: n }, $setOnInsert: { expires_at: tomorrow } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return rec.count;
}

// ── Photography quality prefix/suffix applied to every prompt ─────────────────
const PHOTO_PREFIX = [
    'ultra-photorealistic interior architecture photography',
    'professional interior design magazine editorial shoot',
    'Hasselblad H6D medium format camera with Zeiss 21mm tilt-shift lens',
    'f/8 aperture perfectly levelled perspective correction',
    'global illumination physically based rendering',
    'soft diffused ambient fill light with one directional window key light',
].join(', ');

const PHOTO_SUFFIX = [
    '8k ultra-high resolution sharp detail on all surfaces and textures',
    'Architectural Digest and Elle Decor magazine quality',
    'award-winning professional interior photography',
    'no people no text no watermarks no digital artifacts',
    'perfectly composed rule-of-thirds framing',
].join(', ');

const NEGATIVE_PROMPT = [
    'people person human face hands cartoon illustration anime 3D cartoon',
    'low quality blurry out of focus watermark text logo',
    'overexposed underexposed flat grey lighting',
    'ugly furniture construction site unfinished room debris',
    'distorted perspective fisheye lens window glare blown highlights',
    'horror dark moody tiling artifacts jpeg artifacts',
    'empty unfurnished room fake CGI plastic look',
].join(', ');

// ── Style overlays: flooring / walls / furniture / lighting / accents ─────────
const STYLE_OVERLAYS = {
    modern_indian: {
        flooring:   '800×800 polished vitrified tiles in warm ivory beige with subtle vein, matte border strip',
        walls:      'smooth warm-white emulsion walls, gold-framed rectangular mirrors, slim brass floating shelf with curated objects',
        furniture:  'contemporary Indian teak-veneer and metal furniture, clean modular profiles, warm walnut finish cabinets',
        lighting:   'warm 3000K LED recessed cove lighting, brushed-gold cylinder pendant fixtures, concealed under-cabinet strips',
        accent:     'brass decorative objects, lush indoor plants in matte ceramic floor planters, modern backlit wooden pooja unit, abstract Indian art prints',
        atmosphere: 'bright refined contemporary Indian home, golden afternoon light through large windows, refined urban elegance',
    },
    traditional_indian: {
        flooring:   'polished Kota stone or Shahabad stone with hand-cut geometric inlay border in contrasting tone',
        walls:      'terracotta ochre lime-washed walls, hand-block-printed textile wall hanging, carved stone niche with diya',
        furniture:  'ornate hand-carved sheesham teak furniture with brass fittings, rich silk cushions in saffron and burgundy',
        lighting:   'warm brass hanging lanterns, oil-lamp diya alcoves, amber incandescent glow',
        accent:     'brass diyas and lamps, Rajasthani textile cushions, intricate mandala carved wood panel, terracotta pots with tulsi',
        atmosphere: 'warm rich Indian heritage home, deep cultural craft traditions, golden candlelit evening',
    },
    south_indian: {
        flooring:   'polished jet-black Kadappa stone or handmade Athangudi terracotta tiles with white geometric border',
        walls:      'pure white lime-washed walls, visible hand-carved teak ceiling rafters, traditional Kolam threshold line',
        furniture:  'dark teak and rosewood furniture with South Indian carvings, brass fittings, Chettinad cottage style',
        lighting:   'warm brass vilakku oil-lamp glow, soft natural light through teak jaali screens, low incandescent ceiling',
        accent:     'tall brass nilavilakku floor lamp, Tanjore painting gold frame on wall, bronze Nataraja sculpture, terracotta tulsi pot',
        atmosphere: 'serene Chettinad or Nalukettu aesthetic, cool lime-white and dark teak contrast, dignified calm',
    },
    rajasthani: {
        flooring:   'Jodhpur yellow sandstone with geometric inlay, or Makrana white marble with coloured stone border',
        walls:      'mirror-inlay sheesh-mahal accent panels, royal peacock-blue base with hand-painted fresco band',
        furniture:  'ornate carved sheesham furniture with brass fittings, royal silk embroidered cushions in jewel tones',
        lighting:   'coloured glass lantern pendants casting jewel-tone light pools, large brass chandelier, warm amber glow',
        accent:     'mirror inlay panels, coloured glass mosaic, peacock motif textiles, carved jaali stone screens, brass vessels',
        atmosphere: 'royal Rajasthani Haveli palace opulence, vibrant jewel colours, warm golden lantern light',
    },
    kerala_nalukettu: {
        flooring:   'traditional red oxide polished floor with natural deep-red sheen, or handmade Athangudi tiles',
        walls:      'pure white lime-washed walls with dark teak carved door surround and wooden frieze',
        furniture:  'dark jackwood and teak with traditional Kerala carvings, brass and copper hardware, no synthetic materials',
        lighting:   'brass nilavilakku oil-lamp floor stand glow, soft filtered light through wooden lattice, coconut-shade patterns',
        accent:     'brass nilavilakku lamp, Kathakali mask on wall, Kerala mural art panel, tulsi katte glimpse through arch, coconut-wood bowls',
        atmosphere: 'serene traditional Kerala Nalukettu, cool lime and dark teak contrast, monsoon tropical calm',
    },
    mughal_grand: {
        flooring:   'white Makrana marble with pietra-dura inlay floral pattern and intricate geometric border',
        walls:      'ivory stucco with gold relief plasterwork, pointed Mughal arches framing alcoves, deep teal accent',
        furniture:  'royal carved gilded-wood furniture, Persian silk carpet, deep velvet sofa in jewel tones, brass-inlay side tables',
        lighting:   'ornate crystal-drop chandelier centrepiece, warm amber candelabra, carved jali stone lanterns',
        accent:     'pietra-dura marble inlay panel, Mughal miniature paintings in gold frames, intricate brass vessels, fresh roses in crystal',
        atmosphere: 'grand Mughal palace luxury, soaring ornate ceiling, imperial golden-light opulence',
    },
    vastu_modern: {
        flooring:   'light cream vitrified tiles in northeast, warm light-oak laminate in bedrooms',
        walls:      'bright white in northeast and east rooms, warm yellow-cream in living, sage green in study',
        furniture:  'clean contemporary wood-tone furniture, lightweight open profiles, natural materials',
        lighting:   'maximum natural light from northeast windows, warm 3000K LED ambient, Vastu-compliant lamp placement',
        accent:     'northeast marble pooja corner, indoor plants in northeast, crystal energy accents, five-element decor objects',
        atmosphere: 'light airy Vastu-compliant modern Indian home, fresh morning northeast light flooding in, positive energy',
    },
    bengali_heritage: {
        flooring:   'black-and-white geometric mosaic floor tiles, Zamindari-era colonial pattern',
        walls:      'cool white walls, large framed Pattachitra and Kalighat paintings, dark wood dado rail',
        furniture:  'carved dark-wood Zamindari furniture, Kantha embroidered cushions, cane accent chairs',
        lighting:   'colonial-era glass pendant lights, warm incandescent bulbs, clay-lamp wall niches',
        accent:     'Bankura terracotta horse sculpture, Dokra metal figurines, Pattachitra scroll painting, vintage brass items',
        atmosphere: 'scholarly Bengali Zamindar heritage, cool colonial dignity and cultural pride',
    },
    modern: {
        flooring:   'large-format 1200×600 concrete-look porcelain tiles, dark steel trim border',
        walls:      'stark white walls with one charcoal or deep-navy feature wall, no surface ornament',
        furniture:  'low-profile contemporary furniture, grey-white palette, hidden storage, geometric clean lines',
        lighting:   'architectural concealed LED strips, floor-to-ceiling glass for daylight, matte-black pendant clusters',
        accent:     'one large abstract canvas artwork, single geometric bronze sculpture, nothing else on surfaces',
        atmosphere: 'sleek contemporary architectural minimalism, bright editorial daylight, cool precision',
    },
    minimalist: {
        flooring:   'light ash or birch engineered wood, no borders, seamless natural grain',
        walls:      'pure white walls, one small black-and-white framed print as the only wall piece',
        furniture:  'only essential pieces, Muji-style profiles, natural-linen upholstery, completely hidden storage',
        lighting:   'abundant white natural daylight, single warm Japanese washi-paper pendant, no decorative fixtures',
        accent:     'one ceramic bonsai pot on wood stand, single stem in minimalist vase, bare clean surfaces everywhere',
        atmosphere: 'absolute zen minimalist calm, total breathing space, wabi-sabi pure light',
    },
    scandinavian: {
        flooring:   'wide-plank warm light-oak wood, thick sheepskin throw rug beside bed or sofa',
        walls:      'white walls with warm linen texture, single simple Nordic print in thin frame',
        furniture:  'Scandi-style wood furniture with tapered legs, chunky knit throws, natural rattan accents',
        lighting:   'pendant rattan or paper-washi lampshade, warm Edison filament bulbs, cluster of white pillar candles',
        accent:     'potted plants in terracotta pots, dried pampas grass in tall vase, striped cotton rug, macramé hanging',
        atmosphere: 'hygge Scandinavian cosiness, warm golden evening candlelight, natural textures',
    },
    luxury: {
        flooring:   'book-matched Calacatta marble tiles with gold veining, herringbone light-oak in bedrooms',
        walls:      'book-matched marble feature wall, padded silk wall panels in champagne, brushed-gold picture-frame moulding',
        furniture:  'bespoke Italian designer furniture, deep-navy or emerald velvet, brushed gold metal legs, tufted headboards',
        lighting:   'custom crystal chandelier, concealed LED tray ceiling, brass wall sconces flanking mirror',
        accent:     'fresh white orchids in crystal vase, designer coffee-table art books, sculptural marble objects',
        atmosphere: '5-star ultra-luxury residential, the finest materials, dramatic professional studio lighting',
    },
    industrial: {
        flooring:   'polished raw concrete or slate-grey large tiles, black metal cable channel at wall base',
        walls:      'exposed red brick on main wall, raw concrete on others, steel I-beam ceiling structure visible',
        furniture:  'reclaimed barn-wood table, black leather sofa, metal-frame lounge chairs, industrial pipe shelving',
        lighting:   'Edison filament bulb cluster pendants, warm amber caged wall sconces, exposed conduit track lighting',
        accent:     'vintage factory clock on brick wall, metal mesh storage cubbies, leather-bound journals, gear accents',
        atmosphere: 'authentic urban industrial loft, raw honest materials, warm amber Edison light against brick and steel',
    },
    zen_japanese: {
        flooring:   'smooth pale ash-wood floor planks, tatami mat platform zone, smooth river-pebble border strip',
        walls:      'shoji rice-paper screen panels, white plaster walls, single kakemono scroll painting',
        furniture:  'low floor-level platform bed or sofa, minimal pieces, natural bamboo and maple wood only',
        lighting:   'diffused natural light through shoji screens, single warm Japanese washi-paper pendant globe',
        accent:     'bonsai on carved wood stand, ikebana arrangement in celadon ceramic, smooth river stones, bamboo water feature',
        atmosphere: 'absolute Zen wabi-sabi stillness, meditative morning-mist silence, perfectly imperfect',
    },
    biophilic: {
        flooring:   'natural travertine stone or earthy brown large-format tiles, natural-fibre jute area rug',
        walls:      'full living-plant vertical garden on main wall, raw sandstone feature wall, bamboo slat panel',
        furniture:  'raw-edge live-slab wood furniture, natural-fibre upholstery, organic irregular forms',
        lighting:   'dappled sunlight through hanging-plant canopy, warm diffused natural daylight only',
        accent:     'monstera fern pothos philodendron plants everywhere, river pebble accents, moss wall panel, bamboo water feature',
        atmosphere: 'lush indoor jungle plant sanctuary, oxygen-rich green oasis, pure nature brought inside',
    },
};

const DEFAULT_STYLE_OVERLAY = STYLE_OVERLAYS.modern_indian;

// ── Per-room base prompts: what furniture and layout is in each space ──────────
const ROOM_BASE_PROMPTS = {
    living_room: [
        'spacious family living room',
        'L-shaped modular sofa with premium fabric in warm neutral, coordinated scatter cushions and lumbar pillows',
        'low-profile rectangular coffee table with decorative tray, stacked art books, and a small sculptural object',
        'wall-mounted 65-inch television in a full-wall TV unit with open niches and closed storage, subtle LED backlight',
        'one textured stone-cladding or decorative panel accent wall behind seating',
        'tall Fiddle Leaf Fig tree in large ceramic floor planter beside balcony door',
        '4-panel sliding balcony door with sheer white inner curtain and rich linen outer curtain',
        'side console table with ceramic table lamp and floral arrangement',
        'false ceiling with stepped cove design, warm recessed LED downlights',
        'gallery wall of 5 coordinated frames in gallery arrangement on side wall',
    ].join(', '),

    master_bedroom: [
        'luxurious master bedroom',
        'king-size platform bed with tall floor-to-ceiling upholstered headboard panel in warm grey fabric',
        'matching floating bedside tables with elegant pendant reading lights descending from ceiling on each side',
        'full-wall 6-door sliding wardrobe with mirror panels and matte-laminate grain texture',
        'padded bench at foot of bed in complementary fabric',
        'dressing corner with LED-strip backlit vanity mirror and upholstered stool',
        'large window with layered curtain treatment — sheer inner and rich velvet outer drape',
        'plush area rug in warm caramel or ivory beside the bed',
        'coordinated scatter cushions and throw in accent jewel tone',
        'fresh white flowers in slim bud vase on one bedside table',
        'tray ceiling with architectural LED cove recess and downlights',
    ].join(', '),

    kitchen: [
        'spacious modular Indian kitchen',
        'L-shaped platform layout with overhead cabinets extending full height to ceiling',
        'matte-finish laminate shutters in soft white or sage green with integrated handle profile',
        'white quartz countertop with subtle grey veining, undermount stainless double-bowl sink with pull-out spray',
        'tall housing column with built-in microwave at eye level, oven below, and tall-fridge niche with panel',
        '90cm range hood chimney in brushed stainless above 4-burner glass hob',
        'handmade ceramic mosaic tile backsplash between counter and overhead cabinets',
        'non-slip textured stone-look vitrified floor tiles',
        'warm under-cabinet LED strip lighting illuminating work surface',
        'open floating shelf with spice jars, cookbooks, and a small herb pot',
        'fresh vegetables, herbs, and a wooden chopping board on counter',
    ].join(', '),

    dining_room: [
        'elegant dining room',
        '6-seater solid teak or walnut rectangular dining table with natural wood finish',
        'upholstered dining chairs in linen or boucle fabric with brushed-metal or carved-wood legs',
        'statement oversized pendant chandelier above table casting a warm pool of light on centrepiece',
        'sideboard or crockery cabinet with glass-panel doors showing good china and crystal',
        'textured accent wall with large decorative circular rattan mirror or abstract art piece',
        'fresh seasonal flower arrangement as table centrepiece in ceramic vase',
        'woven placemats, cloth napkins, and decorative brass candle holders at each setting',
        'window with soft afternoon sunlight, sheer curtain gently catching light',
    ].join(', '),

    bathroom: [
        'modern spa-inspired master bathroom',
        'wall-hung WC with concealed-cistern matte-chrome flush plate',
        'frameless glass shower with ceiling-mounted 300mm square rainfall head and rail-mounted handshower',
        '1800mm floating vanity with two undermount ceramic basins and storage drawers below in matte white',
        '1800mm backlit LED mirror with warm-white perimeter halo and anti-fog',
        '600×1200mm large-format marble-look wall tiles stacked vertically, floor-to-ceiling',
        'textured stone-look anti-slip floor tiles coordinated with wall tiles',
        'matte-chrome towel bar, toilet roll holder, and wall soap dispenser as a set',
        'recessed waterproof IP65 LED downlights in ceiling',
        'deep shower niche shelf with soap, shampoo, and a taper candle',
        'fresh white fluffy towels on heated towel rail',
        'small Pothos or Aloe plant on vanity corner',
    ].join(', '),

    pooja_room: [
        'sacred dedicated pooja room',
        'elevated white marble platform mandap temple unit with ornate hand-carved teak surround frame',
        'temple unit backlit internally with warm golden 2700K LED creating sacred glow around deities',
        'brass oil diya lamp stand with flickering flame on temple platform',
        'fresh marigold and jasmine flower garlands draped on deity platform',
        'small brass kalasha water pot and incense holder with thin aromatic smoke curl',
        'small brass bell on red thread from ceiling hook',
        'white marble or light vitrified floor with hand-drawn Kolam pattern at entrance threshold',
        'soft east-facing morning light falling on temple unit',
        'wall niche with small framed picture and brass diya',
        'absolutely immaculate calm sacred atmosphere, nothing out of place',
    ].join(', '),

    bedroom: [
        'comfortable well-furnished bedroom',
        'queen-size bed with upholstered headboard in warm neutral fabric',
        'matching pair of bedside tables with ceramic table lamps',
        '5-door sliding wardrobe with matte laminate in light wood finish',
        'study-dressing corner with table and chair',
        'sheer curtains filtering diffused natural light from window',
        'area rug in complementary warm tone beside bed',
        'scatter cushions in coordinated patterned fabric',
        'ceiling fan with integrated LED light',
    ].join(', '),

    study_room: [
        'focused work-from-home study room',
        '1800mm L-shaped study desk with hutch organiser above in oak laminate',
        'dual 27-inch monitors with neat cable management and ergonomic keyboard and mouse',
        'floor-to-ceiling built-in bookshelves on one wall, full of books binders and personal artifacts',
        'high-back ergonomic mesh office chair with adjustable armrests',
        'flexible-neck adjustable LED task lamp on desk corner',
        'large cork pinboard above desk with notes calendar and inspiration clips',
        'north-facing window with plantation shutters for filtered natural task light',
        'potted succulent and small leafy plant in ceramic pot on desk corner',
        'desk drawer pedestal for storage',
    ].join(', '),

    balcony: [
        'thoughtfully designed Indian apartment balcony outdoor living space',
        'bistro table with 2 matching café chairs in powder-coated iron or rattan, 60cm round table',
        'full vertical garden panel on one railing wall — trailing Pothos, mini-Monstera, and fern in felt pockets',
        'string of warm-white fairy lights along ceiling and inner railing',
        'weather-resistant stripe or geometric outdoor rug',
        'compact raised planter box with herb garden: curry leaf tulsi mint coriander and chillies',
        'terracotta pots with pink bougainvillea and marigold along outer railing',
        'privacy bamboo slatted blind on one side',
        'warm morning golden light with blue sky and soft urban or garden view beyond railing',
    ].join(', '),

    kids_room: [
        'playful cheerful children bedroom',
        'solid-wood bunk bed with safety railings and slide from top bunk, under-bed storage drawers',
        'colourful geometric or jungle-theme accent wallpaper on one wall',
        'built-in study tables and open bookshelves at correct ergonomic child height',
        'vibrant ABC or road-map area rug',
        'wall-mounted pegboard for art supplies and accessories',
        'soft plush toy basket and beanbag in corner',
        'chalkboard wall section for creativity',
        'primary and pastel colour palette: bright red yellow blue green on white base',
    ].join(', '),
};

const ROOM_LABELS = {
    living_room:    'Living Room',
    master_bedroom: 'Master Bedroom',
    bedroom:        'Bedroom',
    kitchen:        'Kitchen',
    dining_room:    'Dining Room',
    bathroom:       'Bathroom',
    pooja_room:     'Pooja Room',
    study_room:     'Study Room',
    balcony:        'Balcony',
    kids_room:      'Kids Room',
};

// ── Prompt builder ────────────────────────────────────────────────────────────
function buildRenderPrompt(roomType, styleId, constructionType) {
    const roomBase  = ROOM_BASE_PROMPTS[roomType]
        || `beautifully furnished ${roomType.replace(/_/g, ' ')} interior`;
    const style     = STYLE_OVERLAYS[styleId] || DEFAULT_STYLE_OVERLAY;
    const ctxLabel  = {
        apartment:         'upscale urban Indian apartment interior',
        independent_house: 'spacious Indian independent house interior',
        villa:             'luxury Indian villa interior',
        bungalow:          'elegant Indian bungalow interior',
    }[constructionType] || 'Indian home interior';

    return [
        PHOTO_PREFIX,
        roomBase,
        `flooring: ${style.flooring}`,
        `walls and surfaces: ${style.walls}`,
        `furniture: ${style.furniture}`,
        `lighting: ${style.lighting}`,
        `decorative accents: ${style.accent}`,
        `atmosphere: ${style.atmosphere}`,
        ctxLabel,
        PHOTO_SUFFIX,
    ].join(', ');
}

// ── Groq vision: extract rooms from floor plan image ─────────────────────────
async function analyzeFloorPlanImage(planUrl) {
    const keys = [
        process.env.GROQ_API_KEY,
        process.env.GROQ_API_KEY_2,
        process.env.GROQ_API_KEY_3,
    ].filter(Boolean);
    if (!keys.length) throw new Error('GROQ_API_KEY not configured');

    const resp = await axios.post(
        GROQ_API_URL,
        {
            model: GROQ_VISION_MODEL,
            messages: [{
                role: 'user',
                content: [
                    { type: 'image_url', image_url: { url: planUrl, detail: 'high' } },
                    {
                        type: 'text',
                        text: `Analyze this Indian home floor plan. Identify every room visible.

For each room return a JSON object with these fields:
- room_type: one of [living_room, master_bedroom, bedroom, kitchen, dining_room, bathroom, pooja_room, study_room, balcony, kids_room]
- room_name: human-readable label (e.g. "Master Bedroom")
- approximate_area_sqft: number estimate from the plan scale
- vastu_direction: compass direction [north, south, east, west, northeast, northwest, southeast, southwest]
- notes: one short observation (e.g. "attached bathroom", "corner unit")

Return ONLY a valid JSON array, no prose. Example:
[{"room_type":"living_room","room_name":"Living Room","approximate_area_sqft":200,"vastu_direction":"north","notes":"balcony access"}]`,
                    },
                ],
            }],
            max_tokens: 900,
            temperature: 0.1,
        },
        {
            headers: { Authorization: `Bearer ${keys[0]}`, 'Content-Type': 'application/json' },
            timeout: 25000,
        }
    );

    const content = resp.data.choices[0].message.content.trim();
    const match   = content.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('Vision model did not return a JSON array of rooms');
    return JSON.parse(match[0]);
}

// ── Runware txt2img ───────────────────────────────────────────────────────────
async function generateRoomRender(prompt) {
    const apiKey = process.env.RUNWARE_API_KEY;
    if (!apiKey) throw new Error('RUNWARE_API_KEY not configured');

    const resp = await axios.post(
        'https://api.runware.ai/v1',
        [{
            taskType:       'imageInference',
            taskUUID:       crypto.randomUUID(),
            model:          RENDER_MODEL,
            positivePrompt: prompt,
            negativePrompt: NEGATIVE_PROMPT,
            width:          1024,
            height:         768,
            numberResults:  1,
            steps:          RENDER_STEPS,
            CFGScale:       RENDER_GUIDANCE,
            outputFormat:   'WEBP',
        }],
        {
            headers: {
                Authorization:  `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            timeout: 60000,
        }
    );

    const data   = resp.data?.data;
    if (!data?.length) throw new Error('Runware: empty response');
    const result = data.find(d => d.taskType === 'imageInference' && d.imageURL);
    if (!result)  throw new Error('Runware: no imageInference result — ' + JSON.stringify(data));
    return result.imageURL;
}

// ── Cloudinary upload ─────────────────────────────────────────────────────────
async function uploadRender(imageUrl, roomType) {
    return cloudinary.uploader.upload(imageUrl, {
        folder:        'bricks_room_renders',
        resource_type: 'image',
        format:        'webp',
        quality:       'auto:best',
        public_id:     `render_${roomType}_${Date.now()}`,
    });
}

// ══════════════════════════════════════════════════════════════════════════════
// CONTROLLERS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/floor-render/visualize
 *
 * Body:
 *   plan_url          (string, optional) – floor plan image URL; AI extracts rooms via vision
 *   style_id          (string)           – design style, default 'modern_indian'
 *   construction_type (string)           – apartment | independent_house | villa | bungalow
 *   bhk_config        (string, optional) – '2BHK' | '3BHK' etc (informational, used in future)
 *   rooms_to_render   (string[], optional) – override/supplement room list
 *
 * Returns renders[] with render_url, thumbnail_url, room_type, room_label, style_used
 */
exports.visualize = async (req, res) => {
    try {
        const userId = req.user?.id || req.user?._id;
        const {
            plan_url,
            style_id        = 'modern_indian',
            construction_type = 'apartment',
            rooms_to_render = [],
        } = req.body;

        if (!plan_url && !rooms_to_render?.length) {
            return res.status(400).json({
                error:   true,
                message: 'Provide plan_url (floor plan image for AI analysis) or rooms_to_render[] array.',
                valid_room_types: Object.keys(ROOM_LABELS),
            });
        }

        // ── Determine room list ────────────────────────────────────────────
        let roomList     = [];
        let planAnalysis = null;

        if (plan_url && !rooms_to_render?.length) {
            try {
                const extracted = await analyzeFloorPlanImage(plan_url);
                planAnalysis    = extracted;
                roomList = extracted.map(r => r.room_type).filter(rt => ROOM_BASE_PROMPTS[rt]);
            } catch (e) {
                console.warn('[floor-render] Vision analysis failed:', e.message);
                return res.status(422).json({
                    error:   true,
                    message: 'Could not auto-analyze the floor plan image. Please pass rooms_to_render[] directly.',
                    detail:  e.message,
                });
            }
        } else {
            roomList = (rooms_to_render || []).filter(rt => ROOM_BASE_PROMPTS[rt]);
        }

        if (!roomList.length) {
            return res.status(400).json({
                error:   true,
                message: 'No renderable rooms found. Valid room types: ' + Object.keys(ROOM_LABELS).join(', '),
            });
        }

        // ── Check daily quota ──────────────────────────────────────────────
        const used      = await getCurrentCredits(userId);
        const remaining = Math.max(0, DAILY_RENDER_CREDITS - used);

        if (remaining === 0) {
            return res.status(429).json({
                error:        true,
                rate_limited: true,
                message:      `Daily render limit of ${DAILY_RENDER_CREDITS} rooms reached. Upgrade to Bricks Pro for unlimited renders!`,
                message_hi:   `आज की ${DAILY_RENDER_CREDITS} renders की सीमा पूरी हुई। अनलिमिटेड के लिए Bricks Pro अपग्रेड करें!`,
                message_te:   `రోజువారీ ${DAILY_RENDER_CREDITS} renders పరిమితి అయిపోయింది!`,
                used,
                limit:        DAILY_RENDER_CREDITS,
            });
        }

        const toRender = roomList.slice(0, Math.min(MAX_ROOMS_PER_JOB, remaining));

        // ── Generate all rooms in parallel ─────────────────────────────────
        const results = await Promise.allSettled(
            toRender.map(async (roomType) => {
                const prompt     = buildRenderPrompt(roomType, style_id, construction_type);
                const runwareUrl = await generateRoomRender(prompt);
                const uploaded   = await uploadRender(runwareUrl, roomType);
                const fullUrl    = uploaded.secure_url;
                return {
                    room_type:     roomType,
                    room_label:    ROOM_LABELS[roomType] || roomType,
                    render_url:    fullUrl,
                    thumbnail_url: fullUrl.replace('/upload/', '/upload/w_600,c_fill,q_auto/'),
                    style_used:    style_id,
                    prompt_used:   prompt,
                };
            })
        );

        const succeeded = results.filter(r => r.status === 'fulfilled').map(r => r.value);
        const failed    = results
            .map((r, i) => r.status === 'rejected' ? { room_type: toRender[i], error: r.reason?.message } : null)
            .filter(Boolean);

        if (succeeded.length > 0) {
            await deductCredits(userId, succeeded.length);
        }

        const newUsed = used + succeeded.length;

        return res.status(succeeded.length > 0 ? 200 : 503).json({
            error:            succeeded.length === 0,
            message:          succeeded.length > 0
                ? `Generated ${succeeded.length} room render${succeeded.length > 1 ? 's' : ''}!`
                : 'All renders failed — check RUNWARE_API_KEY configuration.',
            renders:          succeeded,
            failed_rooms:     failed.length ? failed : undefined,
            plan_analysis:    planAnalysis,
            total_renders:    succeeded.length,
            style_used:       style_id,
            construction_type,
            usage:            newUsed,
            limit:            DAILY_RENDER_CREDITS,
            remaining:        Math.max(0, DAILY_RENDER_CREDITS - newUsed),
        });
    } catch (err) {
        console.error('[floor-render] visualize error:', err);
        return res.status(500).json({ error: true, message: err.message });
    }
};

// GET /api/floor-render/styles
exports.getStyles = (_req, res) => {
    const INDIAN_IDS = new Set([
        'modern_indian','traditional_indian','south_indian','rajasthani',
        'kerala_nalukettu','mughal_grand','vastu_modern','bengali_heritage',
    ]);
    const data = Object.keys(STYLE_OVERLAYS).map(id => ({
        id,
        name:     id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        category: INDIAN_IDS.has(id) ? 'indian' : 'international',
    }));
    res.json({ error: false, total: data.length, data });
};

// GET /api/floor-render/room-types
exports.getRoomTypes = (_req, res) => {
    const data = Object.entries(ROOM_LABELS).map(([id, label]) => ({ id, label }));
    res.json({ error: false, data });
};

// GET /api/floor-render/usage
exports.getUsage = async (req, res) => {
    try {
        const used = await getCurrentCredits(req.user?.id || req.user?._id);
        return res.json({
            error:     false,
            used,
            limit:     DAILY_RENDER_CREDITS,
            remaining: Math.max(0, DAILY_RENDER_CREDITS - used),
            model:     RENDER_MODEL,
        });
    } catch (err) {
        return res.status(500).json({ error: true, message: err.message });
    }
};
