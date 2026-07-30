/**
 * Renders a Wavefront OBJ to a transparent PNG.
 *
 * The 3D models exported for the tool cards cannot go into the app as-is:
 * Flutter has no built-in OBJ renderer, and pulling a 3D engine in to draw a
 * static illustration on a card would cost far more than the picture is worth.
 * So they are rasterised once, here, and the app ships flat PNGs.
 *
 * No dependencies. Node's zlib is enough to write a valid PNG, and the
 * rasteriser is a few hundred lines — a smaller surface than any 3D package,
 * and it runs at build time rather than on a builder's phone.
 *
 *   node scripts/render-obj.js <model.obj> <out.png> [--size 900] [--yaw -28] [--pitch 24]
 *
 * Design decisions worth knowing:
 *
 *   · Orthographic, not perspective. The mockup's art has no vanishing point,
 *     and an orthographic camera is what makes a set of separately modelled
 *     objects look like one family.
 *   · Lambert shading with a fixed key light from the upper-left plus a soft
 *     fill, matching the direction used by the hand-drawn pieces so generated
 *     and authored art can sit side by side.
 *   · 3x supersampling. Hard edges on a 3D render are the giveaway that
 *     something was machine-made; downsampling gives clean anti-aliased edges
 *     and correct alpha at the silhouette.
 *   · A soft contact shadow is composited underneath so the object sits on the
 *     card instead of floating.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* ─────────────────────────────── Parsing ──────────────────────────────── */

function parseMtl(file) {
    const materials = {};
    if (!fs.existsSync(file)) return materials;
    let current = null;
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        const t = line.trim().split(/\s+/);
        if (t[0] === 'newmtl') {
            current = t[1];
            materials[current] = { r: 0.8, g: 0.8, b: 0.8 };
        } else if (t[0] === 'Kd' && current) {
            materials[current] = {
                r: parseFloat(t[1]), g: parseFloat(t[2]), b: parseFloat(t[3]),
            };
        }
    }
    return materials;
}

function parseObj(file) {
    const verts = [];
    const norms = [];
    const faces = [];
    let material = 'default';

    const data = fs.readFileSync(file, 'utf8');
    for (const line of data.split('\n')) {
        if (line.charCodeAt(0) === 118) { // 'v'
            const t = line.split(/\s+/);
            if (t[0] === 'v') {
                verts.push([+t[1], +t[2], +t[3]]);
            } else if (t[0] === 'vn') {
                norms.push([+t[1], +t[2], +t[3]]);
            }
        } else if (line.charCodeAt(0) === 102) { // 'f'
            const t = line.trim().split(/\s+/);
            const idx = [];
            for (let i = 1; i < t.length; i++) {
                const p = t[i].split('/');
                idx.push([parseInt(p[0], 10) - 1,
                          p[2] ? parseInt(p[2], 10) - 1 : -1]);
            }
            // Fan-triangulate anything with more than three corners.
            for (let i = 1; i + 1 < idx.length; i++) {
                faces.push({ a: idx[0], b: idx[i], c: idx[i + 1], material });
            }
        } else if (line.startsWith('usemtl')) {
            material = line.trim().split(/\s+/)[1];
        }
    }
    return { verts, norms, faces };
}

/* ─────────────────────────────── Maths ────────────────────────────────── */

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function norm(v) {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
}

function rotY(v, a) {
    const c = Math.cos(a), s = Math.sin(a);
    return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
}
function rotX(v, a) {
    const c = Math.cos(a), s = Math.sin(a);
    return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c];
}

/* ────────────────────────────── Rendering ─────────────────────────────── */

