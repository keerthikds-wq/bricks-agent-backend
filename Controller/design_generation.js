/**
 * AI Design Generation Controller
 *
 * Implements image-to-image AI redesign across 5 use cases:
 *   room      — Full interior room redesign (match reference screenshots)
 *   exterior  — Facade / building exterior redesign
 *   walls     — Wall colour / texture redesign with colour picker
 *   furniture — Replace or add individual furniture items
 *   garden    — Garden / landscape design
 *
 * AI Providers (configure via .env):
 *   REPLICATE_API_TOKEN   — Replicate.com (primary, async, URL-based)
 *   STABILITY_API_KEY     — Stability AI (secondary, sync, higher quality)
 *   DESIGN_AI_PROVIDER    — 'replicate' | 'stability' | 'mock'  (default: replicate)
 *
 * Flow:
 *   1. App uploads image → POST /api/design-gen/upload-image → Cloudinary URL
 *   2. App calls generation endpoint with URL + style → returns { job_id, status }
 *   3. App polls GET /api/design-gen/job/:id until status = 'completed'
 *   4. Completed record contains output_images[] with Cloudinary URLs
 */

const axios      = require('axios');
const FormData   = require('form-data');
const cloudinary = require('cloudinary').v2;
const multer     = require('../Utils/multer');

const DesignGeneration = require('../Model/DesignGeneration');
const AiUsage          = require('../Model/AiUsage');

// ── Config ────────────────────────────────────────────────────────────────────
const PROVIDER = process.env.DESIGN_AI_PROVIDER || 'replicate';

// Replicate model versions (pin versions for stability)
const REPLICATE_MODELS = {
    interior: {
        version: process.env.REPLICATE_INTERIOR_VERSION ||
                 '76604baddc85b1b4616e1c6475eca080da339c8875bd4996705440484a6eac38',
        input: (imageUrl, prompt, negPrompt, strength) => ({
            image:              imageUrl,
            prompt,
            negative_prompt:    negPrompt,
            prompt_strength:    strength,
            guidance_scale:     15,
            num_inference_steps:50,
            num_outputs:        1,
            scheduler:          'DPMSolverMultistep',
        }),
    },
    sdxl: {
        version: process.env.REPLICATE_SDXL_VERSION ||
                 '7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc',
        input: (imageUrl, prompt, negPrompt, strength) => ({
            image:          imageUrl,
            prompt,
            negative_prompt: negPrompt,
            image_strength:  1 - (strength || 0.7),   // SDXL uses inverse scale
            num_outputs:     1,
            refine:          'expert_ensemble_refiner',
            apply_watermark: false,
        }),
    },
};

const DAILY_GEN_LIMIT  = 5;   // free generations per user per day
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_TRIES   = 20;  // 60 second max wait

