/**
 * AI Construction Assistant Controller
 *
 * Cost strategy (near-zero for 2000 users):
 *  1. Rate limit  — 15 AI queries / user / day
 *  2. Exact cache — MongoDB stores Q&A pairs; same question = free answer
 *  3. Groq API    — free tier (llama-3.1-8b-instant, 14,400 req/day)
 *  4. Short prompts — system prompt <400 tokens, max 250 tokens output
 */

const crypto  = require('crypto');
const axios   = require('axios');
const AiCache = require('../Model/AiCache');
const AiUsage = require('../Model/AiUsage');

// ── Config ────────────────────────────────────────────────────────────────────
const DAILY_LIMIT   = 15;   // free queries per user per day
const GROQ_API_URL  = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL    = 'llama-3.1-8b-instant';   // fastest free model
const MAX_TOKENS    = 280;                        // keep responses short = cheap

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
async function callGroq(messages) {
    const resp = await axios.post(
        GROQ_API_URL,
        {
            model:      GROQ_MODEL,
            messages,
            max_tokens: MAX_TOKENS,
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

        // ── 3. Build message array for Groq ───────────────────────────────────
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

        // ── 4. Call Groq ──────────────────────────────────────────────────────
        let answer;
        try {
            answer = await callGroq(messages);
        } catch (groqErr) {
            console.error('Groq API error:', groqErr?.response?.data || groqErr.message);
            // Fallback message in multiple languages
            return res.status(503).json({
                error:   true,
                message: 'AI service temporarily unavailable. Please try again in a moment.',
            });
        }

        // ── 5. Cache the new answer ───────────────────────────────────────────
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
