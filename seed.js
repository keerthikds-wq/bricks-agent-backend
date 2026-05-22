/**
 * Bricks Agent — Database Seed v2
 * ─────────────────────────────────────────────────────────────────────────────
 * Run:  node seed.js   (from C:\Users\keert\bricks_agent_adminpanel_nodejs-main)
 *
 * Steps:
 *   1. Uploads 47 SVGs from ./public/materials/ to Cloudinary (skips if exists)
 *   2. Clears old seeded categories + products
 *   3. Inserts 4 categories + 56 products — NO hardcoded prices
 * ─────────────────────────────────────────────────────────────────────────────
 */

require("dotenv").config();

// Force Google DNS — fixes querySrv ECONNREFUSED on restrictive networks
const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);

const fs       = require("fs");
const path     = require("path");
const mongoose = require("mongoose");
const { v2: cloudinary } = require("cloudinary");

const Category = require("./Model/Category");
const Product  = require("./Model/Product");

cloudinary.config({
  cloud_name: process.env.CLOUDANARY_CLOUD_NAME,
  api_key:    process.env.CLOUDANARY_API_KEY,
  api_secret: process.env.CLOUDANARY_API_SECRET,
});

const SVG_DIR = path.join(__dirname, "public", "materials");
const _cache  = {};   // "category/file" → { public_id, secure_url }

async function uploadSvg(category, filename) {
  const cacheKey = `${category}/${filename}`;
  if (_cache[cacheKey]) return _cache[cacheKey];

  const publicId  = `bricks_agent/materials/${category}_${filename}`;
  const localPath = path.join(SVG_DIR, category, `${filename}.svg`);

  // Check if already uploaded to Cloudinary
  try {
    const existing = await cloudinary.api.resource(publicId, { resource_type: "image" });
    const pngUrl = existing.secure_url.replace("/upload/", "/upload/f_png,w_400,h_400,c_pad,b_white/");
    _cache[cacheKey] = { public_id: existing.public_id, secure_url: pngUrl };
    console.log(`   ⏩ cached  ${filename}`);
    return _cache[cacheKey];
  } catch (_) { /* not found, upload below */ }

  if (!fs.existsSync(localPath)) {
    throw new Error(`SVG not found: ${localPath}\nRun from the backend folder!`);
  }

  const result = await cloudinary.uploader.upload(localPath, {
    public_id: publicId,
    overwrite:     true,
    resource_type: "image",
    format:        "svg",
  });
  // Use f_png transformation so Flutter can render it (no SVG decoder needed)
  const pngUrl = result.secure_url.replace("/upload/", "/upload/f_png,w_400,h_400,c_pad,b_white/");
  _cache[cacheKey] = { public_id: result.public_id, secure_url: pngUrl };
  console.log(`   ☁  uploaded ${filename}`);
  return _cache[cacheKey];
}

// ── Categories ────────────────────────────────────────────────────────────────
const CATEGORIES = [
  { key: "structural",          name: "Structural Materials",  iconSvg: ["structural",          "cement_bag"]     },
  { key: "finishing",           name: "Finishing & Flooring",  iconSvg: ["finishing",            "floor_tile"]     },
  { key: "plumbing_electrical", name: "Plumbing & Electrical", iconSvg: ["plumbing_electrical",  "pvc_pipe"]       },
  { key: "doors_windows_wood",  name: "Doors, Windows & Wood", iconSvg: ["doors_windows_wood",   "wooden_door"]    },
];