// ══════════════════════════════════════════════════════════════════════════════
// STYLE CATALOG — 23 styles (8 Indian + 15 international)
// thumbnail is the path the Flutter app uses from its own assets bundle
// ══════════════════════════════════════════════════════════════════════════════
const STYLE_CATALOG = [
    // ── Indian Styles (category: 'indian') ────────────────────────────────────
    {
        id: 'modern_indian',
        name: 'Modern Indian',
        name_hi: 'आधुनिक भारतीय',
        name_te: 'ఆధునిక భారతీయ',
        name_ta: 'நவீன இந்திய',
        name_kn: 'ಆಧುನಿಕ ಭಾರತೀಯ',
        category: 'indian',
        prompt: 'modern Indian interior design, contemporary Indian home, clean minimalist lines, neutral cream and white palette with gold brass accents, traditional Indian artwork on walls, a dedicated pooja unit with backlit marble panel, warm ambient LED lighting, high-end vitrified tile flooring, lush indoor plants, 8k photorealistic interior photography',
        negative_prompt: 'cluttered, dark, low quality, cartoon, blurry, watermark, text, western fast food, dirty',
        strength: 0.75,
        exterior_prompt: 'modern Indian villa exterior, contemporary Indian architecture, white and beige facade, jali screens, warm lighting, landscaped garden with Indian plants, flat and sloping roof combination, photorealistic 8k',
    },
    {
        id: 'traditional_indian',
        name: 'Traditional Indian',
        name_hi: 'पारंपरिक भारतीय',
        name_te: 'సంప్రదాయ భారతీయ',
        name_ta: 'பாரம்பரிய இந்திய',
        name_kn: 'ಸಾಂಪ್ರದಾಯಿಕ ಭಾರತೀಯ',
        category: 'indian',
        prompt: 'traditional Indian interior design, ornate carved teak wood furniture, rich terracotta and saffron colors, handwoven silk cushions, brass diyas and oil lamps, intricate mandala wall art, Rajasthani textile wall hangings, stone jali screens, hand-painted ceramic pots, warm ambient lighting, 8k photorealistic',
        negative_prompt: 'western modern, IKEA style, cold colors, plastic furniture, low quality, blurry',
        strength: 0.78,
        exterior_prompt: 'traditional Indian bungalow exterior, terracotta tiles, carved wooden door, ornate brackets, lime washed walls, terracotta pot planters, tropical landscaping, mangalore tile roof, photorealistic 8k',
    },
    {
        id: 'south_indian',
        name: 'South Indian Classical',
        name_te: 'దక్షిణ భారత క్లాసికల్',
        name_ta: 'தென்னிந்திய பாரம்பரியம்',
        name_kn: 'ದಕ್ಷಿಣ ಭಾರತೀಯ ಶಾಸ್ತ್ರೀಯ',
        category: 'indian',
        prompt: 'South Indian classical interior, polished black Kadappa stone floor, teak wood ceiling with carved beams, Athangudi handmade terracotta tiles, brass vilakku oil lamp, hand-carved teak wood pillars, white lime-washed walls, traditional Chettinad Kottai style, bronze sculptures, photorealistic 8k photography',
        negative_prompt: 'western, modern industrial, synthetic materials, plastic, low quality, blurry',
        strength: 0.78,
        exterior_prompt: 'South Indian traditional house exterior, Mangalore clay tile roof, carved teak wood door, chunam lime white walls, kolam rangoli on floor, tropical garden with banana and coconut, photorealistic 8k',
    },
    {
        id: 'rajasthani',
        name: 'Rajasthani Haveli',
        name_hi: 'राजस्थानी हवेली',
        category: 'indian',
        prompt: 'Rajasthani haveli interior design, vibrant peacock blue, royal red and gold color scheme, mirror inlay sheesh mahal walls, carved Jodhpur sandstone arches, jharokha window with coloured glass, ornate sheesham wood furniture with brass fittings, hand-painted fresco murals, silk embroidered cushions, brass chandeliers, 8k photorealistic',
        negative_prompt: 'plain, minimalist, modern corporate, low quality, blurry',
        strength: 0.80,
        exterior_prompt: 'Rajasthani haveli palace exterior, Jodhpur sandstone facade, jaali lattice screens, carved brackets, jharokha bay windows, ornate entrance gate, peacock motif carvings, warm golden lighting, photorealistic 8k',
    },
    {
        id: 'kerala_nalukettu',
        name: 'Kerala Nalukettu',
        name_ml: 'കേരള നാലുകെട്ട്',
        category: 'indian',
        prompt: 'Kerala traditional nalukettu interior, open central courtyard Nadumuttam with rain falling, dark teak wood and jackwood furniture, traditional red oxide polished floor, antique brass oil lamps, white lime-washed walls, carved wooden ceiling rafters, bronze sculptures, Brahmin-style traditional Kerala home, 8k photorealistic',
        negative_prompt: 'modern, synthetic, western, bright artificial colors, low quality',
        strength: 0.78,
        exterior_prompt: 'traditional Kerala nalukettu home exterior, steep sloped Mangalore tile roof, white washed walls, dark carved teak wood door, Charupady verandah, tropical garden with coconut trees, photorealistic 8k',
    },
    {
        id: 'mughal_grand',
        name: 'Mughal Grand',
        name_hi: 'मुग़ल भव्य',
        category: 'indian',
        prompt: 'Mughal-inspired luxury interior, high arched doorways with intricate geometric inlay, rich jewel tone walls in deep teal and burgundy, Persian silk carpet, crystal chandelier, ornate gold stucco plasterwork, pietra dura marble inlay floor, royal throne-style sofa with gold carving, Mughal miniature framed paintings, 8k photorealistic',
        negative_prompt: 'simple, plain, budget, modern minimalist, low quality',
        strength: 0.80,
        exterior_prompt: 'Mughal architecture inspired villa exterior, white marble facade, arched entrance, pietra dura inlay, charbagh garden with water channel, dome roof, photorealistic 8k',
    },
    {
        id: 'vastu_modern',
        name: 'Vastu Modern',
        name_hi: 'वास्तु आधुनिक',
        category: 'indian',
        prompt: 'Vastu-compliant modern Indian interior, bright open northeast corner flooded with morning light, clean contemporary furniture, warm cream walls in the living area, pooja room in northeast with white marble, light and airy feel, strategic placement of plants, 5-element balance design, modern Indian family home, 8k photorealistic',
        negative_prompt: 'dark northeast corner, cluttered, blocked windows, synthetic, low quality',
        strength: 0.72,
        exterior_prompt: 'Vastu-compliant modern Indian home exterior, east facing entrance with auspicious threshold, north-east open garden, white and cream facade, modern design, photorealistic 8k',
    },
    {
        id: 'bengali_heritage',
        name: 'Bengali Heritage',
        name_bn: 'বাংলা ঐতিহ্য',
        category: 'indian',
        prompt: 'Bengali heritage interior, Zamindari-era Thakur Dalan prayer hall aesthetic, terracotta Bankura horse and dokra sculptures, Kantha embroidery cushions, carved wooden furniture, large framed Pattachitra paintings, cool white and terracotta color scheme, mosaic black-white floor, clay lamp alcoves, 8k photorealistic',
        negative_prompt: 'western, modern, synthetic, low quality, blurry',
        strength: 0.78,
        exterior_prompt: 'Bengali heritage zamindar house exterior, terracotta tile roof, ornate facade details, terracotta sculpted panels, traditional Bengali architecture, tropical garden, photorealistic 8k',
    },

    // ── International Styles (category: 'international') ─────────────────────
    {
        id: 'modern',
        name: 'Modern',
        category: 'international',
        prompt: 'modern interior design, sleek clean lines, neutral white and grey palette, low-profile contemporary furniture, floor-to-ceiling windows, polished concrete or large-format tile floor, concealed LED lighting, architectural minimalism, high quality professional interior photography, 8k',
        negative_prompt: 'cluttered, ornate, traditional, cartoon, low quality, blurry',
        strength: 0.72,
        exterior_prompt: 'modern contemporary home exterior, flat or low-slope roof, floor-to-ceiling glass, white and concrete facade, clean geometric lines, minimal landscaping with ornamental grasses, photorealistic 8k',
    },
    {
        id: 'minimalist',
        name: 'Minimalist',
        category: 'international',
        prompt: 'minimalist interior design, only essential furniture, stark white walls, monochromatic palette, warm light oak wood floors, abundant natural daylight, zero clutter, single statement art piece, clean architectural lines, zen calm, 8k photorealistic interior',
        negative_prompt: 'cluttered, colorful, busy, ornate, dark, low quality',
        strength: 0.70,
        exterior_prompt: 'minimalist house exterior, pure white render walls, flat roof, large windows, pebble garden, no ornament, architectural photography 8k',
    },
    {
        id: 'scandinavian',
        name: 'Scandinavian',
        category: 'international',
        prompt: 'Scandinavian interior design, hygge atmosphere, white walls with warm light oak floors, chunky hand-knit throw blankets, sheepskin rug, pendant rattan lamp, abundant indoor plants in terracotta pots, candles, natural linen curtains, Nordic cozy aesthetic, photorealistic 8k',
        negative_prompt: 'dark, heavy, industrial, cluttered, bright neon, low quality',
        strength: 0.73,
        exterior_prompt: 'Scandinavian house exterior, white timber cladding, pitched roof, black window frames, flower boxes, minimalist garden, photorealistic 8k',
    },
    {
        id: 'cozy',
        name: 'Cozy',
        category: 'international',
        prompt: 'cozy warm interior design, deep-cushioned plush sofa in warm caramel velvet, layered knit throws and pillows, burning fireplace, warm amber and terracotta tones, parquet wood floor, shiplap accent wall, warm Edison bulb lighting, vase of dried pampas grass, hygge inspired, 8k photorealistic',
        negative_prompt: 'cold, stark, industrial, minimalist, hard surfaces, low quality',
        strength: 0.72,
        exterior_prompt: 'cozy cottage exterior, warm stone walls, climbing roses, timber porch, warm lit windows, evening glow, photorealistic 8k',
    },
    {
        id: 'luxury',
        name: 'Luxury',
        category: 'international',
        prompt: 'ultra luxury interior design, Calacatta marble floor and feature wall, brushed gold and brass fixtures, deep blue or emerald velvet sofa, crystal chandelier, designer Italian furniture, book-matched marble surfaces, bespoke cabinetry, professional interior photography, 8k ultra-detailed',
        negative_prompt: 'budget, IKEA, plastic, simple, cluttered, low quality',
        strength: 0.78,
        exterior_prompt: 'luxury mansion exterior, stone facade, grand entrance columns, manicured garden, water feature fountain, circular driveway, photorealistic 8k',
    },
    {
        id: 'farmhouse',
        name: 'Farmhouse',
        category: 'international',
        prompt: 'American farmhouse interior, white shiplap paneling, reclaimed barn wood beams, linen slipcover sofa, galvanized metal accents, sliding barn door, mason jar lighting, cotton rugs, wildflower arrangement, neutral warm palette, cozy and rustic, 8k photorealistic',
        negative_prompt: 'urban, modern industrial, steel, neon, low quality',
        strength: 0.73,
        exterior_prompt: 'American farmhouse exterior, white board-and-batten siding, metal roof, wraparound porch, rocking chairs, picket fence, photorealistic 8k',
    },
    {
        id: 'biophilic',
        name: 'Biophilic',
        category: 'international',
        prompt: 'biophilic interior design, lush living plant wall covering entire wall, monstera and fern plants everywhere, natural stone surfaces, smooth river pebble accents, raw wood furniture, natural fibre jute rug, dappled sunlight through leaves, connection to nature, green sanctuary, 8k photorealistic',
        negative_prompt: 'no plants, synthetic, plastic, industrial, dark, low quality',
        strength: 0.75,
        exterior_prompt: 'biophilic home exterior, living green wall, rooftop garden, natural stone, wood cladding, surrounded by trees, photorealistic 8k',
    },
    {
        id: 'mid_century',
        name: 'Mid Century',
        category: 'international',
        prompt: 'mid-century modern interior design, 1960s retro aesthetic, Eames chair, organic walnut wood furniture with tapered legs, mustard yellow and burnt orange accent cushions, sunburst wall clock, geometric patterned rug, teak sideboard, bold botanical print wallpaper on one wall, 8k photorealistic',
        negative_prompt: 'contemporary, traditional, cluttered, low quality',
        strength: 0.73,
        exterior_prompt: 'mid-century modern house exterior, low-pitch roof, clerestory windows, warm wood and brick, sculptural landscaping, photorealistic 8k',
    },
    {
        id: 'mediterranean',
        name: 'Mediterranean',
        category: 'international',
        prompt: 'Mediterranean interior design, Saltillo terracotta tile floor, white stucco arched walls, hand-painted Talavera blue and white tile backsplash, wrought iron chandelier, azure blue accents, sea-grass baskets, olive trees in terracotta pots, breezy linen curtains, photorealistic 8k',
        negative_prompt: 'dark, modern industrial, minimalist, cold colors, low quality',
        strength: 0.75,
        exterior_prompt: 'Mediterranean villa exterior, white stucco walls, clay tile roof, arched doorways, bougainvillea climbing, blue shutters, terracotta pots, sea view, photorealistic 8k',
    },
    {
        id: 'bohemian',
        name: 'Bohemian',
        category: 'international',
        prompt: 'bohemian interior design, macrame wall hanging, eclectic mix of colorful kilim and Persian rugs, rattan furniture, hanging plants in woven baskets, mismatched printed textiles, global travel artifacts, warm fairy lights, maximalist colorful aesthetic, free-spirited, 8k photorealistic',
        negative_prompt: 'minimal, corporate, monochrome, bland, low quality',
        strength: 0.75,
        exterior_prompt: 'bohemian cottage exterior, climbing vines, eclectic painted door, wind chimes, colorful pots, lush wild garden, photorealistic 8k',
    },
    {
        id: 'industrial',
        name: 'Industrial',
        category: 'international',
        prompt: 'industrial loft interior design, exposed red brick wall, visible steel pipes and beams, polished concrete floor, black steel window frames, Edison filament bulb pendant lights, leather sofa, reclaimed wood dining table, metal wire mesh storage, urban aesthetic, 8k photorealistic',
        negative_prompt: 'soft, romantic, traditional, floral, pastel, low quality',
        strength: 0.74,
        exterior_prompt: 'industrial style building exterior, exposed brick, metal cladding, steel windows, minimalist landscaping, urban setting, photorealistic 8k',
    },
    {
        id: 'zen_japanese',
        name: 'Zen / Japanese',
        category: 'international',
        prompt: 'Japanese zen interior design, shoji rice paper screen panels, raised tatami mat platform, smooth river stone garden inside, bamboo and natural wood, bonsai tree, ikebana flower arrangement in minimalist vase, neutral beige and earthy tones, absolute calm and silence, wabi-sabi aesthetic, 8k photorealistic',
        negative_prompt: 'cluttered, colorful, western ornate, low quality, blurry',
        strength: 0.76,
        exterior_prompt: 'Japanese zen house exterior, engawa wooden deck, stone garden, maple tree, bamboo fence, minimalist design, photorealistic 8k',
    },
    {
        id: 'cartoon',
        name: 'Cartoon / Kids',
        category: 'specialty',
        prompt: 'fun colorful children\'s bedroom interior, cartoon themed walls with jungle animals, bright yellow and pink primary colors, bunk bed with slide, plush toy storage, rainbow rug, oversized stuffed animals, balloon decorations, soft play mat, cheerful and playful, 3D rendered illustration style, vibrant',
        negative_prompt: 'dark, adult, minimalist, scary, realistic photography, low quality',
        strength: 0.82,
        exterior_prompt: 'colorful cartoon playhouse exterior, bright painted walls, whimsical shapes, slide and swing, fairy lights, photorealistic 8k',
    },
    {
        id: 'cyberpunk',
        name: 'Cyberpunk',
        category: 'specialty',
        prompt: 'cyberpunk gaming room interior, all-over RGB LED strip lighting in purple magenta and cyan, dark walls with neon city wallpaper mural, triple monitor gaming setup, black gaming chair, glowing keyboard and mouse, futuristic LED desk, gaming posters, blade runner aesthetic, 8k photorealistic',
        negative_prompt: 'natural light, traditional, bright white, plants, low quality',
        strength: 0.80,
        exterior_prompt: 'cyberpunk building exterior, neon signage, rain-slicked streets, holographic billboards, dark and moody, photorealistic 8k',
    },
];

