/**
 * Bricks Agent — Database Seed Script v2
 * Populates: Categories + Products using construction SVG assets
 *
 * SVG images are served as static files from the backend:
 *   GET /public/materials/{category}/{filename}.svg
 *
 * No Cloudinary upload required during seed.
 * Prices are NOT seeded — sellers set their own prices dynamically.
 *
 * Usage:  node seed.js
 * Needs:  .env  →  URL=<MongoDB URI>  and  BASE_URL=<your Render URL>
 *         If BASE_URL is not set, defaults to https://bricksagent.onrender.com
 */

require("dotenv").config();

const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);

const mongoose = require("mongoose");
const Category = require("./Model/Category");
const Product  = require("./Model/Product");

// Base URL of the deployed backend (static files are served at /public/...)
const BASE = (process.env.BASE_URL || "https://bricksagent.onrender.com").replace(/\/$/, "");
const img  = (category, file) => `${BASE}/public/materials/${category}/${file}.svg`;

// ─── Categories ───────────────────────────────────────────────────────────────
const CATEGORIES = [
  { key: "structural",          name: "Structural Materials",   image: img("structural",          "cement_bag")    },
  { key: "finishing",           name: "Finishing & Flooring",   image: img("finishing",           "floor_tile")    },
  { key: "plumbing_electrical", name: "Plumbing & Electrical",  image: img("plumbing_electrical", "pvc_pipe")      },
  { key: "doors_windows_wood",  name: "Doors, Windows & Wood",  image: img("doors_windows_wood",  "wooden_door")   },
];

