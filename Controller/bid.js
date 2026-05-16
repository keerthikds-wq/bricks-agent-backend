const Bid         = require("../Model/Bid");
const Order       = require("../Model/Order");
const Requirement = require("../Model/Requirement");

// ─── POST /api/bid ─────────────────────────────────────────────────────────────
// Seller submits a quotation for either an Order or a Requirement.
// seller is taken from the verified JWT — never from req.body.
const addBid = async (req, res) => {
    const {
        order, requirement,
        description, price,
        representative_name, representative_no, delivery_date,
    } = req.body;

    // Validate: price always required; exactly one of order/requirement must be set
    if (!price) {
        return res.status(400).send({ status: 400, data: null, message: "price is required", error: true });
    }
    if (!order && !requirement) {
        return res.status(400).send({ status: 400, data: null, message: "Either order or requirement must be provided", error: true });
    }

    try {
        // Duplicate-bid guard
        const dupQuery = { seller: req.user.id, is_delete: { $ne: 1 } };
        if (order)  dupQuery.order       = order;
        else        dupQuery.requirement  = requirement;

        const existing = await Bid.findOne(dupQuery);
        if (existing) {
            return res.status(409).send({
                status: 409, data: null,
                message: "You have already submitted a bid for this.",
                error: true,
            });
        }

        const bidData = {
            seller: req.user.id,
            price: Number(price),
            description: description || "",
            representative_name: representative_name || "",
            representative_no: representative_no || null,
            delivery_date: delivery_date || null,
            status: "pending",
        };
        if (order)  bidData.order       = order;
        else        bidData.requirement  = requirement;

        const bid = await Bid.create(bidData);
        const populated = await Bid.findById(bid._id)
            .populate({ path: "seller", select: "name company phone profile" });

        return res.status(201).send({
            status: 201, data: populated,
            message: "Quotation submitted successfully",
            error: false,
        });
    } catch (error) {
        console.error("addBid error:", error);
        return res.status(500).send({ status: 500, data: null, message: error.message, error: true });
    }
};

// ─── GET /api/bid/order/:id ────────────────────────────────────────────────────
// Returns all NON-DECLINED bids for an order, sorted by price ascending.
const getBidbyOrder = async (req, res) => {
    try {
        const bids = await Bid.find({
            order: req.params.id,
            is_delete: { $ne: 1 },
            status: { $ne: "declined" },
        })
            .populate({ path: "seller", select: "name company phone profile" })
            .sort({ price: 1 });

        return res.send({
            status: 200, data: bids,
            message: bids.length === 0
                ? "No quotations yet for this order"
                : `Fetched ${bids.length} quotation(s)`,
            error: false,
        });
    } catch (error) {
        console.error("getBidbyOrder error:", error);
        return res.status(500).send({ status: 500, data: null, message: error.message, error: true });
    }
};

// ─── GET /api/bid/requirement/:id ─────────────────────────────────────────────
// Returns all NON-DECLINED bids for a Requirement, sorted by price ascending.
const getBidsByRequirement = async (req, res) => {
    try {
        const bids = await Bid.find({
            requirement: req.params.id,
            is_delete: { $ne: 1 },
            status: { $ne: "declined" },
        })
            .populate({ path: "seller", select: "name company phone profile" })
            .sort({ price: 1 });

        return res.send({
            status: 200, data: bids,
            message: bids.length === 0
                ? "No quotations yet for this requirement"
                : `Fetched ${bids.length} quotation(s)`,
            error: false,
        });
    } catch (error) {
        console.error("getBidsByRequirement error:", error);
        return res.status(500).send({ status: 500, data: null, message: error.message, error: true });
    }
};

// ─── GET /api/bid/my ──────────────────────────────────────────────────────────
// Seller's own submitted quotations with populated order/requirement details.
const getMyBids = async (req, res) => {
    try {
        const bids = await Bid.find({
            seller: req.user.id,
            is_delete: { $ne: 1 },
        })
            .populate({
                path: "order",
                populate: [
                    { path: "user",    select: "name phone profile" },
                    { path: "product", populate: [{ path: "category" }, { path: "subcategory" }, { path: "brand" }] },
                ],
            })
            .populate({
                path: "requirement",
                select: "title quantity unit message user",
                populate: { path: "user", select: "name phone profile" },
            })
            .sort({ createdAt: -1 });

        return res.send({
            status: 200, data: bids,
            message: `Fetched ${bids.length} quotation(s)`,
            error: false,
        });
    } catch (error) {
        console.error("getMyBids error:", error);
        return res.status(500).send({ status: 500, data: null, message: error.message, error: true });
    }
};

// ─── POST /api/bid/order ──────────────────────────────────────────────────────
// Buyer accepts a bid on an Order → order goes "ongoing".
const acceptBidForOrder = async (req, res) => {
    const { order: orderId, bid: bidId } = req.body;
    if (!orderId || !bidId) {
        return res.status(400).send({ status: 400, data: null, message: "order and bid are required", error: true });
    }
    try {
        await Bid.findByIdAndUpdate(bidId, { status: "accepted" });
        const order = await Order.findByIdAndUpdate(
            orderId,
            { bid: bidId, status: "ongoing" },
            { new: true }
        );
        return res.send({
            status: 200, data: order,
            message: "Quotation accepted. Order is now ongoing.",
            error: false,
        });
    } catch (error) {
        console.error("acceptBidForOrder error:", error);
        return res.status(500).send({ status: 500, data: null, message: error.message, error: true });
    }
};

// ─── POST /api/bid/requirement ────────────────────────────────────────────────
// Buyer accepts a bid on a Requirement → bid marked accepted, requirement closed.
const acceptBidForRequirement = async (req, res) => {
    const { requirement: requirementId, bid: bidId } = req.body;
    if (!requirementId || !bidId) {
        return res.status(400).send({ status: 400, data: null, message: "requirement and bid are required", error: true });
    }
    try {
        await Bid.findByIdAndUpdate(bidId, { status: "accepted" });
        await Requirement.findByIdAndUpdate(requirementId, { status: "closed" });
        return res.send({
            status: 200, data: null,
            message: "Quotation accepted. Requirement is now closed.",
            error: false,
        });
    } catch (error) {
        console.error("acceptBidForRequirement error:", error);
        return res.status(500).send({ status: 500, data: null, message: error.message, error: true });
    }
};

// ─── POST /api/bid/:id/decline ────────────────────────────────────────────────
// Buyer declines a specific bid.
const declineBid = async (req, res) => {
    try {
        const bid = await Bid.findByIdAndUpdate(
            req.params.id,
            { status: "declined" },
            { new: true }
        );
        if (!bid) {
            return res.status(404).send({ status: 404, data: null, message: "Quotation not found", error: true });
        }
        return res.send({ status: 200, data: null, message: "Quotation declined", error: false });
    } catch (error) {
        console.error("declineBid error:", error);
        return res.status(500).send({ status: 500, data: null, message: error.message, error: true });
    }
};

module.exports = {
    addBid,
    getBidbyOrder,
    getBidsByRequirement,
    getMyBids,
    acceptBidForOrder,
    acceptBidForRequirement,
    declineBid,
};
