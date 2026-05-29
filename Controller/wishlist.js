const Wishlist = require('../Model/Wishlist');

// JWT tokens carry .id (not ._id) in the decoded payload
const _uid = (req) => req.user.id || _uid(req);

// POST /api/wishlist — toggle (add if missing, remove if exists)
exports.toggle = async (req, res) => {
  try {
    const user_id = _uid(req);
    const { item_type, item_id, item_name, item_image, item_meta } = req.body;
    if (!item_type || !item_id) return res.status(400).json({ message: 'item_type and item_id required' });

    const existing = await Wishlist.findOne({ user_id, item_id });
    if (existing) {
      await Wishlist.deleteOne({ _id: existing._id });
      return res.json({ success: true, saved: false });
    }
    await Wishlist.create({ user_id, item_type, item_id, item_name: item_name || '', item_image: item_image || '', item_meta: item_meta || {} });
    return res.json({ success: true, saved: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/wishlist — all saved items for current user
exports.getAll = async (req, res) => {
  try {
    const items = await Wishlist.find({ user_id: _uid(req) }).sort({ createdAt: -1 });
    res.json({ success: true, data: items });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/wishlist/check/:item_id — is this item saved?
exports.check = async (req, res) => {
  try {
    const exists = await Wishlist.exists({ user_id: _uid(req), item_id: req.params.item_id });
    res.json({ success: true, saved: !!exists });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/wishlist/ids — return array of saved item_ids (for bulk check)
exports.getIds = async (req, res) => {
  try {
    const items = await Wishlist.find({ user_id: _uid(req) }, 'item_id');
    res.json({ success: true, data: items.map(i => i.item_id) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