// ── Room type catalog ─────────────────────────────────────────────────────────
const ROOM_TYPES = [
    { id: 'living_room',      label: 'Living Room',       hint: 'sofa, TV unit, coffee table area' },
    { id: 'master_bedroom',   label: 'Bedroom',           hint: 'bed, wardrobe, dressing area' },
    { id: 'kitchen',          label: 'Kitchen',           hint: 'modular kitchen, cooking area' },
    { id: 'dining_room',      label: 'Dining Room',       hint: 'dining table, crockery cabinet' },
    { id: 'bathroom',         label: 'Bathroom',          hint: 'toilet, basin, shower/bathtub' },
    { id: 'study_room',       label: 'Study / Office',    hint: 'desk, bookshelf, workspace' },
    { id: 'pooja_room',       label: 'Pooja Room',        hint: 'mandir, prayer space' },
    { id: 'kids_room',        label: 'Kids Room',         hint: 'play area, study, bed' },
    { id: 'balcony',          label: 'Balcony / Terrace', hint: 'outdoor seating, plants' },
    { id: 'garden',           label: 'Garden / Yard',     hint: 'lawn, pathways, plants' },
];

// ── Exterior style strip (for the bottom selector in the reference screenshots) ──
const EXTERIOR_STYLES = ['modern_indian', 'modern', 'minimalist', 'mediterranean',
                          'zen_japanese', 'farmhouse', 'rajasthani', 'mughal_grand', 'luxury'];