// ─── Products (56 items — NO prices, prices are set by sellers) ───────────────
// svgFile: relative path inside public/materials/  (no .svg extension)
const PRODUCTS = [
  // ── STRUCTURAL ─────────────────────────────────────────────────────────────
  { name: "Cement (OPC 53 Grade)",          cat: "structural",          unit: "Bag (50 kg)",      svg: "structural/cement_bag",                  subtitle: "High-strength Portland cement for RCC, foundations & columns"             },
  { name: "Cement (PPC)",                   cat: "structural",          unit: "Bag (50 kg)",      svg: "structural/cement_bag",                  subtitle: "Portland Pozzolana Cement for plastering, masonry & general work"         },
  { name: "Red Clay Brick (Class A)",       cat: "structural",          unit: "Piece",            svg: "structural/red_bricks",                  subtitle: "Traditional kiln-fired IS 1077 Class A bricks for load-bearing walls"    },
  { name: "Fly Ash Brick",                  cat: "structural",          unit: "Piece",            svg: "structural/fly_ash_brick",               subtitle: "Eco-friendly lightweight bricks with superior thermal insulation"         },
  { name: "AAC Block (600×200×100 mm)",     cat: "structural",          unit: "Piece",            svg: "structural/aac_block",                   subtitle: "Autoclaved Aerated Concrete block — 3× lighter than clay brick"          },
  { name: "Concrete Hollow Block",          cat: "structural",          unit: "Piece",            svg: "structural/concrete_block",              subtitle: "Hollow cavity blocks for partition & non-load-bearing masonry"            },
  { name: "TMT Steel Bar 8mm (Fe-500)",     cat: "structural",          unit: "Kg",               svg: "structural/steel_rods",                  subtitle: "Thermo-mechanically treated Fe-500D bars for RCC slabs & beams"          },
  { name: "TMT Steel Bar 10mm (Fe-500)",    cat: "structural",          unit: "Kg",               svg: "structural/steel_rods",                  subtitle: "High-ductility TMT bar for seismic zone construction"                    },
  { name: "TMT Steel Bar 12mm (Fe-500)",    cat: "structural",          unit: "Kg",               svg: "structural/steel_rods",                  subtitle: "Standard reinforcement bar for columns, beams and footings"              },
  { name: "TMT Steel Bar 16mm (Fe-500)",    cat: "structural",          unit: "Kg",               svg: "structural/steel_rods",                  subtitle: "Heavy-duty TMT bar for retaining walls and large foundations"            },
  { name: "River Sand",                     cat: "structural",          unit: "CFT",              svg: "structural/sand_pile",                   subtitle: "Natural fine aggregate Zone II for plastering & concrete"                },
  { name: "M-Sand (Manufactured Sand)",     cat: "structural",          unit: "CFT",              svg: "structural/m_sand",                      subtitle: "Crusher-processed sand substitute with consistent IS 383 grading"        },
  { name: "Aggregate 20mm (Jelly)",         cat: "structural",          unit: "CFT",              svg: "structural/aggregate_stone",             subtitle: "Crushed granite coarse aggregate for M20+ structural concrete"           },
  { name: "Aggregate 40mm",                 cat: "structural",          unit: "CFT",              svg: "structural/aggregate_stone",             subtitle: "Coarse jelly aggregate for mass concrete and sub-base work"              },
  { name: "Ready-Mix Concrete (M20)",       cat: "structural",          unit: "Cum",              svg: "structural/concrete_mix",                subtitle: "Factory-batched M20 RMC delivered to site in transit mixer"              },
  { name: "Binding Wire (18 SWG)",          cat: "structural",          unit: "Kg",               svg: "structural/binding_wire",                subtitle: "GI soft-annealed wire for tying TMT rebar intersections"                },
  { name: "Waterproofing Compound",         cat: "structural",          unit: "Bucket (20 kg)",   svg: "structural/water_proofing",              subtitle: "Crystalline waterproofing admixture for tanks, basements & terraces"    },
  { name: "Nails & Wood Screws (Assorted)", cat: "structural",          unit: "Kg",               svg: "structural/nails_screws",                subtitle: "Assorted GI nails and wood screws for shuttering & carpentry"           },

  // ── FINISHING ──────────────────────────────────────────────────────────────
  { name: "Vitrified Floor Tile (600×600)", cat: "finishing",           unit: "Sqft",             svg: "finishing/floor_tile",                   subtitle: "Double-charge glossy vitrified tile — Mohs 7 scratch-proof surface"    },
  { name: "Ceramic Floor Tile",             cat: "finishing",           unit: "Sqft",             svg: "finishing/floor_tile",                   subtitle: "Glazed ceramic tile for general flooring and utility areas"              },
  { name: "Glazed Wall Tile (300×450)",     cat: "finishing",           unit: "Sqft",             svg: "finishing/wall_tile",                    subtitle: "High-gloss ceramic wall tile for kitchens and bathrooms"                },
  { name: "Granite Slab (Polished)",        cat: "finishing",           unit: "Sqft",             svg: "finishing/granite_slab",                 subtitle: "Machine-polished Indian granite for flooring & countertops"             },
  { name: "Marble Slab (Italian/Indian)",   cat: "finishing",           unit: "Sqft",             svg: "finishing/marble_slab",                  subtitle: "Premium natural marble with mirror polish for luxury interiors"         },
  { name: "Interior Emulsion Paint",        cat: "finishing",           unit: "Bucket (20 L)",    svg: "finishing/paint_bucket",                 subtitle: "Washable low-VOC emulsion with stain-repellent finish"                  },
  { name: "Exterior Weatherproof Paint",    cat: "finishing",           unit: "Bucket (20 L)",    svg: "finishing/waterproof_paint",             subtitle: "UV-resistant exterior paint with 10-year warranty & crack-bridging"    },
  { name: "Wall Primer (Undercoat)",        cat: "finishing",           unit: "Bucket (10 L)",    svg: "finishing/primer",                       subtitle: "Alkali-resistant primer for new plaster before emulsion painting"       },
  { name: "Wall Putty (White Cement Based)",cat: "finishing",           unit: "Bag (20 kg)",      svg: "finishing/putty",                        subtitle: "White cement wall putty for smooth base before painting"                },
  { name: "Plaster of Paris (POP)",         cat: "finishing",           unit: "Bag (25 kg)",      svg: "finishing/plaster_of_paris",             subtitle: "Fast-setting gypsum plaster for false ceiling and wall finishing"      },
  { name: "Tile Grout",                     cat: "finishing",           unit: "Pack (5 kg)",      svg: "finishing/grout",                        subtitle: "Polymer-modified grout for tile joints — mould & stain resistant"      },
  { name: "Tile Adhesive",                  cat: "finishing",           unit: "Bag (20 kg)",      svg: "finishing/tile_adhesive",                subtitle: "High-bond cementitious adhesive for tiles on walls and floors"         },
  { name: "Gypsum Board (False Ceiling)",   cat: "finishing",           unit: "Sheet (8×4 ft)",   svg: "finishing/gypsum_board",                 subtitle: "Lightweight gypsum panels for false ceiling and drywall partitions"    },

  // ── PLUMBING & ELECTRICAL ──────────────────────────────────────────────────
  { name: "PVC Pipe 4-inch (Drainage)",     cat: "plumbing_electrical", unit: "Metre",            svg: "plumbing_electrical/pvc_pipe",           subtitle: "IS 4985 PVC drainage pipe for underground & internal drainage"         },
  { name: "PVC Pipe 2-inch",               cat: "plumbing_electrical", unit: "Metre",            svg: "plumbing_electrical/pvc_pipe",           subtitle: "PVC soil and waste pipe for bathroom and kitchen drainage"             },
  { name: "CPVC Pipe (Hot Water)",          cat: "plumbing_electrical", unit: "Metre",            svg: "plumbing_electrical/cpvc_pipe",          subtitle: "ASTM D2846 CPVC pipe for hot & cold potable water supply"             },
  { name: "GI Pipe (Galvanized Iron)",      cat: "plumbing_electrical", unit: "Metre",            svg: "plumbing_electrical/gi_pipe",            subtitle: "Hot-dip galvanised steel pipe for water supply and gas lines"          },
  { name: "Pipe Fittings (Elbow, T, Coupler)", cat: "plumbing_electrical", unit: "Set",           svg: "plumbing_electrical/pipe_fittings",      subtitle: "Assorted PVC/CPVC fittings — elbows, tees, reducers, couplers"       },
  { name: "Tap / Faucet (Chrome)",          cat: "plumbing_electrical", unit: "Piece",            svg: "plumbing_electrical/tap_faucet",         subtitle: "Single-lever chrome-plated pillar cock for kitchen and bathroom"      },
  { name: "Water Storage Tank (1000 L)",    cat: "plumbing_electrical", unit: "Piece",            svg: "plumbing_electrical/water_tank",         subtitle: "UV-stabilised triple-layer HDPE overhead water tank"                  },
  { name: "Electrical Wire 2.5 sqmm (Copper)", cat: "plumbing_electrical", unit: "Coil (90 m)",  svg: "plumbing_electrical/electrical_wire",    subtitle: "FR PVC insulated annealed copper wire for light & power circuits"     },
  { name: "Electrical Wire 1.5 sqmm (Copper)", cat: "plumbing_electrical", unit: "Coil (90 m)",  svg: "plumbing_electrical/electrical_wire",    subtitle: "IS 694 FR copper wire for lighting and fan circuits"                  },
  { name: "Electrical Wire 4 sqmm (Copper)",   cat: "plumbing_electrical", unit: "Coil (90 m)",  svg: "plumbing_electrical/electrical_wire",    subtitle: "Heavy-duty copper wire for AC and high-load appliance circuits"        },
  { name: "Modular Switch + 3-Pin Socket", cat: "plumbing_electrical", unit: "Set",              svg: "plumbing_electrical/switch_socket",      subtitle: "Modular 6A/16A switch and 3-pin socket set for internal wiring"       },
  { name: "MCB Circuit Breaker (32A)",      cat: "plumbing_electrical", unit: "Piece",            svg: "plumbing_electrical/mcb",                subtitle: "32A single-pole MCB for short circuit and overload protection"         },
  { name: "Distribution Box (8-way)",       cat: "plumbing_electrical", unit: "Piece",            svg: "plumbing_electrical/db_box",             subtitle: "IP43 MCB distribution board for residential wiring circuits"           },
  { name: "Electrical Conduit Pipe (PVC)",  cat: "plumbing_electrical", unit: "Metre",            svg: "plumbing_electrical/conduit_pipe",       subtitle: "Rigid PVC conduit for protecting electrical wire runs in walls"        },

  // ── DOORS, WINDOWS & WOOD ─────────────────────────────────────────────────
  { name: "Flush Wooden Door",              cat: "doors_windows_wood",  unit: "Piece",            svg: "doors_windows_wood/wooden_door",         subtitle: "Solid core flush door with hardwood lipping for interior rooms"       },
  { name: "Main Teak Wood Door",            cat: "doors_windows_wood",  unit: "Piece",            svg: "doors_windows_wood/main_door",           subtitle: "Hand-carved premium teak main entrance door with brass hardware"      },
  { name: "Steel Safety Door",              cat: "doors_windows_wood",  unit: "Piece",            svg: "doors_windows_wood/steel_door",          subtitle: "Heavy-gauge galvanised steel security door with multi-point lock"     },
  { name: "Aluminum Sliding Window",        cat: "doors_windows_wood",  unit: "Sqft",             svg: "doors_windows_wood/window_frame",        subtitle: "Extruded aluminium sliding window with mosquito mesh"                 },
  { name: "uPVC Window (Sliding/Casement)", cat: "doors_windows_wood",  unit: "Sqft",             svg: "doors_windows_wood/upvc_window",         subtitle: "Multi-chamber uPVC window with toughened glass — energy efficient"   },
  { name: "Plywood (Commercial Grade)",     cat: "doors_windows_wood",  unit: "Sqft",             svg: "doors_windows_wood/plywood",             subtitle: "IS 303 BWR plywood — termite and moisture resistant for furniture"    },
  { name: "MDF Board",                      cat: "doors_windows_wood",  unit: "Sqft",             svg: "doors_windows_wood/mdf_board",           subtitle: "Medium Density Fibreboard for modular furniture and wall panels"      },
  { name: "Wooden Planks (Sal/Teak)",       cat: "doors_windows_wood",  unit: "Cft",              svg: "doors_windows_wood/wooden_planks",       subtitle: "Seasoned hardwood planks for door frames, beams and formwork"         },
  { name: "Laminate Sheet (Decorative)",    cat: "doors_windows_wood",  unit: "Sheet (8×4 ft)",   svg: "doors_windows_wood/laminate_sheet",      subtitle: "High-pressure laminate for kitchen shutters and furniture finish"     },
  { name: "Door Handle + Mortise Lock",     cat: "doors_windows_wood",  unit: "Set",              svg: "doors_windows_wood/door_handle",         subtitle: "Stainless steel lever handle with 3-lever mortise deadbolt lock"     },
  { name: "Door Hinges (Stainless Steel)",  cat: "doors_windows_wood",  unit: "Pair",             svg: "doors_windows_wood/hinges",              subtitle: "Heavy-duty SS 304 butt hinges for solid wood doors"                  },
];