// ── Products (56 items — no prices) ──────────────────────────────────────────
const PRODUCTS = [
  // ── STRUCTURAL (18) ───────────────────────────────────────────────────────
  { name:"Cement (OPC 53 Grade)",            cat:"structural",          unit:"Bag (50 kg)",      svg:["structural","cement_bag"],                subtitle:"High-strength Portland cement for RCC, foundations & columns" },
  { name:"Cement (PPC)",                     cat:"structural",          unit:"Bag (50 kg)",      svg:["structural","cement_bag"],                subtitle:"Portland Pozzolana Cement for plastering & masonry" },
  { name:"Red Clay Brick (Class A)",         cat:"structural",          unit:"Piece",            svg:["structural","red_bricks"],               subtitle:"IS 1077 Class A kiln-fired bricks for load-bearing walls" },
  { name:"Fly Ash Brick",                    cat:"structural",          unit:"Piece",            svg:["structural","fly_ash_brick"],            subtitle:"Eco-friendly lightweight brick with superior thermal insulation" },
  { name:"AAC Block (600×200×100 mm)",       cat:"structural",          unit:"Piece",            svg:["structural","aac_block"],                subtitle:"Autoclaved Aerated Concrete — 3× lighter than clay brick" },
  { name:"Concrete Hollow Block",            cat:"structural",          unit:"Piece",            svg:["structural","concrete_block"],           subtitle:"Hollow cavity block for partition & non-load-bearing masonry" },
  { name:"TMT Steel Bar 8mm (Fe-500)",       cat:"structural",          unit:"Kg",               svg:["structural","steel_rods"],               subtitle:"TMT Fe-500D bars for RCC slabs & beams" },
  { name:"TMT Steel Bar 10mm (Fe-500)",      cat:"structural",          unit:"Kg",               svg:["structural","steel_rods"],               subtitle:"High-ductility TMT bar for seismic zone construction" },
  { name:"TMT Steel Bar 12mm (Fe-500)",      cat:"structural",          unit:"Kg",               svg:["structural","steel_rods"],               subtitle:"Standard reinforcement bar for columns, beams and footings" },
  { name:"TMT Steel Bar 16mm (Fe-500)",      cat:"structural",          unit:"Kg",               svg:["structural","steel_rods"],               subtitle:"Heavy-duty TMT bar for retaining walls and large foundations" },
  { name:"River Sand",                       cat:"structural",          unit:"CFT",              svg:["structural","sand_pile"],                subtitle:"Natural Zone-II fine aggregate for plastering & concrete" },
  { name:"M-Sand (Manufactured Sand)",       cat:"structural",          unit:"CFT",              svg:["structural","m_sand"],                   subtitle:"Crusher-processed sand substitute — IS 383 graded" },
  { name:"Aggregate 20mm (Jelly)",           cat:"structural",          unit:"CFT",              svg:["structural","aggregate_stone"],          subtitle:"Crushed granite coarse aggregate for M20+ concrete" },
  { name:"Aggregate 40mm",                   cat:"structural",          unit:"CFT",              svg:["structural","aggregate_stone"],          subtitle:"Coarse jelly aggregate for mass concrete and sub-base" },
  { name:"Ready-Mix Concrete (M20)",         cat:"structural",          unit:"Cum",              svg:["structural","concrete_mix"],             subtitle:"Factory-batched M20 RMC delivered in transit mixer" },
  { name:"Binding Wire (18 SWG)",            cat:"structural",          unit:"Kg",               svg:["structural","binding_wire"],             subtitle:"GI soft-annealed wire for tying TMT rebar" },
  { name:"Waterproofing Compound",           cat:"structural",          unit:"Bucket (20 kg)",   svg:["structural","water_proofing"],           subtitle:"Crystalline waterproofing admixture for tanks & terraces" },
  { name:"Nails & Wood Screws (Assorted)",   cat:"structural",          unit:"Kg",               svg:["structural","nails_screws"],             subtitle:"Assorted GI nails and wood screws for shuttering & carpentry" },

  // ── FINISHING (12) ────────────────────────────────────────────────────────
  { name:"Vitrified Floor Tile (600×600)",   cat:"finishing",           unit:"Sqft",             svg:["finishing","floor_tile"],                subtitle:"Double-charge glossy vitrified tile — Mohs 7 scratch-proof" },
  { name:"Ceramic Floor Tile",               cat:"finishing",           unit:"Sqft",             svg:["finishing","floor_tile"],                subtitle:"Glazed ceramic tile for general flooring and utility areas" },
  { name:"Glazed Wall Tile (300×450)",       cat:"finishing",           unit:"Sqft",             svg:["finishing","wall_tile"],                 subtitle:"High-gloss ceramic tile for kitchens and bathrooms" },
  { name:"Granite Slab (Polished)",          cat:"finishing",           unit:"Sqft",             svg:["finishing","granite_slab"],              subtitle:"Machine-polished Indian granite for flooring & countertops" },
  { name:"Marble Slab (Italian/Indian)",     cat:"finishing",           unit:"Sqft",             svg:["finishing","marble_slab"],               subtitle:"Premium natural marble with mirror polish for luxury interiors" },
  { name:"Interior Emulsion Paint",          cat:"finishing",           unit:"Bucket (20 L)",    svg:["finishing","paint_bucket"],              subtitle:"Washable low-VOC emulsion with stain-repellent finish" },
  { name:"Exterior Weatherproof Paint",      cat:"finishing",           unit:"Bucket (20 L)",    svg:["finishing","waterproof_paint"],          subtitle:"UV-resistant 10-year exterior paint with crack-bridging" },
  { name:"Wall Primer (Undercoat)",          cat:"finishing",           unit:"Bucket (10 L)",    svg:["finishing","primer"],                    subtitle:"Alkali-resistant primer for new plaster before emulsion" },
  { name:"Wall Putty (White Cement Based)",  cat:"finishing",           unit:"Bag (20 kg)",      svg:["finishing","putty"],                     subtitle:"White cement putty for smooth base coat before painting" },
  { name:"Plaster of Paris (POP)",           cat:"finishing",           unit:"Bag (25 kg)",      svg:["finishing","plaster_of_paris"],          subtitle:"Fast-setting gypsum plaster for false ceiling & wall finishing" },
  { name:"Tile Grout",                       cat:"finishing",           unit:"Pack (5 kg)",      svg:["finishing","grout"],                     subtitle:"Polymer-modified grout — mould & stain resistant" },
  { name:"Tile Adhesive",                    cat:"finishing",           unit:"Bag (20 kg)",      svg:["finishing","tile_adhesive"],             subtitle:"High-bond cementitious adhesive for wall & floor tiles" },
  { name:"Gypsum Board (False Ceiling)",     cat:"finishing",           unit:"Sheet (8×4 ft)",   svg:["finishing","gypsum_board"],              subtitle:"Lightweight panels for false ceiling and drywall partitions" },

  // ── PLUMBING & ELECTRICAL (14) ────────────────────────────────────────────
  { name:"PVC Pipe 4-inch (Drainage)",       cat:"plumbing_electrical", unit:"Metre",            svg:["plumbing_electrical","pvc_pipe"],        subtitle:"IS 4985 PVC pipe for underground & internal drainage" },
  { name:"PVC Pipe 2-inch",                  cat:"plumbing_electrical", unit:"Metre",            svg:["plumbing_electrical","pvc_pipe"],        subtitle:"PVC soil and waste pipe for bathroom drainage" },
  { name:"CPVC Pipe (Hot Water)",            cat:"plumbing_electrical", unit:"Metre",            svg:["plumbing_electrical","cpvc_pipe"],       subtitle:"ASTM D2846 CPVC pipe for hot & cold potable water" },
  { name:"GI Pipe (Galvanized Iron)",        cat:"plumbing_electrical", unit:"Metre",            svg:["plumbing_electrical","gi_pipe"],         subtitle:"Hot-dip galvanised pipe for water supply and gas lines" },
  { name:"Pipe Fittings (Elbow, T, Coupler)",cat:"plumbing_electrical", unit:"Set",              svg:["plumbing_electrical","pipe_fittings"],   subtitle:"Assorted PVC/CPVC fittings — elbows, tees, reducers" },
  { name:"Tap / Faucet (Chrome)",            cat:"plumbing_electrical", unit:"Piece",            svg:["plumbing_electrical","tap_faucet"],      subtitle:"Single-lever chrome pillar cock for kitchen and bathroom" },
  { name:"Water Storage Tank (1000 L)",      cat:"plumbing_electrical", unit:"Piece",            svg:["plumbing_electrical","water_tank"],      subtitle:"UV-stabilised triple-layer HDPE overhead water tank" },
  { name:"Electrical Wire 2.5 sqmm",        cat:"plumbing_electrical", unit:"Coil (90 m)",      svg:["plumbing_electrical","electrical_wire"], subtitle:"FR PVC insulated copper wire for light & power circuits" },
  { name:"Electrical Wire 1.5 sqmm",        cat:"plumbing_electrical", unit:"Coil (90 m)",      svg:["plumbing_electrical","electrical_wire"], subtitle:"IS 694 FR copper wire for lighting and fan circuits" },
  { name:"Electrical Wire 4 sqmm",          cat:"plumbing_electrical", unit:"Coil (90 m)",      svg:["plumbing_electrical","electrical_wire"], subtitle:"Heavy-duty copper wire for AC and high-load appliances" },
  { name:"Modular Switch + 3-Pin Socket",   cat:"plumbing_electrical", unit:"Set",              svg:["plumbing_electrical","switch_socket"],   subtitle:"Modular 6A/16A switch & socket set for internal wiring" },
  { name:"MCB Circuit Breaker (32A)",        cat:"plumbing_electrical", unit:"Piece",            svg:["plumbing_electrical","mcb"],             subtitle:"32A single-pole MCB for short circuit & overload protection" },
  { name:"Distribution Box (8-way)",         cat:"plumbing_electrical", unit:"Piece",            svg:["plumbing_electrical","db_box"],          subtitle:"IP43 MCB distribution board for residential wiring" },
  { name:"Electrical Conduit Pipe (PVC)",    cat:"plumbing_electrical", unit:"Metre",            svg:["plumbing_electrical","conduit_pipe"],    subtitle:"Rigid PVC conduit for protecting wire runs in walls" },

  // ── DOORS, WINDOWS & WOOD (11) ────────────────────────────────────────────
  { name:"Flush Wooden Door",                cat:"doors_windows_wood",  unit:"Piece",            svg:["doors_windows_wood","wooden_door"],      subtitle:"Solid core flush door with hardwood lipping for interior rooms" },
  { name:"Main Teak Wood Door",              cat:"doors_windows_wood",  unit:"Piece",            svg:["doors_windows_wood","main_door"],        subtitle:"Hand-carved teak main entrance door with brass hardware" },
  { name:"Steel Safety Door",               cat:"doors_windows_wood",  unit:"Piece",            svg:["doors_windows_wood","steel_door"],       subtitle:"Heavy-gauge galvanised steel security door" },
  { name:"Aluminum Sliding Window",          cat:"doors_windows_wood",  unit:"Sqft",             svg:["doors_windows_wood","window_frame"],     subtitle:"Extruded aluminium sliding window with mosquito mesh" },
  { name:"uPVC Window (Sliding/Casement)",   cat:"doors_windows_wood",  unit:"Sqft",             svg:["doors_windows_wood","upvc_window"],      subtitle:"Multi-chamber uPVC window with toughened glass" },
  { name:"Plywood (Commercial Grade)",       cat:"doors_windows_wood",  unit:"Sqft",             svg:["doors_windows_wood","plywood"],          subtitle:"IS 303 BWR plywood — termite and moisture resistant" },
  { name:"MDF Board",                        cat:"doors_windows_wood",  unit:"Sqft",             svg:["doors_windows_wood","mdf_board"],        subtitle:"Medium Density Fibreboard for furniture and wall panels" },
  { name:"Wooden Planks (Sal/Teak)",         cat:"doors_windows_wood",  unit:"Cft",              svg:["doors_windows_wood","wooden_planks"],    subtitle:"Seasoned hardwood planks for door frames and beams" },
  { name:"Laminate Sheet (Decorative)",      cat:"doors_windows_wood",  unit:"Sheet (8×4 ft)",   svg:["doors_windows_wood","laminate_sheet"],   subtitle:"High-pressure laminate for kitchen shutters & furniture" },
  { name:"Door Handle + Mortise Lock",       cat:"doors_windows_wood",  unit:"Set",              svg:["doors_windows_wood","door_handle"],      subtitle:"SS lever handle with 3-lever mortise deadbolt lock" },
  { name:"Door Hinges (Stainless Steel)",    cat:"doors_windows_wood",  unit:"Pair",             svg:["doors_windows_wood","hinges"],           subtitle:"Heavy-duty SS 304 butt hinges for solid wood doors" },
];