// ── Usage helpers ─────────────────────────────────────────────────────────────
const todayKey = () => new Date().toISOString().slice(0, 10);

async function checkAndIncrementUsage(userId) {
    const key      = todayKey();
    const tomorrow = new Date(); tomorrow.setUTCHours(24, 0, 0, 0);
    const rec = await AiUsage.findOneAndUpdate(
        { user_id: userId, date_key: `gen:${key}` },
        { $inc: { count: 1 }, $setOnInsert: { expires_at: tomorrow } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return rec.count;
}

// ══════════════════════════════════════════════════════════════════════════════
// PROMPT BUILDER — constructs tailored prompts per generation type
// ══════════════════════════════════════════════════════════════════════════════
function buildPrompt(genType, styleObj, roomType, customInstruction, colorChoice) {
    if (!styleObj) {
        return {
            prompt: `beautiful redesigned ${genType} interior, high quality photography, 8k photorealistic`,
            negative_prompt: 'low quality, blurry, cartoon, watermark, text, deformed',
            strength: 0.72,
        };
    }

    let prompt        = '';
    let negPrompt     = styleObj.negative_prompt || 'low quality, blurry, cartoon, watermark, text, deformed';
    let strength      = styleObj.strength || 0.75;

    switch (genType) {
        case 'room':
            prompt = styleObj.prompt;
            if (roomType) {
                const roomLabel = ROOM_TYPES.find(r => r.id === roomType)?.label || roomType;
                prompt = `${roomLabel} interior, ${prompt}`;
            }
            break;

        case 'exterior':
            prompt = styleObj.exterior_prompt || `${styleObj.name} style home exterior, photorealistic 8k`;
            strength = Math.min(strength + 0.05, 0.85);
            break;

        case 'walls': {
            const colorDesc = colorChoice ? `${colorChoice} wall color` : 'beautifully repainted walls';
            prompt = `${colorDesc}, ${styleObj.prompt}, focus on walls and ceiling, same furniture and layout, photorealistic 8k`;
            strength = 0.45;   // lower strength — preserve furniture, only change walls
            break;
        }

        case 'furniture':
            prompt = `${customInstruction || 'updated furniture'}, ${styleObj.prompt}, photorealistic 8k`;
            strength = 0.68;
            break;

        case 'garden':
            prompt = `beautiful garden landscape design, ${styleObj.name} style, lush plants, stone pathways, ambient lighting, photorealistic 8k garden photography`;
            if (styleObj.id.includes('indian') || styleObj.category === 'indian') {
                prompt += ', Indian tropical plants, jasmine, marigold borders, tulsi plant, mango tree';
            }
            strength = 0.78;
            break;

        default:
            prompt = styleObj.prompt;
    }

    // Append custom instructions for furniture or any extra request
    if (customInstruction && genType !== 'furniture') {
        prompt += `. Additional request: ${customInstruction}`;
    }

    return { prompt, negative_prompt: negPrompt, strength };
}

// ══════════════════════════════════════════════════════════════════════════════
// REPLICATE API HELPER
// ══════════════════════════════════════════════════════════════════════════════
async function createReplicatePrediction(imageUrl, prompt, negativePrompt, strength, modelType = 'interior') {
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) throw new Error('REPLICATE_API_TOKEN not configured');

    const modelCfg = REPLICATE_MODELS[modelType] || REPLICATE_MODELS.interior;

    const resp = await axios.post(
        'https://api.replicate.com/v1/predictions',
        {
            version: modelCfg.version,
            input:   modelCfg.input(imageUrl, prompt, negativePrompt, strength),
        },
        {
            headers: {
                Authorization:  `Token ${token}`,
                'Content-Type': 'application/json',
            },
            timeout: 15000,
        }
    );
    return resp.data;   // { id, status, urls: { get, cancel }, ... }
}

async function pollReplicatePrediction(predictionId) {
    const token = process.env.REPLICATE_API_TOKEN;
    for (let i = 0; i < POLL_MAX_TRIES; i++) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
        const resp = await axios.get(
            `https://api.replicate.com/v1/predictions/${predictionId}`,
            { headers: { Authorization: `Token ${token}` }, timeout: 10000 }
        );
        const p = resp.data;
        if (p.status === 'succeeded') return p;
        if (p.status === 'failed')    throw new Error(p.error || 'Replicate prediction failed');
    }
    throw new Error('Generation timed out after 60 seconds. Check job status with GET /api/design-gen/job/:id');
}