// ─── Main ─────────────────────────────────────────────────────────────────────
async function seed() {
  try {
    console.log("🔌 Connecting to MongoDB…");
    await mongoose.connect(process.env.URL);
    console.log("✅ Connected\n");

    // ── 1. Seed categories ───────────────────────────────────────────────────
    console.log("📦 Seeding categories…");
    const catDocs = [];
    for (const c of CATEGORIES) {
      await Category.deleteMany({ cloudinaryid: `seed_cat_${c.key}` });
      const [doc] = await Category.insertMany([{
        name:         c.name,
        image:        c.image,
        cloudinaryid: `seed_cat_${c.key}`,
        is_delete:    0,
      }]);
      catDocs.push({ key: c.key, doc });
      console.log(`   ✔ ${c.name}`);
    }
    const catById = Object.fromEntries(catDocs.map(({ key, doc }) => [key, doc._id]));

    // ── 2. Remove old seeded products (by name match) ────────────────────────
    await Product.deleteMany({ name: { $in: PRODUCTS.map((p) => p.name) } });

    // ── 3. Seed products ─────────────────────────────────────────────────────
    console.log("\n🧱 Seeding products…");
    const docs = PRODUCTS.map((p) => {
      const [category, file] = p.svg.split("/");
      const svgUrl = img(category, file);
      return {
        name:         p.name,
        subtitle:     p.subtitle,
        size:         p.unit,
        description:  `${p.name} — sold per ${p.unit}. Contact the seller for current pricing and availability.`,
        min_quantity: 1,
        min_price:    0,    // dynamic — seller sets price
        max_price:    0,    // dynamic — seller sets price
        category:     catById[p.cat],
        image:        [{ public_id: `materials/${p.svg}`, secure_url: svgUrl }],
        is_delete:    0,
      };
    });

    const inserted = await Product.insertMany(docs);
    inserted.forEach((p) => console.log(`   ✔ ${p.name}`));

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("✅ Seeding complete!");
    console.log(`   Categories : ${catDocs.length}`);
    console.log(`   Products   : ${inserted.length}`);
    console.log(`   Image base : ${BASE}/public/materials/`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("\n❌ Seed failed:", err.message);
    try { await mongoose.disconnect(); } catch (_) {}
    process.exit(1);
  }
}

seed();
