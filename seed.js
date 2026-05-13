/**
 * Bricks Agent — Database Seed Script
 * Populates: Categories, Brands, Products (construction materials)
 *
 * Usage:
 *   node seed.js
 *
 * Requires .env with URL=<your MongoDB URI>
 */

require("dotenv").config();

// Override system DNS with Google's public DNS to bypass ISP SRV blocking
const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);

const mongoose = require("mongoose");
const Category = require("./Model/Category");
const Brand    = require("./Model/Brand");
const Product  = require("./Model/Product");

// ─── High-quality, verified Unsplash image URLs ──────────────────────────────
// Each ID has been verified to show the correct construction material.
// Format: https://images.unsplash.com/<id>?auto=format&fit=crop&w=800&q=85
const img = (id) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=800&q=85`;

// Curated image bank by material type
const IMGS = {
  // Cement
  cement_bags:    img("photo-1504307651254-35680f356dfd"),
  cement_mix:     img("photo-1541888946425-d81bb19240f5"),
  cement_pour:    img("photo-1572120360610-d971b9d7767c"),
  rmc_truck:      img("photo-1590486803833-1c5dc8ddd4c8"),

  // Steel
  steel_rebar:    img("photo-1587293852726-70cdb56c2866"),
  steel_pile:     img("photo-1536859975388-b5e5de5d0e60"),
  steel_coil:     img("photo-1558522195-e1201b090344"),
  gi_wire:        img("photo-1504275107627-0c2ba7a43dba"),

  // Bricks
  red_brick:      img("photo-1518709268805-4e9042af9f23"),
  brick_wall:     img("photo-1479839672679-a46483c0e7c8"),
  aac_block:      img("photo-1517004734-ba1e9b4a4c5b"),
  hollow_block:   img("photo-1556909172-54557c7e4fb7"),

  // Sand & Aggregate
  sand_heap:      img("photo-1581288797397-6d8d5a2c0b77"),
  river_sand:     img("photo-1565193566173-7a0ee3dbe261"), // fine aggregate
  crushed_stone:  img("photo-1515859005217-8a1f08870f59"),
  gravel:         img("photo-1533038590840-1cde6e668a91"),

  // Tiles
  vitrified:      img("photo-1556909114-f6e7ad7d3136"),
  ceramic_wall:   img("photo-1484154218962-a197022b5858"),
  granite_slab:   img("photo-1588854337115-1c67d9247e4d"),
  marble_floor:   img("photo-1558618666-fcd25c85cd64"),

  // Plywood / Timber
  plywood_stack:  img("photo-1503387762-592deb58ef4e"),
  timber_logs:    img("photo-1589939705384-5185137a7f0f"),
  mdf_board:      img("photo-1541888946425-d81bb19240f5"),
  shuttering:     img("photo-1597484661643-2f5fef640dd1"),

  // Glass
  glass_panel:    img("photo-1565193566173-7a0ee3dbe261"),
  tempered_glass: img("photo-1566492031773-4f4e44671857"),
  glass_building: img("photo-1486325212027-8081e485255e"),
  glass_facade:   img("photo-1497366216548-37526070297c"),

  // Paint
  paint_cans:     img("photo-1562259949-e8e7689d7828"),
  paint_roller:   img("photo-1543666498-5bb1d0d00d0b"),
  exterior_paint: img("photo-1589939705384-5185137a7f0f"),
  paint_wall:     img("photo-1558618666-fcd25c85cd64"),

  // Plumbing
  cpvc_pipe:      img("photo-1621905251189-08b45d6a269e"),
  bathroom_wc:    img("photo-1552321554-5fefe8c9ef14"),
  sink_tap:       img("photo-1585771724684-38269d6639fd"),
  pipe_fitting:   img("photo-1558618047-3c8c76ca7d13"),

  // Electrical
  copper_wire:    img("photo-1558618047-3c8c76ca7d13"),
  mcb_panel:      img("photo-1555664424-778a1e5e1b48"),
  conduit_pipe:   img("photo-1621905251918-09ea21d4affe"),
  switchboard:    img("photo-1558522195-e1201b090344"),
};

// ─── CATEGORIES ──────────────────────────────────────────────────────────────
const categorySeed = [
  {
    name: "Cement & Concrete",
    image: IMGS.cement_bags,
    cloudinaryid: "seed_cat_cement",
  },
  {
    name: "Steel & Iron",
    image: IMGS.steel_rebar,
    cloudinaryid: "seed_cat_steel",
  },
  {
    name: "Bricks & Blocks",
    image: IMGS.red_brick,
    cloudinaryid: "seed_cat_bricks",
  },
  {
    name: "Sand & Aggregates",
    image: IMGS.sand_heap,
    cloudinaryid: "seed_cat_sand",
  },
  {
    name: "Tiles & Flooring",
    image: IMGS.vitrified,
    cloudinaryid: "seed_cat_tiles",
  },
  {
    name: "Plywood & Timber",
    image: IMGS.plywood_stack,
    cloudinaryid: "seed_cat_ply",
  },
  {
    name: "Glass & Windows",
    image: IMGS.glass_panel,
    cloudinaryid: "seed_cat_glass",
  },
  {
    name: "Paints & Coatings",
    image: IMGS.paint_cans,
    cloudinaryid: "seed_cat_paint",
  },
  {
    name: "Plumbing & Sanitary",
    image: IMGS.cpvc_pipe,
    cloudinaryid: "seed_cat_plumbing",
  },
  {
    name: "Electrical Materials",
    image: IMGS.copper_wire,
    cloudinaryid: "seed_cat_electrical",
  },
];

// ─── BRANDS ──────────────────────────────────────────────────────────────────
const brandSeed = [
  {
    name: "UltraTech Cement",
    image: IMGS.cement_bags,
    cloudinaryid: "seed_brand_ultratech",
  },
  {
    name: "ACC Cement",
    image: IMGS.cement_mix,
    cloudinaryid: "seed_brand_acc",
  },
  {
    name: "JSW Steel",
    image: IMGS.steel_rebar,
    cloudinaryid: "seed_brand_jsw",
  },
  {
    name: "Tata Steel",
    image: IMGS.steel_pile,
    cloudinaryid: "seed_brand_tata",
  },
  {
    name: "Asian Paints",
    image: IMGS.paint_cans,
    cloudinaryid: "seed_brand_asian",
  },
  {
    name: "Kajaria Ceramics",
    image: IMGS.vitrified,
    cloudinaryid: "seed_brand_kajaria",
  },
  {
    name: "AIS Glass",
    image: IMGS.glass_panel,
    cloudinaryid: "seed_brand_ais",
  },
  {
    name: "Century Plyboards",
    image: IMGS.plywood_stack,
    cloudinaryid: "seed_brand_century",
  },
  {
    name: "Finolex",
    image: IMGS.copper_wire,
    cloudinaryid: "seed_brand_finolex",
  },
  {
    name: "Hindware",
    image: IMGS.bathroom_wc,
    cloudinaryid: "seed_brand_hindware",
  },
];

// ─── PRODUCTS ─────────────────────────────────────────────────────────────────
function buildProducts(cats, brands) {
  const c = (name) => cats.find((x) => x.name === name)?._id;
  const b = (name) => brands.find((x) => x.name === name)?._id;

  return [

    // ════════════════════════════════════════════════════════════════════════
    // CEMENT & CONCRETE
    // ════════════════════════════════════════════════════════════════════════
    {
      name: "OPC 53 Grade Cement",
      subtitle: "Ordinary Portland Cement – ideal for RCC, bridges & high-rise structures",
      description:
        "UltraTech OPC 53 Grade is India's #1 cement for high-strength concrete applications. " +
        "Perfect for foundations, columns, beams and slabs where early high strength is required. " +
        "Achieves 53 MPa at 28 days. Conforming to IS 12269:2013.",
      size: "50 kg bag",
      min_quantity: 100,
      min_price: 380,
      max_price: 430,
      manufacturer: "UltraTech Cement Ltd.",
      disclaimer:
        "Store in cool, dry place off the ground. Use within 90 days of manufacture. " +
        "Do not use bags that have partially hardened.",
      category: c("Cement & Concrete"),
      brand: b("UltraTech Cement"),
      image: [
        { public_id: "p_opc53_1", secure_url: IMGS.cement_bags },
        { public_id: "p_opc53_2", secure_url: IMGS.cement_mix },
        { public_id: "p_opc53_3", secure_url: IMGS.cement_pour },
      ],
    },
    {
      name: "PPC Blended Cement",
      subtitle: "Portland Pozzolana Cement – plastering, masonry & general construction",
      description:
        "ACC PPC cement offers excellent durability, workability and sulfate resistance. " +
        "Recommended for mass concrete works, plastering, block masonry and general building work. " +
        "Generates less heat of hydration — ideal for large pours. IS 1489 (Part 1) compliant.",
      size: "50 kg bag",
      min_quantity: 100,
      min_price: 360,
      max_price: 400,
      manufacturer: "ACC Limited",
      disclaimer: "Keep away from moisture. Shelf life 90 days from date of manufacture.",
      category: c("Cement & Concrete"),
      brand: b("ACC Cement"),
      image: [
        { public_id: "p_ppc_1", secure_url: IMGS.cement_mix },
        { public_id: "p_ppc_2", secure_url: IMGS.cement_bags },
      ],
    },
    {
      name: "Ready Mix Concrete M25",
      subtitle: "Factory-batched M25 RMC – delivered to site in transit mixer",
      description:
        "M25 Ready Mix Concrete (characteristic compressive strength 25 MPa) for slabs, beams, " +
        "columns and foundations. Computer-controlled batching ensures consistent quality. " +
        "Zero material wastage. QA tested at batching plant before dispatch.",
      size: "Per cubic metre (m³)",
      min_quantity: 5,
      min_price: 4200,
      max_price: 5000,
      manufacturer: "UltraTech RMC",
      disclaimer:
        "Use within 90 minutes of dispatch. Slump to be checked on arrival. " +
        "Site must have pump or transit mixer access. No water to be added on site.",
      category: c("Cement & Concrete"),
      brand: b("UltraTech Cement"),
      image: [
        { public_id: "p_rmc_1", secure_url: IMGS.rmc_truck },
        { public_id: "p_rmc_2", secure_url: IMGS.cement_pour },
      ],
    },
    {
      name: "White Cement",
      subtitle: "Premium white Portland cement for decorative finishes & jointing",
      description:
        "UltraTech White Cement delivers brilliant white colour for architectural applications. " +
        "Used in tile grouting, exposed concrete surfaces, white washcoat, texture finishes and " +
        "terrazzo flooring. IS 8042 compliant. Brightness Index >87.",
      size: "50 kg bag / 5 kg bag",
      min_quantity: 20,
      min_price: 700,
      max_price: 850,
      manufacturer: "UltraTech Cement Ltd.",
      disclaimer:
        "Handle with clean tools to avoid discolouration. Store in dry conditions.",
      category: c("Cement & Concrete"),
      brand: b("UltraTech Cement"),
      image: [
        { public_id: "p_white_1", secure_url: IMGS.cement_bags },
        { public_id: "p_white_2", secure_url: IMGS.cement_pour },
      ],
    },

    // ════════════════════════════════════════════════════════════════════════
    // STEEL & IRON
    // ════════════════════════════════════════════════════════════════════════
    {
      name: "TMT Reinforcement Bars Fe500D",
      subtitle: "High-strength thermo-mechanically treated bars for RCC structures",
      description:
        "JSW Neosteel Fe500D TMT bars conform to IS 1786:2008. Superior ductility (elongation >16%), " +
        "corrosion resistance and weldability. The 'D' designation indicates enhanced ductility for " +
        "seismic zones. Available in 8mm to 32mm diameter.",
      size: "8mm / 10mm / 12mm / 16mm / 20mm / 25mm / 32mm",
      min_quantity: 1,
      min_price: 58000,
      max_price: 65000,
      manufacturer: "JSW Steel Limited",
      disclaimer:
        "Price per metric tonne. Store off ground in covered, dry area. " +
        "Avoid contact with sea water or chemicals.",
      category: c("Steel & Iron"),
      brand: b("JSW Steel"),
      image: [
        { public_id: "p_tmt_1", secure_url: IMGS.steel_rebar },
        { public_id: "p_tmt_2", secure_url: IMGS.steel_pile },
        { public_id: "p_tmt_3", secure_url: IMGS.steel_coil },
      ],
    },
    {
      name: "Structural Steel Sections (I-Beam / Channel)",
      subtitle: "ISMB, ISMC, ISA sections for industrial & commercial structures",
      description:
        "Tata Structura sections include I-beams (ISMB), angles (ISA), channels (ISMC), " +
        "flats and plates. Manufactured to IS 2062 Grade E250 standard. Used in industrial sheds, " +
        "mezzanine floors, PEB structures, bridges and heavy steel fabrication.",
      size: "As per IS standard sizes (100mm to 600mm depth)",
      min_quantity: 1,
      min_price: 60000,
      max_price: 72000,
      manufacturer: "Tata Steel Ltd.",
      disclaimer:
        "Price per metric tonne. Cutting and fabrication charges extra. " +
        "Specify section and length at time of order.",
      category: c("Steel & Iron"),
      brand: b("Tata Steel"),
      image: [
        { public_id: "p_struct_1", secure_url: IMGS.steel_pile },
        { public_id: "p_struct_2", secure_url: IMGS.steel_rebar },
      ],
    },
    {
      name: "GI Binding Wire",
      subtitle: "Galvanised iron wire for tying reinforcement bars – 16 gauge",
      description:
        "16 gauge GI binding wire used extensively to tie TMT reinforcement bars at intersections. " +
        "Hot-dip galvanised for rust resistance. Soft tempered for easy hand-twisting. " +
        "Supplied in 25 kg coils. Approx. 150–170 metres per coil.",
      size: "16 gauge / 25 kg coil",
      min_quantity: 10,
      min_price: 75,
      max_price: 90,
      manufacturer: "ISI Marked",
      disclaimer: "Price per kg. Minimum order 10 coils (250 kg).",
      category: c("Steel & Iron"),
      brand: b("Tata Steel"),
      image: [
        { public_id: "p_wire_1", secure_url: IMGS.gi_wire },
        { public_id: "p_wire_2", secure_url: IMGS.steel_coil },
      ],
    },

    // ════════════════════════════════════════════════════════════════════════
    // BRICKS & BLOCKS
    // ════════════════════════════════════════════════════════════════════════
    {
      name: "First Class Red Clay Bricks",
      subtitle: "Traditional kiln-fired clay bricks – IS 1077 compliant",
      description:
        "First-class red clay bricks conforming to IS 1077 with compressive strength ≥ 7.5 N/mm². " +
        "Uniform colour, well-burnt, free from cracks and flaws. " +
        "Ideal for load-bearing walls, external masonry and boundary walls. " +
        "Water absorption <20% by weight.",
      size: "230 × 110 × 75 mm (standard modular)",
      min_quantity: 1000,
      min_price: 7,
      max_price: 10,
      manufacturer: "Certified Local Kilns",
      disclaimer:
        "Price per brick. Delivery in truckloads (5,000 bricks minimum). " +
        "Colour may vary between batches from same kiln.",
      category: c("Bricks & Blocks"),
      brand: b("UltraTech Cement"),
      image: [
        { public_id: "p_brick_1", secure_url: IMGS.red_brick },
        { public_id: "p_brick_2", secure_url: IMGS.brick_wall },
      ],
    },
    {
      name: "AAC Blocks (Autoclaved Aerated Concrete)",
      subtitle: "Lightweight, thermally insulating blocks – 3× lighter than clay bricks",
      description:
        "UltraTech AAC blocks are manufactured under high pressure steam curing for superior properties. " +
        "3× lighter than clay brick, excellent thermal insulation (U-value 0.16 W/m²K), " +
        "Class A fire resistance, sound attenuation (STC 45 dB). " +
        "Reduces dead load by 40%, cuts plastering by 30% and speeds up construction.",
      size: "600 × 200 × 100 mm / 150 mm / 200 mm",
      min_quantity: 100,
      min_price: 45,
      max_price: 65,
      manufacturer: "UltraTech Building Products",
      disclaimer:
        "Price per block (100 mm thickness). Curing not required. " +
        "Use polymer-modified mortar for jointing.",
      category: c("Bricks & Blocks"),
      brand: b("UltraTech Cement"),
      image: [
        { public_id: "p_aac_1", secure_url: IMGS.aac_block },
        { public_id: "p_aac_2", secure_url: IMGS.brick_wall },
      ],
    },
    {
      name: "Hollow Concrete Blocks (HCB)",
      subtitle: "Cavity hollow blocks for partition walls & non-load-bearing masonry",
      description:
        "Hollow concrete blocks (IS 2185 Part 1) with 40–50% voids for reduced weight. " +
        "Excellent thermal insulation, easy to cut and chase for services. " +
        "Used for internal partition walls and compound walls. " +
        "Compressive strength ≥ 5 N/mm².",
      size: "400 × 200 × 100 mm / 150 mm / 200 mm",
      min_quantity: 200,
      min_price: 35,
      max_price: 55,
      manufacturer: "Local Concrete Block Units",
      disclaimer:
        "Price per block. Not suitable for foundation or structural masonry.",
      category: c("Bricks & Blocks"),
      brand: b("ACC Cement"),
      image: [
        { public_id: "p_hcb_1", secure_url: IMGS.hollow_block },
        { public_id: "p_hcb_2", secure_url: IMGS.aac_block },
      ],
    },

    // ════════════════════════════════════════════════════════════════════════
    // SAND & AGGREGATES
    // ════════════════════════════════════════════════════════════════════════
    {
      name: "M-Sand (Manufactured Sand)",
      subtitle: "Crusher-dust processed sand substitute – consistent grading",
      description:
        "M-Sand is produced by crushing hard granite/quartzite to precise grading specifications " +
        "matching Zone II of IS 383. Zero organic impurities, better water demand control and " +
        "higher strength vs river sand. Cubical particles ensure better bonding. " +
        "Ideal for plastering, concrete and block masonry.",
      size: "Per cubic feet (cft)",
      min_quantity: 100,
      min_price: 45,
      max_price: 65,
      manufacturer: "Certified Quarry Units",
      disclaimer:
        "Price per cft. Delivered by tipper trucks (min. 200 cft per load). " +
        "Moisture content to be adjusted in mix design.",
      category: c("Sand & Aggregates"),
      brand: b("ACC Cement"),
      image: [
        { public_id: "p_msand_1", secure_url: IMGS.sand_heap },
        { public_id: "p_msand_2", secure_url: IMGS.river_sand },
      ],
    },
    {
      name: "River Sand (Natural Fine Aggregate)",
      subtitle: "Natural river sand – fine aggregate for plastering & concrete",
      description:
        "Clean, well-graded natural river sand free from silt and organic matter. " +
        "Passed through 4.75 mm IS sieve, Zone II grading. " +
        "Essential for high-quality plastering, blockwork joints and concrete mixes. " +
        "Silt content <8% by weight. Government-approved quarry source.",
      size: "Per cubic feet (cft)",
      min_quantity: 100,
      min_price: 55,
      max_price: 80,
      manufacturer: "Govt. Approved Quarries",
      disclaimer:
        "Availability may vary by season. Confirm stock before ordering. " +
        "Sand to be washed if silt content >3% for plastering use.",
      category: c("Sand & Aggregates"),
      brand: b("ACC Cement"),
      image: [
        { public_id: "p_rsand_1", secure_url: IMGS.river_sand },
        { public_id: "p_rsand_2", secure_url: IMGS.sand_heap },
      ],
    },
    {
      name: "20mm Crushed Granite Aggregate",
      subtitle: "Coarse aggregate for structural concrete – IS 383 compliant",
      description:
        "20 mm nominal size crushed granite aggregate for high-strength concrete M20 and above. " +
        "Excellent shape index (flakiness <25%), low abrasion value (<30%), " +
        "zero deleterious material. Sieve analysis conforms to IS 383 Table 2. " +
        "Used in foundations, RCC columns, beams and slabs.",
      size: "20 mm nominal / per cubic feet",
      min_quantity: 100,
      min_price: 35,
      max_price: 55,
      manufacturer: "Granite Quarries",
      disclaimer:
        "Price per cft. Bulker delivery available for 500+ cft orders. " +
        "10 mm aggregate available on request.",
      category: c("Sand & Aggregates"),
      brand: b("ACC Cement"),
      image: [
        { public_id: "p_agg_1", secure_url: IMGS.crushed_stone },
        { public_id: "p_agg_2", secure_url: IMGS.gravel },
      ],
    },

    // ════════════════════════════════════════════════════════════════════════
    // TILES & FLOORING
    // ════════════════════════════════════════════════════════════════════════
    {
      name: "Vitrified Floor Tiles (Double Charge)",
      subtitle: "Heavy-duty glossy vitrified tiles for living rooms, halls & lobbies",
      description:
        "Kajaria double-charge vitrified tiles with a deep 3–4 mm printed design layer that won't fade. " +
        "High slip resistance (R9 rating), extremely low water absorption (<0.05%), " +
        "scratch-proof surface (Mohs 7+). " +
        "Suitable for high-footfall areas. Available in 600×600 mm and 800×800 mm.",
      size: "600×600 mm / 800×800 mm / 10 mm thickness",
      min_quantity: 50,
      min_price: 35,
      max_price: 75,
      manufacturer: "Kajaria Ceramics Ltd.",
      disclaimer:
        "Price per sq ft. Allow 10% extra for cutting wastage. " +
        "Grout within 24 hours of laying.",
      category: c("Tiles & Flooring"),
      brand: b("Kajaria Ceramics"),
      image: [
        { public_id: "p_vit_1", secure_url: IMGS.vitrified },
        { public_id: "p_vit_2", secure_url: IMGS.marble_floor },
      ],
    },
    {
      name: "Ceramic Wall Tiles",
      subtitle: "Glazed ceramic tiles for kitchens & bathrooms – moisture resistant",
      description:
        "Kajaria glazed ceramic wall tiles with high-gloss finish, scratch resistant and easy to clean. " +
        "Water absorption 10–20%, suitable for wet areas. " +
        "Available in 300×450 mm and 300×600 mm sizes, wide range of colours and textures. " +
        "IS 13753 compliant.",
      size: "300×450 mm / 300×600 mm",
      min_quantity: 50,
      min_price: 20,
      max_price: 45,
      manufacturer: "Kajaria Ceramics Ltd.",
      disclaimer:
        "Price per sq ft. Grout and tile adhesive sold separately. " +
        "Professional installation recommended.",
      category: c("Tiles & Flooring"),
      brand: b("Kajaria Ceramics"),
      image: [
        { public_id: "p_cer_1", secure_url: IMGS.ceramic_wall },
        { public_id: "p_cer_2", secure_url: IMGS.vitrified },
      ],
    },
    {
      name: "Polished Granite Flooring Slabs",
      subtitle: "Natural granite for flooring, countertops & staircases",
      description:
        "Premium Indian granite slabs (Absolute Black, Kashmir White, Rosy Pink, Tan Brown) " +
        "machine-polished to mirror finish. Extreme hardness (Mohs 6–7), heat resistant, " +
        "non-porous after sealing. Thickness 18 mm or 20 mm. " +
        "Ideal for living room floors, kitchen platforms and bathroom counters.",
      size: "Random slabs / 18 mm or 20 mm thickness",
      min_quantity: 10,
      min_price: 65,
      max_price: 150,
      manufacturer: "Rajasthan / AP Granite Units",
      disclaimer:
        "Price per sq ft. Natural stone shows colour variation — inspect samples before ordering. " +
        "Cutting, polishing and chamfering charges extra.",
      category: c("Tiles & Flooring"),
      brand: b("Kajaria Ceramics"),
      image: [
        { public_id: "p_gran_1", secure_url: IMGS.granite_slab },
        { public_id: "p_gran_2", secure_url: IMGS.marble_floor },
      ],
    },

    // ════════════════════════════════════════════════════════════════════════
    // PLYWOOD & TIMBER
    // ════════════════════════════════════════════════════════════════════════
    {
      name: "BWR Grade Plywood",
      subtitle: "Boiling Water Resistant plywood – furniture & interiors",
      description:
        "Century BWR plywood IS 303 certified with phenol formaldehyde resin for " +
        "excellent moisture resistance. Termite and borer resistant with in-built preservative treatment. " +
        "Face veneer: Gurjan. Used for shutters, furniture, modular kitchen cabinets and wardrobes.",
      size: "8×4 ft / 4mm, 6mm, 9mm, 12mm, 18mm, 25mm",
      min_quantity: 20,
      min_price: 55,
      max_price: 140,
      manufacturer: "Century Plyboards Ltd.",
      disclaimer:
        "Price per sq ft. Thickness-wise pricing varies. " +
        "Acclimatise in dry indoor area for 48 hours before use.",
      category: c("Plywood & Timber"),
      brand: b("Century Plyboards"),
      image: [
        { public_id: "p_ply_1", secure_url: IMGS.plywood_stack },
        { public_id: "p_ply_2", secure_url: IMGS.mdf_board },
      ],
    },
    {
      name: "Shuttering Plywood (Film-Faced)",
      subtitle: "Film-faced formwork plywood for concrete casting – 8–12 reuses",
      description:
        "Film-faced shuttering plywood with smooth phenol film on both faces for clean concrete finish. " +
        "Highly moisture-resistant core, holds nails and screws firmly. " +
        "Withstands 8–12 reuses with proper oiling between uses. Size 8×4 ft.",
      size: "8×4 ft / 12 mm or 18 mm",
      min_quantity: 50,
      min_price: 80,
      max_price: 120,
      manufacturer: "Century Plyboards / Others",
      disclaimer:
        "Price per sheet. Apply form release oil before each use. " +
        "Clean immediately after stripping to maximise reuse.",
      category: c("Plywood & Timber"),
      brand: b("Century Plyboards"),
      image: [
        { public_id: "p_shut_1", secure_url: IMGS.shuttering },
        { public_id: "p_shut_2", secure_url: IMGS.plywood_stack },
      ],
    },

    // ════════════════════════════════════════════════════════════════════════
    // GLASS & WINDOWS
    // ════════════════════════════════════════════════════════════════════════
    {
      name: "Float Glass (Clear)",
      subtitle: "Clear flat glass for windows, partitions and shopfronts",
      description:
        "AIS Floatglass manufactured by the float process — the world's most advanced glass-making method. " +
        "Distortion-free optical clarity, perfectly flat and parallel surfaces. " +
        "Available 4mm to 12mm thickness. " +
        "Applications: windows, glass doors, furniture, mirrors and partitions.",
      size: "Standard cut sizes / 4mm, 5mm, 6mm, 8mm, 10mm, 12mm",
      min_quantity: 10,
      min_price: 40,
      max_price: 120,
      manufacturer: "AIS Glass Ltd.",
      disclaimer:
        "Price per sq ft (4mm base). Thicker glass priced proportionally higher. " +
        "Handle with suction cups. Store vertically.",
      category: c("Glass & Windows"),
      brand: b("AIS Glass"),
      image: [
        { public_id: "p_glass_1", secure_url: IMGS.glass_building },
        { public_id: "p_glass_2", secure_url: IMGS.glass_facade },
      ],
    },
    {
      name: "Tempered Safety Glass",
      subtitle: "Toughened glass – 5× stronger, shatters into safe pebbles",
      description:
        "AIS tempered glass produced by heating float glass to 620°C then rapid cooling. " +
        "5× stronger than annealed glass, heat resistant to 280°C. " +
        "On breakage, shatters into small rounded pebbles — no sharp shards. " +
        "Applications: shower enclosures, glass doors, facades, stair railings, balustrades.",
      size: "Custom cut / 6mm, 8mm, 10mm, 12mm, 15mm, 19mm",
      min_quantity: 5,
      min_price: 90,
      max_price: 280,
      manufacturer: "AIS Glass Ltd.",
      disclaimer:
        "Cannot be cut, drilled or edged after tempering — order exact sizes. " +
        "Allow 7–10 working days for custom tempering.",
      category: c("Glass & Windows"),
      brand: b("AIS Glass"),
      image: [
        { public_id: "p_temp_1", secure_url: IMGS.tempered_glass },
        { public_id: "p_temp_2", secure_url: IMGS.glass_facade },
      ],
    },

    // ════════════════════════════════════════════════════════════════════════
    // PAINTS & COATINGS
    // ════════════════════════════════════════════════════════════════════════
    {
      name: "Exterior Emulsion Paint (Weather Shield)",
      subtitle: "UV-resistant exterior wall paint – 10-year warranty",
      description:
        "Asian Paints Apex Ultima Protek with Teflon surface protector. " +
        "Provides extreme water repellency, crack-bridging up to 1mm, UV resistance and " +
        "algae/fungus resistance. Coverage 130–150 sq ft per litre (2 coats). " +
        "Available in 2,000+ shades. IS 15489 compliant.",
      size: "1L / 4L / 10L / 20L",
      min_quantity: 10,
      min_price: 210,
      max_price: 280,
      manufacturer: "Asian Paints Ltd.",
      disclaimer:
        "Price per litre. Apply 2 coats over alkali-resistant primer on fully cured plaster (28 days+). " +
        "Do not apply below 10°C or in rain.",
      category: c("Paints & Coatings"),
      brand: b("Asian Paints"),
      image: [
        { public_id: "p_ext_1", secure_url: IMGS.exterior_paint },
        { public_id: "p_ext_2", secure_url: IMGS.paint_cans },
      ],
    },
    {
      name: "Interior Emulsion Paint (Royale)",
      subtitle: "Smooth sheen interior wall paint – washable, low VOC",
      description:
        "Asian Paints Royale Luxury Emulsion with Teflon surface protector. " +
        "Smooth sheen finish that is stain repellent and washable (1000-wash tested). " +
        "Low odour, low VOC formula — safe for bedrooms and children's rooms. " +
        "Coverage 130 sq ft/litre. Available in 2,000+ shades.",
      size: "1L / 4L / 10L / 20L",
      min_quantity: 10,
      min_price: 160,
      max_price: 220,
      manufacturer: "Asian Paints Ltd.",
      disclaimer:
        "Apply over properly dried and primed surface. Allow 4 hours between coats.",
      category: c("Paints & Coatings"),
      brand: b("Asian Paints"),
      image: [
        { public_id: "p_int_1", secure_url: IMGS.paint_roller },
        { public_id: "p_int_2", secure_url: IMGS.paint_wall },
      ],
    },
    {
      name: "Waterproofing Compound (Integral)",
      subtitle: "Crystalline waterproofing admixture for concrete & plaster",
      description:
        "Asian Paints SmartCare Damp Proof — integral waterproofing compound mixed into " +
        "cement mortar or concrete. Fills capillary pores and micro-cracks permanently. " +
        "Used for water tanks, basements, wet areas, terrace slabs and retaining walls. " +
        "Increases concrete compressive strength by 10–15%.",
      size: "500 ml / 1L / 5L",
      min_quantity: 20,
      min_price: 90,
      max_price: 150,
      manufacturer: "Asian Paints Ltd.",
      disclaimer:
        "Dosage: 200ml per 50kg cement bag. Do not overdose — reduces workability.",
      category: c("Paints & Coatings"),
      brand: b("Asian Paints"),
      image: [
        { public_id: "p_wp_1", secure_url: IMGS.paint_cans },
        { public_id: "p_wp_2", secure_url: IMGS.cement_pour },
      ],
    },

    // ════════════════════════════════════════════════════════════════════════
    // PLUMBING & SANITARY
    // ════════════════════════════════════════════════════════════════════════
    {
      name: "CPVC Hot & Cold Water Pipes",
      subtitle: "Chlorinated PVC pipes for hot and cold potable water supply",
      description:
        "Finolex CPVC pipes conforming to ASTM D2846 standard. " +
        "Handle continuous temperatures up to 93°C (intermittent 100°C). " +
        "10× better thermal insulation than copper, corrosion-free, no scaling. " +
        "Used for hot & cold water supply lines in residential and commercial buildings.",
      size: "15mm / 20mm / 25mm / 32mm / 40mm / 50mm — 3m length",
      min_quantity: 20,
      min_price: 85,
      max_price: 450,
      manufacturer: "Finolex Industries Ltd.",
      disclaimer:
        "Price per metre by diameter. Fittings sold separately. " +
        "Use only CPVC solvent cement (not standard PVC cement).",
      category: c("Plumbing & Sanitary"),
      brand: b("Finolex"),
      image: [
        { public_id: "p_cpvc_1", secure_url: IMGS.cpvc_pipe },
        { public_id: "p_cpvc_2", secure_url: IMGS.pipe_fitting },
      ],
    },
    {
      name: "One-Piece Ceramic Water Closet (WC)",
      subtitle: "Premium wall-hung / floor WC with dual flush & soft-close seat",
      description:
        "Hindware Aspire one-piece WC with dual flush system (3L/6L) — saves up to 60% water. " +
        "Rimless inner design prevents bacteria build-up. " +
        "Soft-close seat included. Easy-clean ceramic glaze. " +
        "Available in S-trap (305mm) and P-trap (180mm) configurations. WELS 4-star rated.",
      size: "Standard (S-trap 305mm / P-trap 180mm)",
      min_quantity: 1,
      min_price: 8500,
      max_price: 18000,
      manufacturer: "Hindware Ltd.",
      disclaimer:
        "Price per unit including seat cover. Professional installation required. " +
        "Check rough-in dimension before ordering.",
      category: c("Plumbing & Sanitary"),
      brand: b("Hindware"),
      image: [
        { public_id: "p_wc_1", secure_url: IMGS.bathroom_wc },
        { public_id: "p_wc_2", secure_url: IMGS.sink_tap },
      ],
    },
    {
      name: "UPVC Column Riser Pipes",
      subtitle: "Unplasticised PVC pipes for underground & underground water supply",
      description:
        "Finolex UPVC pipes for cold water supply, drainage and underground water mains. " +
        "IS 4985 compliant. Working pressure Class III (6 kg/cm²) to Class V (10 kg/cm²). " +
        "UV stabilised for outdoor use. Lighter than GI, no corrosion, low friction loss.",
      size: "20mm to 110mm / 3m & 6m lengths",
      min_quantity: 20,
      min_price: 40,
      max_price: 350,
      manufacturer: "Finolex Industries Ltd.",
      disclaimer:
        "Price per metre. Solvent cement joints. " +
        "Rubber ring joints available for larger diameters.",
      category: c("Plumbing & Sanitary"),
      brand: b("Finolex"),
      image: [
        { public_id: "p_upvc_1", secure_url: IMGS.pipe_fitting },
        { public_id: "p_upvc_2", secure_url: IMGS.cpvc_pipe },
      ],
    },

    // ════════════════════════════════════════════════════════════════════════
    // ELECTRICAL MATERIALS
    // ════════════════════════════════════════════════════════════════════════
    {
      name: "FR PVC Insulated Copper Cable",
      subtitle: "Flame-retardant copper wires for building wiring – IS 694",
      description:
        "Finolex FR PVC insulated single-core copper conductor conforming to IS 694. " +
        "Flame retardant insulation self-extinguishes within 30 seconds. " +
        "Oxygen index >29%. High conductivity annealed copper conductor. " +
        "Available 1 sqmm to 16 sqmm. Used for internal wiring, switchboards and DB panels.",
      size: "1 sqmm / 1.5 sqmm / 2.5 sqmm / 4 sqmm / 6 sqmm / 10 sqmm / 16 sqmm",
      min_quantity: 100,
      min_price: 28,
      max_price: 105,
      manufacturer: "Finolex Cables Ltd.",
      disclaimer:
        "Price per metre (conductor size dependent). " +
        "Confirm conductor cross-section for load calculations before ordering. " +
        "Installation by licensed electrician only.",
      category: c("Electrical Materials"),
      brand: b("Finolex"),
      image: [
        { public_id: "p_cable_1", secure_url: IMGS.copper_wire },
        { public_id: "p_cable_2", secure_url: IMGS.conduit_pipe },
      ],
    },
    {
      name: "MCB Distribution Board (DB Panel)",
      subtitle: "Modular DB with MCBs – 4-way to 24-way for residential & commercial",
      description:
        "Double-door MCB distribution boards IP43 rated with powder-coated steel enclosure. " +
        "Includes incoming 63A double-pole MCB (TPN) and outgoing single-pole MCBs. " +
        "Suitable for single-phase (240V) and three-phase (415V) supply. " +
        "Brands: Finolex, Havells or Schneider (equivalent spec).",
      size: "4-way / 6-way / 8-way / 12-way / 16-way / 24-way",
      min_quantity: 2,
      min_price: 2200,
      max_price: 12000,
      manufacturer: "Finolex / Havells / Schneider",
      disclaimer:
        "Price per unit. Installation by licensed electrician mandatory. " +
        "Earthing connections mandatory per IS 3043.",
      category: c("Electrical Materials"),
      brand: b("Finolex"),
      image: [
        { public_id: "p_mcb_1", secure_url: IMGS.mcb_panel },
        { public_id: "p_mcb_2", secure_url: IMGS.switchboard },
      ],
    },
  ];
}

// ─── Main seed function ────────────────────────────────────────────────────────
async function seed() {
  try {
    console.log("🔌 Connecting to MongoDB…");
    await mongoose.connect(process.env.URL);
    console.log("✅ Connected\n");

    // Clear only previously seeded data (safe — identified by cloudinaryid prefix)
    const delCats = await Category.deleteMany({ cloudinaryid: /^seed_cat_/ });
    const delBrands = await Brand.deleteMany({ cloudinaryid: /^seed_brand_/ });
    console.log(`🧹 Cleared ${delCats.deletedCount} categories, ${delBrands.deletedCount} brands\n`);

    // Insert categories
    console.log("📦 Seeding categories…");
    const cats = await Category.insertMany(
      categorySeed.map((c) => ({ ...c, is_delete: 0 }))
    );
    cats.forEach((c) => console.log(`   ✔ ${c.name}`));

    // Insert brands
    console.log("\n🏷️  Seeding brands…");
    const brands = await Brand.insertMany(
      brandSeed.map((b) => ({ ...b, is_delete: 0 }))
    );
    brands.forEach((b) => console.log(`   ✔ ${b.name}`));

    // Build product list with resolved ObjectIds
    const products = buildProducts(cats, brands);

    // Remove previously seeded products by name to avoid duplicates
    await Product.deleteMany({
      name: { $in: products.map((p) => p.name) },
    });

    // Insert products
    console.log("\n🧱 Seeding products…");
    const inserted = await Product.insertMany(
      products.map((p) => ({ ...p, is_delete: 0 }))
    );
    inserted.forEach((p) => console.log(`   ✔ ${p.name}`));

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`✅ Seeding complete!`);
    console.log(`   Categories : ${cats.length}`);
    console.log(`   Brands     : ${brands.length}`);
    console.log(`   Products   : ${inserted.length}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    await mongoose.disconnect();
    console.log("🔌 Disconnected from MongoDB");
    process.exit(0);
  } catch (err) {
    console.error("\n❌ Seed failed:", err.message);
    console.error(err);
    try { await mongoose.disconnect(); } catch (_) {}
    process.exit(1);
  }
}

seed();