// ══════════════════════════════════════════════════════════════════════════════
// STABILITY AI HELPER (sync, returns image buffer)
// ══════════════════════════════════════════════════════════════════════════════
async function generateWithStability(imageUrl, prompt, negativePrompt, strength) {
    const apiKey = process.env.STABILITY_API_KEY;
    if (!apiKey) throw new Error('STABILITY_API_KEY not configured');

    // Download the source image
    const imgResp = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 20000 });
    const imgBuffer = Buffer.from(imgResp.data);

    const form = new FormData();
    form.append('image',           imgBuffer, { filename: 'input.webp', contentType: 'image/webp' });
    form.append('prompt',          prompt);
    form.append('negative_prompt', negativePrompt || '');
    form.append('mode',            'image-to-image');
    form.append('strength',        String(strength || 0.75));
    form.append('output_format',   'webp');

    const resp = await axios.post(
        'https://api.stability.ai/v2beta/stable-image/generate/core',
        form,
        {
            headers: {
                Authorization: `Bearer ${apiKey}`,
                Accept:        'image/*',
                ...form.getHeaders(),
            },
            responseType: 'arraybuffer',
            timeout: 60000,
        }
    );
    return Buffer.from(resp.data);
}

// ══════════════════════════════════════════════════════════════════════════════
// CLOUDINARY HELPERS
// ══════════════════════════════════════════════════════════════════════════════
async function uploadBufferToCloudinary(buffer, folder = 'bricks_design_gen') {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder, resource_type: 'image', format: 'webp', quality: 'auto:good' },
            (err, result) => err ? reject(err) : resolve(result)
        );
        stream.end(buffer);
    });
}

