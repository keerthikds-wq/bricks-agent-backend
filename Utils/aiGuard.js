const axios  = require("axios");
const crypto = require("crypto");
const AiCache = require("../Model/AiCache");
const AiUsage = require("../Model/AiUsage");

/**
 * AI guard — cache + per-user daily cap + provider call, in one place.
 *
 * Bricks_agent_v2 called the paid Emergent/Anthropic endpoint on every single
 * request with no cache and no cap. That is the single biggest cost defect in
 * that codebase. Every AI feature ported from v2 goes through this module
 * instead, reusing the AiCache / AiUsage models the live app already has.
 *
 * Provider: Groq (free tier, rotating keys) — see MERGE_PLAN.md §AI for why,
 * and for which features stay on a paid provider.
 */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// 8B is fine for chat; structured JSON (BOQ, quotation, vastu) needs 70B or it
// produces malformed schemas often enough to break the UI.
const MODEL_FAST      = process.env.GROQ_MODEL_FAST      || "llama-3.1-8b-instant";
const MODEL_STRUCTURED = process.env.GROQ_MODEL_STRUCTURED || "llama-3.3-70b-versatile";

const GROQ_KEYS = [
    process.env.GROQ_API_KEY,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3,
].filter(Boolean);

let _keyIndex = 0;
function nextKey() {
    if (!GROQ_KEYS.length) {
        const e = new Error("AI is not configured on the server (GROQ_API_KEY missing).");
        e.status = 503;
        throw e;
    }
    return GROQ_KEYS[_keyIndex++ % GROQ_KEYS.length];
}

const todayKey = () => new Date().toISOString().slice(0, 10);
const hashKey  = (text) => crypto.createHash("md5").update(String(text).toLowerCase().trim()).digest("hex");

/**
 * Daily quota. Builders on a paid plan get a much higher ceiling than the
 * free tier — the whole point of the subscription.
 */
const LIMITS = { free: 15, trial: 40, starter: 100, pro: 300 };

function limitForPlan(plan) {
    return LIMITS[plan] || LIMITS.free;
}

/**
 * Increment and check the caller's daily usage.
 * @returns {{ allowed: boolean, used: number, limit: number, remaining: number }}
 */
async function consumeQuota(userId, plan = "free") {
    const limit = limitForPlan(plan);
    const expires = new Date();
    expires.setUTCHours(23, 59, 59, 999);

    const usage = await AiUsage.findOneAndUpdate(
        { user_id: String(userId), date_key: todayKey() },
        { $inc: { count: 1 }, $setOnInsert: { expires_at: expires } },
        { upsert: true, new: true }
    );

    return {
        allowed:   usage.count <= limit,
        used:      usage.count,
        limit,
        remaining: Math.max(0, limit - usage.count),
    };
}

/** Give a quota unit back when the call never actually reached the provider. */
async function refundQuota(userId) {
    try {
        await AiUsage.updateOne(
            { user_id: String(userId), date_key: todayKey(), count: { $gt: 0 } },
            { $inc: { count: -1 } }
        );
    } catch (_) { /* non-fatal */ }
}

/** Strip ``` fences and slice to the outermost JSON object. Ported from v2 ai.py. */
function extractJson(raw) {
    const cleaned = String(raw || "").replace(/^```(?:json)?\s*|\s*```$/gm, "").trim();
    const start = cleaned.indexOf("{");
    const end   = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    try {
        return JSON.parse(cleaned.slice(start, end + 1));
    } catch (_) {
        return null;
    }
}

/** Raw provider call. Callers should prefer `run()`. */
async function callGroq({ system, prompt, structured = false, maxTokens = 1400, temperature = 0.3 }) {
    const { data } = await axios.post(
        GROQ_URL,
        {
            model: structured ? MODEL_STRUCTURED : MODEL_FAST,
            messages: [
                ...(system ? [{ role: "system", content: system }] : []),
                { role: "user", content: prompt },
            ],
            max_tokens: maxTokens,
            temperature,
            ...(structured ? { response_format: { type: "json_object" } } : {}),
        },
        {
            headers: { Authorization: `Bearer ${nextKey()}`, "Content-Type": "application/json" },
            timeout: 60000,
        }
    );
    return data?.choices?.[0]?.message?.content || "";
}

/**
 * The main entry point: quota → cache → provider → cache-write.
 *
 * @param {object} o
 * @param {string} o.userId
 * @param {string} o.plan        subscription plan, sizes the daily cap
 * @param {string} o.cacheSeed   what makes this request unique (feature + inputs)
 * @param {string} o.system      system prompt
 * @param {string} o.prompt      user prompt
 * @param {boolean} o.structured true ⇒ 70B + JSON mode + parsed result
 * @param {boolean} o.cache      false for per-project outputs that must be fresh
 *
 * @returns {{ ok, cached, data|text, usage }}
 */
async function run({
    userId,
    plan = "free",
    cacheSeed,
    system,
    prompt,
    structured = false,
    maxTokens = 1400,
    temperature = 0.3,
    cache = true,
}) {
    const quota = await consumeQuota(userId, plan);
    if (!quota.allowed) {
        return {
            ok: false,
            limitReached: true,
            message: `Daily AI limit of ${quota.limit} reached. Upgrade your plan or come back tomorrow.`,
            usage: quota,
        };
    }

    const key = hashKey(cacheSeed || prompt);

    if (cache) {
        const hit = await AiCache.findOneAndUpdate(
            { question_hash: key },
            { $inc: { hit_count: 1 }, $set: { last_hit: new Date() } },
            { new: true }
        );
        if (hit) {
            // A cache hit cost us nothing upstream, so don't spend the user's quota.
            await refundQuota(userId);
            const parsed = structured ? extractJson(hit.answer_text) : null;
            return {
                ok: true,
                cached: true,
                data: parsed,
                text: hit.answer_text,
                usage: { ...quota, used: quota.used - 1, remaining: quota.remaining + 1 },
            };
        }
    }

    let raw;
    try {
        raw = await callGroq({ system, prompt, structured, maxTokens, temperature });
    } catch (err) {
        await refundQuota(userId);
        const e = new Error(
            err.response?.status === 429
                ? "AI is busy right now. Please try again in a moment."
                : "AI request failed. Please try again."
        );
        e.status = err.response?.status === 429 ? 429 : 502;
        throw e;
    }

    const parsed = structured ? extractJson(raw) : null;
    if (structured && !parsed) {
        // Don't cache unparseable structured output — it would poison every
        // future request with the same inputs.
        return { ok: false, parseFailed: true, text: raw, usage: quota };
    }

    if (cache && raw) {
        AiCache.create({ question_hash: key, question_text: String(cacheSeed || prompt).slice(0, 2000), answer_text: raw })
            .catch(() => { /* duplicate key under concurrency — harmless */ });
    }

    return { ok: true, cached: false, data: parsed, text: raw, usage: quota };
}

module.exports = { run, callGroq, consumeQuota, refundQuota, extractJson, limitForPlan, hashKey, LIMITS };
