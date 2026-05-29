const Inventory = require('../Model/Inventory');

// JWT payloads are signed with { id: seller._id } so decoded tokens expose
// req.user.id, not _uid(req).  Use this helper everywhere.
const _uid = (req) => req.user.id || _uid(req);

// ── POST /api/inventory  — add a new item ─────────────────────────────────────
exports.addItem = async (req, res) => {
  try {
    const { name, category, quantity, unit, price_per_unit, is_available, description } = req.body;

    if (!name || !category || quantity === undefined || !unit || price_per_unit === undefined) {
      return res.status(400).json({ message: 'name, category, quantity, unit, and price_per_unit are required.' });
    }

    const item = await Inventory.create({
      seller_id:      _uid(req),
      name:           name.trim(),
      category,
      quantity:       Number(quantity),
      unit,
      price_per_unit: Number(price_per_unit),
      is_available:   is_available !== undefined ? Boolean(is_available) : true,
      description:    (description || '').slice(0, 300),
    });

    res.status(201).json({ success: true, data: item });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// ── PUT /api/inventory/:id  — update an item ──────────────────────────────────
exports.updateItem = async (req, res) => {
  try {
    const item = await Inventory.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Item not found.' });

    if (String(item.seller_id) !== String(_uid(req))) {
      return res.status(403).json({ message: 'Not authorised to update this item.' });
    }

    const { name, category, quantity, unit, price_per_unit, is_available, description } = req.body;

    if (name           !== undefined) item.name           = name.trim();
    if (category       !== undefined) item.category       = category;
    if (quantity       !== undefined) item.quantity       = Number(quantity);
    if (unit           !== undefined) item.unit           = unit;
    if (price_per_unit !== undefined) item.price_per_unit = Number(price_per_unit);
    if (is_available   !== undefined) item.is_available   = Boolean(is_available);
    if (description    !== undefined) item.description    = String(description).slice(0, 300);

    await item.save();
    res.status(200).json({ success: true, data: item });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// ── DELETE /api/inventory/:id  — delete an item ───────────────────────────────
exports.deleteItem = async (req, res) => {
  try {
    const item = await Inventory.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Item not found.' });

    if (String(item.seller_id) !== String(_uid(req))) {
      return res.status(403).json({ message: 'Not authorised to delete this item.' });
    }

    await item.deleteOne();
    res.status(200).json({ success: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// ── PATCH /api/inventory/:id/toggle  — flip availability ─────────────────────
exports.toggleAvailability = async (req, res) => {
  try {
    const item = await Inventory.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Item not found.' });

    if (String(item.seller_id) !== String(_uid(req))) {
      return res.status(403).json({ message: 'Not authorised to update this item.' });
    }

    item.is_available = !item.is_available;
    await item.save();
    res.status(200).json({ success: true, data: item });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// ── GET /api/inventory/my  — all items for logged-in seller ──────────────────
exports.getMyInventory = async (req, res) => {
  try {
    const items = await Inventory.find({ seller_id: _uid(req) })
      .sort({ category: 1, name: 1 })
      .lean();

    res.status(200).json({ success: true, data: items });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// ── GET /api/inventory/seller/:seller_id  — public: available items ──────────
exports.getSellerInventory = async (req, res) => {
  try {
    const items = await Inventory.find({
      seller_id:    req.params.seller_id,
      is_available: true,
    })
      .sort({ category: 1, name: 1 })
      .lean();

    res.status(200).json({ success: true, data: items });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