async function uploadUrlToCloudinary(imageUrl, folder = 'bricks_design_gen') {
    return cloudinary.uploader.upload(imageUrl, {
        folder,
        resource_type: 'image',
        format: 'webp',
        quality: 'auto:good',
    });
}

function makeThumbnailUrl(cloudinaryUrl) {
    // Insert Cloudinary transformation to create a 400px thumbnail
    return cloudinaryUrl.replace('/upload/', '/upload/w_400,c_fill,q_auto/');
}

// ══════════════════════════════════════════════════════════════════════════════
// CORE GENERATION RUNNER
// ══════════════════════════════════════════════════════════════════════════════
async function runGeneration(record) {
    const startTime = Date.now();
    try {
        const { prompt, negative_prompt, strength } = record._promptData;
        const imageUrl = record.input_image_url;

        let outputUrl;
        const provider = PROVIDER;

        if (provider === 'stability') {
            // Sync: generate → upload → done
            const buffer = await generateWithStability(imageUrl, prompt, negative_prompt, strength);
            const upload = await uploadBufferToCloudinary(buffer);
            outputUrl = upload.secure_url;

        } else if (provider === 'replicate') {
            // Async: create → poll → download → upload
            const modelType = ['exterior', 'walls', 'garden'].includes(record.generation_type) ? 'sdxl' : 'interior';
            const prediction = await createReplicatePrediction(imageUrl, prompt, negative_prompt, strength, modelType);

            // Store job_id in case the poll times out
            await DesignGeneration.findByIdAndUpdate(record._id, { job_id: prediction.id, status: 'processing' });

            const result = await pollReplicatePrediction(prediction.id);
            const rawOutputUrl = Array.isArray(result.output) ? result.output[0] : result.output;

            // Mirror to Cloudinary for permanent storage
            const upload = await uploadUrlToCloudinary(rawOutputUrl);
            outputUrl = upload.secure_url;

        } else {
            // Mock mode — return the input image with a filter note
            outputUrl = imageUrl;
        }

        const thumbnailUrl = makeThumbnailUrl(outputUrl);
        await DesignGeneration.findByIdAndUpdate(record._id, {
            status: 'completed',
            prompt,
            output_images: [{ url: outputUrl, thumbnail_url: thumbnailUrl, variant_label: record.style_name }],
            processing_time_ms: Date.now() - startTime,
        });

    } catch (err) {
        console.error('runGeneration error:', err.message);
        await DesignGeneration.findByIdAndUpdate(record._id, {
            status: 'failed',
            error_message: err.message,
            processing_time_ms: Date.now() - startTime,
        });
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// SHARED GENERATION HANDLER (used by all 5 generation types)
// ══════════════════════════════════════════════════════════════════════════════
async function handleGeneration(req, res, generationType) {
    try {
        const userId = req.user?.id || req.user?._id;
        const {
            image_url, room_type, style_id,
            custom_instruction, color_choice,
            reference_image_url, linked_project_id,
        } = req.body;

        if (!image_url) {
            return res.status(400).json({ error: true, message: 'image_url is required. Upload your photo first via POST /api/design-gen/upload-image' });
        }

        // Daily generation limit
        const usageCount = await checkAndIncrementUsage(userId);
        if (usageCount > DAILY_GEN_LIMIT) {
            return res.status(429).json({
                error:        true,
                rate_limited: true,
                message:      `Free daily limit of ${DAILY_GEN_LIMIT} AI designs reached. Upgrade to Bricks Pro for unlimited generations!`,
                message_hi:   `आज की ${DAILY_GEN_LIMIT} AI designs की सीमा पूरी हुई। अनलिमिटेड के लिए Bricks Pro लें!`,
                message_te:   `రోజువారీ ${DAILY_GEN_LIMIT} AI designs పరిమితి అయిపోయింది!`,
                used:         usageCount,
                limit:        DAILY_GEN_LIMIT,
            });
        }

        const styleObj  = STYLE_CATALOG.find(s => s.id === style_id);
        const styleName = styleObj?.name || style_id || 'Custom';
        const promptData = buildPrompt(generationType, styleObj, room_type, custom_instruction, color_choice);

        // Create a pending record immediately so client gets job_id right away
        const record = await DesignGeneration.create({
            user_id:            userId,
            generation_type:    generationType,
            room_type:          room_type || null,
            style_id:           style_id  || null,
            style_name:         styleName,
            custom_instruction: custom_instruction || null,
            color_choice:       color_choice || null,
            input_image_url:    image_url,
            reference_image_url: reference_image_url || null,
            linked_project_id:  linked_project_id || null,
            status:             'pending',
            provider:           PROVIDER,
            prompt:             promptData.prompt,
        });

        // Attach prompt data as non-persisted field for the async runner
        record._promptData = promptData;

        // Run generation in background — don't await so client gets instant response
        setImmediate(() => runGeneration(record));

        return res.status(202).json({
            error:     false,
            message:   'Generation started! Poll for result.',
            job_id:    record._id,
            status:    'pending',
            poll_url:  `/api/design-gen/job/${record._id}`,
            used:      usageCount,
            limit:     DAILY_GEN_LIMIT,
            remaining: Math.max(0, DAILY_GEN_LIMIT - usageCount),
        });
    } catch (err) {
        console.error(`handleGeneration (${generationType}) error:`, err);
        return res.status(500).json({ error: true, message: err.message });
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// CONTROLLERS
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/design-gen/styles
exports.getStyles = (_req, res) => {
    const indian        = STYLE_CATALOG.filter(s => s.category === 'indian');
    const international = STYLE_CATALOG.filter(s => s.category === 'international');
    const specialty     = STYLE_CATALOG.filter(s => s.category === 'specialty');

    res.json({
        error: false,
        total: STYLE_CATALOG.length,
        data: {
            indian,
            international,
            specialty,
            exterior_style_strip: EXTERIOR_STYLES.map(id => STYLE_CATALOG.find(s => s.id === id)).filter(Boolean).map(s => ({ id: s.id, name: s.name })),
        },
        note: 'Set thumbnail_asset_name in your Flutter app to map style IDs to local image assets.',
    });
};

// GET /api/design-gen/styles/:id
exports.getStyleById = (req, res) => {
    const style = STYLE_CATALOG.find(s => s.id === req.params.id);
    if (!style) return res.status(404).json({ error: true, message: 'Style not found. GET /api/design-gen/styles for full list.' });
    res.json({ error: false, data: style });
};

// GET /api/design-gen/room-types
exports.getRoomTypes = (_req, res) => {
    res.json({ error: false, data: ROOM_TYPES });
};

// POST /api/design-gen/upload-image
// Accepts multipart file upload, stores in Cloudinary, returns URL
exports.uploadImage = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: true, message: 'No image file provided. Send file in form-data field "image"' });

        const result = await cloudinary.uploader.upload(req.file.path, {
            folder:        'bricks_design_inputs',
            resource_type: 'image',
            format:        'webp',
            quality:       'auto:good',
            transformation: [{ width: 1024, crop: 'limit' }],   // cap input size
        });

        return res.json({
            error:      false,
            image_url:  result.secure_url,
            public_id:  result.public_id,
            width:      result.width,
            height:     result.height,
        });
    } catch (err) {
        console.error('uploadImage error:', err);
        return res.status(500).json({ error: true, message: err.message });
    }
};