// ── Main ──────────────────────────────────────────────────────────────────────
async function seed() {
  try {
    console.log("\n🔌 Connecting to MongoDB…");
    await mongoose.connect(process.env.URL);
    console.log("✅ Connected\n");

    // Upload unique SVGs
    const unique = [...new Set(PRODUCTS.map(p => p.svg.join("/")))];
    console.log(`📸 Uploading ${unique.length} unique SVGs to Cloudinary…`);
    for (const key of unique) {
      const [cat, file] = key.split("/");
      await uploadSvg(cat, file);
    }

    // Seed categories
    console.log("\n📦 Seeding categories…");
    await Category.deleteMany({ cloudinaryid: { $regex: /^seed_cat_/ } });
    const catMap = {};
    for (const c of CATEGORIES) {
      const iconImg = _cache[c.iconSvg.join("/")] || await uploadSvg(...c.iconSvg);
      const [doc] = await Category.insertMany([{
        name:         c.name,
        image:        iconImg.secure_url,
        cloudinaryid: `seed_cat_${c.key}`,
        is_delete:    0,
      }]);
      catMap[c.key] = doc._id;
      console.log(`   ✔ ${c.name}`);
    }

    // Clear old products
    console.log("\n🧱 Clearing old products…");
    await Product.deleteMany({ name: { $in: PRODUCTS.map(p => p.name) } });
    await Product.deleteMany({ "image.secure_url": { $regex: /unsplash|lorem\.picsum|placeholder/ } });

    // Insert new products
    console.log("🧱 Inserting 56 products…");
    const docs = PRODUCTS.map(p => {
      const img = _cache[p.svg.join("/")];
      return {
        name:         p.name,
        subtitle:     p.subtitle,
        size:         p.unit,
        description:  `${p.name} — sold per ${p.unit}. Contact seller for pricing.`,
        min_quantity: 1,
        min_price:    0,
        max_price:    0,
        category:     catMap[p.cat],
        image:        [{ public_id: img.public_id, secure_url: img.secure_url }],
        is_delete:    0,
      };
    });
    const inserted = await Product.insertMany(docs);
    inserted.forEach(p => console.log(`   ✔ ${p.name}`));

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`✅ DONE!  Categories: 4   Products: ${inserted.length}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("\n❌ Seed failed:", err.message);
    try { await mongoose.disconnect(); } catch (_) {}
    process.exit(1);
  }
}

seed();
