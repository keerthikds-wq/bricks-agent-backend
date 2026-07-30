/**
 * Generates the SitePilot tool-card illustrations as PNGs.
 *
 * The mockup uses rendered 3D artwork. None exists in the project, and none can
 * be drawn from Dart, so this asks an image model for it and writes the results
 * straight into the Flutter app's assets folder.
 *
 * Needs GEMINI_API_KEY in .env. Get one free at https://aistudio.google.com/apikey
 *
 *   node scripts/generate-tool-art.js            # generate all five
 *   node scripts/generate-tool-art.js boq        # regenerate one
 *   node scripts/generate-tool-art.js --list     # show the prompts, call nothing
 *
 * Written to be re-run: each piece is independent, so a single illustration that
 * comes back wrong can be regenerated without touching the other four. Image
 * models do not repeat themselves exactly, and one bad result should not cost
 * you the set.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');

const APP_ASSETS = path.resolve(
    __dirname, '..', '..', 'bricks_agent', 'assets', 'tools');

const MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
const KEY = process.env.GEMINI_API_KEY;

/**
 * A shared style contract, prepended to every prompt.
 *
 * Stated once and identically for all five so the set holds together. The parts
 * that matter most are the transparent background — the cards are tinted, and a
 * baked-in white box behind each render would be visible on every one of them —
 * and the fixed camera and light, without which five separately generated
 * objects look like five unrelated pieces of stock art.
 */
const STYLE = [
    '3D rendered illustration, isometric view from above at 30 degrees,',
    'soft studio lighting from the top-left with gentle contact shadows,',
    'clean modern corporate style, smooth matte surfaces, subtle bevels,',
    'muted realistic material colours, no text, no letters, no numbers,',
    'no logos, no watermark, centred single subject with generous margin,',
    'FULLY TRANSPARENT BACKGROUND, PNG with alpha, nothing behind the subject,',
    'high detail, crisp edges, product-render quality,',
].join(' ');

const PIECES = [
    {
        id: 'boq',
        file: 'boq_materials.png',
        subject:
            'A small neat stack of construction materials: two beige paper cement sacks '
            + 'lying flat on top of each other, a short stack of red clay bricks beside them, '
            + 'and four thin steel reinforcement bars standing upright behind, '
            + 'grouped as one tidy arrangement',
    },
    {
        id: 'prices',
        file: 'price_steel.png',
        subject:
            'A neat bundle of grey steel reinforcement rods standing upright in a tied group, '
            + 'with one small beige sack of sand leaning at the base',
    },
    {
        id: 'rfq',
        file: 'rfq_clipboard.png',
        subject:
            'A dark blue clipboard holding a white sheet of paper with a simple checklist of '
            + 'ticked boxes and blank ruled lines, standing upright, '
            + 'with a small potted green plant beside it',
    },
    {
        id: 'tracking',
        file: 'tracking_crane.png',
        subject:
            'A yellow tower crane beside a partly built multi-storey concrete building frame '
            + 'with exposed floor slabs and columns, construction in progress',
    },
    {
        id: 'design',
        file: 'design_room.png',
        subject:
            'A cutaway isometric living room with two walls, a cream sofa with cushions, '
            + 'a rug, a window and a potted plant, sitting on top of an open blue architectural '
            + 'floor plan drawing',
    },
];

function prompt(piece) {
    return `${STYLE} ${piece.subject}.`;
}

/* ────────────────────────────────────────────────────────────────────────── */

function callModel(text) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            contents: [{ parts: [{ text }] }],
            generationConfig: { responseModalities: ['IMAGE'] },
        });

        const req = https.request(
            {
                hostname: 'generativelanguage.googleapis.com',
                path: `/v1beta/models/${MODEL}:generateContent?key=${KEY}`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body),
                },
                timeout: 180000,
            },
            (res) => {
                let raw = '';
                res.on('data', (d) => (raw += d));
                res.on('end', () => {
                    let j = null;
                    try { j = JSON.parse(raw); } catch (_) {}
                    if (res.statusCode !== 200) {
                        return reject(new Error(
                            `HTTP ${res.statusCode} — ${j?.error?.message || raw.slice(0, 300)}`));
                    }
                    const parts = j?.candidates?.[0]?.content?.parts || [];
                    const img = parts.find((p) => p.inlineData?.data);
                    if (!img) {
                        const textBack = parts.map((p) => p.text).filter(Boolean).join(' ');
                        return reject(new Error(
                            `no image returned${textBack ? ` — model said: ${textBack.slice(0, 200)}` : ''}`));
                    }
                    resolve(Buffer.from(img.inlineData.data, 'base64'));
                });
            }
        );
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        req.write(body);
        req.end();
    });
}

(async () => {
    const args = process.argv.slice(2);

    if (args.includes('--list')) {
        console.log('\nPrompts (nothing is called):\n');
        for (const p of PIECES) {
            console.log(`── ${p.id} → ${p.file}`);
            console.log(`   ${prompt(p)}\n`);
        }
        return;
    }

    if (!KEY) {
        console.error('\nGEMINI_API_KEY is not set.\n');
        console.error('  1. Get a free key at https://aistudio.google.com/apikey');
        console.error('  2. Add this line to bricks_agent_adminpanel_nodejs-main/.env :');
        console.error('       GEMINI_API_KEY=your_key_here');
        console.error('  3. Run this again.\n');
        console.error('The .env file is gitignored, so the key is not committed.\n');
        process.exit(1);
    }

    const wanted = args.filter((a) => !a.startsWith('--'));
    const todo = wanted.length
        ? PIECES.filter((p) => wanted.includes(p.id))
        : PIECES;

    if (!todo.length) {
        console.error(`Unknown piece. Known ids: ${PIECES.map((p) => p.id).join(', ')}`);
        process.exit(1);
    }

    fs.mkdirSync(APP_ASSETS, { recursive: true });
    console.log(`\nModel: ${MODEL}`);
    console.log(`Writing to: ${APP_ASSETS}\n`);

    let ok = 0;
    for (const piece of todo) {
        process.stdout.write(`  ${piece.id.padEnd(9)} `);
        try {
            const png = await callModel(prompt(piece));
            const dest = path.join(APP_ASSETS, piece.file);
            fs.writeFileSync(dest, png);
            console.log(`OK  ${piece.file} (${Math.round(png.length / 1024)} KB)`);
            ok++;
        } catch (err) {
            console.log(`FAILED — ${err.message}`);
        }
    }

    console.log(`\n  ${ok}/${todo.length} generated.`);
    if (ok) {
        console.log('\n  Next: declare assets/tools/ in the app pubspec, then the cards');
        console.log('  swap from painted art to Image.asset. Re-run a single piece with');
        console.log(`  e.g. "node scripts/generate-tool-art.js ${todo[0].id}" if one looks wrong.\n`);
    }
})().catch((e) => { console.error('\nFailed:', e.message); process.exit(1); });