// POST /api/design-gen/room
// Matches "Remodel & Design Dream Home" and "Generate Home Designs" screens
exports.generateRoom = (req, res) => handleGeneration(req, res, 'room');

// POST /api/design-gen/exterior
// Matches "Redesign Exterior With AI" screen
exports.generateExterior = (req, res) => handleGeneration(req, res, 'exterior');

// POST /api/design-gen/walls
// Matches "Redesign Walls and More" screen with colour picker
exports.generateWalls = (req, res) => handleGeneration(req, res, 'walls');

// POST /api/design-gen/furniture
// Matches "Replace Furniture of Your Room" screen
exports.generateFurniture = (req, res) => handleGeneration(req, res, 'furniture');

// POST /api/design-gen/garden
// Matches "Design Garden with AI" screen
exports.generateGarden = (req, res) => handleGeneration(req, res, 'garden');

// GET /api/design-gen/job/:id  — poll for generation result
exports.getJobStatus = async (req, res) => {
    try {
        const userId = req.user?.id || req.user?._id;
        const record = await DesignGeneration.findOne({
            _id: req.params.id, user_id: userId, is_deleted: false,
        }).select('-prompt').lean();

        if (!record) return res.status(404).json({ error: true, message: 'Job not found' });

        const resp = {
            error:       false,
            job_id:      record._id,
            status:      record.status,
            generation_type: record.generation_type,
            style_name:  record.style_name,
            created_at:  record.createdAt,
        };

        if (record.status === 'completed') {
            resp.output_images       = record.output_images;
            resp.processing_time_ms  = record.processing_time_ms;
        } else if (record.status === 'failed') {
            resp.error_message = record.error_message;
        } else {
            resp.poll_again_in_ms = POLL_INTERVAL_MS;
        }

        return res.json(resp);
    } catch (err) {
        return res.status(500).json({ error: true, message: err.message });
    }
};