function render(objFile, opts) {
    const { size, yaw, pitch, ss } = opts;
    const W = size * ss;
    const H = size * ss;

    const mtl = parseMtl(objFile.replace(/\.obj$/i, '.mtl'));
    const { verts, norms, faces } = parseObj(objFile);
    if (!faces.length) throw new Error('no faces in the model');

    // Camera transform, applied once per vertex.
    const yawR = (yaw * Math.PI) / 180;
    const pitchR = (pitch * Math.PI) / 180;
    const cam = verts.map((v) => rotX(rotY(v, yawR), pitchR));
    const camN = norms.map((n) => rotX(rotY(n, yawR), pitchR));

    // Fit the model to the frame with a margin.
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const v of cam) {
        if (v[0] < minX) minX = v[0];
        if (v[0] > maxX) maxX = v[0];
        if (v[1] < minY) minY = v[1];
        if (v[1] > maxY) maxY = v[1];
    }
    const margin = 0.90;
    const scale = Math.min(W / (maxX - minX), H / (maxY - minY)) * margin;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    const px = (v) => [
        W / 2 + (v[0] - cx) * scale,
        H / 2 - (v[1] - cy) * scale,   // screen Y is down
        v[2],
    ];

    const colour = new Float32Array(W * H * 3);
    const alpha = new Float32Array(W * H);
    const depth = new Float32Array(W * H).fill(-Infinity);

    // Key light upper-left-front, matching the authored SVG pieces.
    const key = norm([-0.45, 0.78, 0.62]);
    const fill = norm([0.55, 0.25, 0.5]);

    for (const f of faces) {
        const p0 = px(cam[f.a[0]]);
        const p1 = px(cam[f.b[0]]);
        const p2 = px(cam[f.c[0]]);

        // Face normal from the geometry — reliable even when vn is missing.
        const gn = norm(cross(sub(cam[f.b[0]], cam[f.a[0]]),
                              sub(cam[f.c[0]], cam[f.a[0]])));
        // Back-face cull.
        if (gn[2] <= 0) continue;

        const n = f.a[1] >= 0 && camN[f.a[1]] ? norm(camN[f.a[1]]) : gn;

        const m = mtl[f.material] || { r: 0.75, g: 0.75, b: 0.78 };
        const lam = Math.max(0, dot(n, key));
        const fillL = Math.max(0, dot(n, fill)) * 0.28;
        const ambient = 0.42;
        // Slight rim on faces turning away from the camera, which is what stops
        // a flat-shaded render looking like cardboard.
        const rim = Math.pow(1 - Math.max(0, n[2]), 3) * 0.12;
        const L = Math.min(1.25, ambient + lam * 0.72 + fillL + rim);

        const r = Math.min(1, m.r * L + rim * 0.5);
        const g = Math.min(1, m.g * L + rim * 0.5);
        const b = Math.min(1, m.b * L + rim * 0.5);

        // Bounding box of the triangle.
        const bx0 = Math.max(0, Math.floor(Math.min(p0[0], p1[0], p2[0])));
        const bx1 = Math.min(W - 1, Math.ceil(Math.max(p0[0], p1[0], p2[0])));
        const by0 = Math.max(0, Math.floor(Math.min(p0[1], p1[1], p2[1])));
        const by1 = Math.min(H - 1, Math.ceil(Math.max(p0[1], p1[1], p2[1])));
        if (bx1 < bx0 || by1 < by0) continue;

        const area = (p1[0] - p0[0]) * (p2[1] - p0[1])
                   - (p2[0] - p0[0]) * (p1[1] - p0[1]);
        if (Math.abs(area) < 1e-9) continue;

        for (let y = by0; y <= by1; y++) {
            for (let x = bx0; x <= bx1; x++) {
                const sx = x + 0.5, sy = y + 0.5;
                const w0 = ((p1[0] - p0[0]) * (sy - p0[1])
                          - (sx - p0[0]) * (p1[1] - p0[1])) / area;
                const w1 = ((sx - p0[0]) * (p2[1] - p0[1])
                          - (p2[0] - p0[0]) * (sy - p0[1])) / area;
                const w2 = 1 - w0 - w1;
                if (w0 < 0 || w1 < 0 || w2 < 0) continue;

                const z = p0[2] * w2 + p1[2] * w1 + p2[2] * w0;
                const i = y * W + x;
                if (z <= depth[i]) continue;
                depth[i] = z;
                colour[i * 3] = r;
                colour[i * 3 + 1] = g;
                colour[i * 3 + 2] = b;
                alpha[i] = 1;
            }
        }
    }

    return { W, H, colour, alpha, ss, size };
}

/* ──────────────────── Downsample, shadow, PNG encode ──────────────────── */

function finish({ W, H, colour, alpha, ss, size }) {
    const out = Buffer.alloc(size * size * 4);

    // Contact shadow: a soft ellipse under the model's silhouette, composited
    // below everything. Without it the object floats off the card.
    let minX = W, maxX = 0, maxY = 0;
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            if (alpha[y * W + x] > 0) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
            }
        }
    }
    const shCx = (minX + maxX) / 2;
    const shCy = Math.min(H - 1, maxY - (maxY - 0) * 0.02);
    const shRx = Math.max(1, (maxX - minX) * 0.58);
    const shRy = Math.max(1, shRx * 0.16);

    for (let oy = 0; oy < size; oy++) {
        for (let ox = 0; ox < size; ox++) {
            let r = 0, g = 0, b = 0, a = 0;
            for (let sy = 0; sy < ss; sy++) {
                for (let sx = 0; sx < ss; sx++) {
                    const x = ox * ss + sx;
                    const y = oy * ss + sy;
                    const i = y * W + x;

                    let sr = 0, sg = 0, sb = 0, sa = 0;
                    // shadow first
                    const dx = (x - shCx) / shRx;
                    const dy = (y - shCy) / shRy;
                    const d = dx * dx + dy * dy;
                    if (d < 1) {
                        sa = (1 - Math.sqrt(d)) * 0.30;
                        sr = 0.20; sg = 0.16; sb = 0.13;
                    }
                    // model over shadow
                    if (alpha[i] > 0) {
                        sr = colour[i * 3];
                        sg = colour[i * 3 + 1];
                        sb = colour[i * 3 + 2];
                        sa = 1;
                    }
                    r += sr * sa; g += sg * sa; b += sb * sa; a += sa;
                }
            }
            const n = ss * ss;
            const A = a / n;
            const o = (oy * size + ox) * 4;
            // Un-premultiply so the PNG carries straight alpha.
            out[o] = Math.round(A > 0 ? Math.min(1, r / a) * 255 : 0);
            out[o + 1] = Math.round(A > 0 ? Math.min(1, g / a) * 255 : 0);
            out[o + 2] = Math.round(A > 0 ? Math.min(1, b / a) * 255 : 0);
            out[o + 3] = Math.round(A * 255);
        }
    }
    return out;
}