// GET /api/design-gen/history
exports.getHistory = async (req, res) => {
    try {
        const userId = req.user?.id || req.user?._id;
        const { generation_type, limit = 20, page = 1 } = req.query;
        const filter = { user_id: userId, is_deleted: false };
        if (generation_type) filter.generation_type = generation_type;

        const [records, total] = await Promise.all([
            DesignGeneration.find(filter)
                .select('generation_type style_name room_type status input_image_url output_images processing_time_ms createdAt')
                .sort({ createdAt: -1 })
                .limit(Number(limit))
                .skip((Number(page) - 1) * Number(limit))
                .lean(),
            DesignGeneration.countDocuments(filter),
        ]);

        return res.json({
            error: false,
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            data: records,
        });
    } catch (err) {
        return res.status(500).json({ error: true, message: err.message });
    }
};

// DELETE /api/design-gen/:id
exports.deleteGeneration = async (req, res) => {
    try {
        const userId = req.user?.id || req.user?._id;
        const record = await DesignGeneration.findOneAndUpdate(
            { _id: req.params.id, user_id: userId, is_deleted: false },
            { $set: { is_deleted: true } },
            { new: true }
        );
        if (!record) return res.status(404).json({ error: true, message: 'Design not found' });
        return res.json({ error: false, message: 'Design deleted' });
    } catch (err) {
        return res.status(500).json({ error: true, message: err.message });
    }
};

// GET /api/design-gen/usage
exports.getUsage = async (req, res) => {
    try {
        const userId = req.user?.id || req.user?._id;
        const key    = todayKey();
        const rec    = await AiUsage.findOne({ user_id: userId, date_key: `gen:${key}` });
        const used   = rec ? rec.count : 0;
        return res.json({
            error:     false,
            used,
            limit:     DAILY_GEN_LIMIT,
            remaining: Math.max(0, DAILY_GEN_LIMIT - used),
            provider:  PROVIDER,
        });
    } catch (err) {
        return res.status(500).json({ error: true, message: err.message });
    }
};