function writePng(file, rgba, size) {
    const raw = Buffer.alloc((size * 4 + 1) * size);
    for (let y = 0; y < size; y++) {
        raw[y * (size * 4 + 1)] = 0; // filter type 0
        rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
    }

    const chunk = (type, data) => {
        const len = Buffer.alloc(4);
        len.writeUInt32BE(data.length);
        const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
        const crc = Buffer.alloc(4);
        crc.writeUInt32BE(crc32(td) >>> 0);
        return Buffer.concat([len, td, crc]);
    };

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);
    ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8;   // bit depth
    ihdr[9] = 6;   // RGBA
    ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

    fs.writeFileSync(file, Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ]));
}

let _crcTable = null;
function crc32(buf) {
    if (!_crcTable) {
        _crcTable = [];
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            _crcTable[n] = c;
        }
    }
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = _crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return c ^ 0xffffffff;
}

/* ──────────────────────────────── CLI ─────────────────────────────────── */

const args = process.argv.slice(2);
const objFile = args[0];
const outFile = args[1];
if (!objFile || !outFile) {
    console.error('usage: node scripts/render-obj.js <model.obj> <out.png> [--size N] [--yaw D] [--pitch D]');
    process.exit(1);
}
const flag = (name, dflt) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? parseFloat(args[i + 1]) : dflt;
};

const opts = {
    size: flag('size', 900),
    yaw: flag('yaw', -28),
    pitch: flag('pitch', 24),
    ss: flag('ss', 3),
};

console.log(`\nRendering ${path.basename(objFile)}`);
console.log(`  size ${opts.size}px, yaw ${opts.yaw}°, pitch ${opts.pitch}°, ${opts.ss}x supersample`);

const t0 = Date.now();
const buf = render(objFile, opts);
const rgba = finish(buf);
fs.mkdirSync(path.dirname(outFile), { recursive: true });

/**
 * Crop to the visible pixels.
 *
 * The renderer fits the model inside a square frame, so a portrait object like
 * the clipboard leaves wide transparent bands down both sides. Dropped into a
 * card slot with BoxFit.contain, those bands are what the layout scales — the
 * art ends up small and floating, with no way to line it up against the card
 * edge. Trimming to the alpha bounds means the PNG *is* the artwork, the slot
 * gets its true aspect ratio, and positioning it is exact rather than guesswork.
 */
function trim(rgba, size) {
    let minX = size, minY = size, maxX = -1, maxY = -1;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (rgba[(y * size + x) * 4 + 3] > 2) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }
    if (maxX < 0) return { data: rgba, w: size, h: size };

    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    const out = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
        rgba.copy(out, y * w * 4,
            ((y + minY) * size + minX) * 4,
            ((y + minY) * size + minX + w) * 4);
    }
    return { data: out, w, h };
}

function writePngWH(file, rgba, w, h) {
    const raw = Buffer.alloc((w * 4 + 1) * h);
    for (let y = 0; y < h; y++) {
        raw[y * (w * 4 + 1)] = 0;
        rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
    }
    const chunk = (type, data) => {
        const len = Buffer.alloc(4);
        len.writeUInt32BE(data.length);
        const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
        const crc = Buffer.alloc(4);
        crc.writeUInt32BE(crc32(td) >>> 0);
        return Buffer.concat([len, td, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8; ihdr[9] = 6;
    fs.writeFileSync(file, Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ]));
}

const t = trim(rgba, opts.size);
writePngWH(outFile, t.data, t.w, t.h);

const kb = Math.round(fs.statSync(outFile).size / 1024);
console.log(`  trimmed to ${t.w}x${t.h} (aspect ${(t.w / t.h).toFixed(3)})`);
console.log(`  wrote ${outFile} (${kb} KB) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`\n  Use aspect ${(t.w / t.h).toFixed(3)} for the card slot so nothing is letterboxed.\n`);
