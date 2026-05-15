const Bid = require("../Model/Bid");
const Order = require("../Model/Order");

// ─── POST /api/bid ─────────────────────────────────────────────────────────────
// Seller submits a quotation for an order.
// seller is taken from the verified JWT — never from req.body.
const addBid = async (req, res) => {
    const { order, description, price, representative_name, representative_no, delivery_date } = req.body;

    if (!order || price === undefined || price === null || price === '') {
        return res.status(400).send({
            status: 400, data: null,
            message: "order and price are required",
            error: true
        });
    }

    try {
        const bid = await Bid.create({
            order,
            seller: req.user.id,
            price: Number(price),
            description: description || "",
            representative_name: representative_name || "",
            representative_no: representative_no || null,
            delivery_date: delivery_date || null,
            status: 'pending',
        });

        // Populate seller so the response is immediately usable on the client
        const populated = await Bid.findById(bid._id)
            .populate({ path: 'seller', select: 'name company phone profile' });

        return res.status(201).send({
            status: 201, data: populated,
            message: "Quotation submitted successfully",
            error: false
        });
    } catch (error) {
        console.log(error);
        return res.status(500).send({ status: 500, data: null, message: error.message, error: true });
    }
};

// ─── GET /api/bid/order/:id ────────────────────────────────────────────────────
// Returns all NON-DECLINED bids for an order, sorted by price ascending.
// Buyer sees this to compare quotations.
const getBidbyOrder = async (req, res) => {
    try {
        const bids = await Bid.find({
            order: req.params.id,
            is_delete: { $ne: 1 },
            status: { $ne: 'declined' },   // hide bids buyer already declined
        })
            .populate({ path: "seller", select: "name company phone profile" })
            .sort({ price: 1 });

        return res.send({
            status: 200,
            data: bids,
            message: bids.length === 0
                ? "No quotations yet for this order"
                : `Fetched ${bids.length} quotation(s)`,
            error: false
        });
    } catch (error) {
        console.log(error);
        return res.status(500).send({ status: 500, data: null, message: error.message, error: true });
    }
};

// ─── GET /api/bid/my ──────────────────────────────────────────────────────────
// Seller's own submitted quotations with populated order details.
// Used for the seller's "My Quotations" tab.
const getMyBids = async (req, res) => {
    try {
        const bids = await Bid.find({
            seller: req.user.id,
            is_delete: { $ne: 1 },
        })
            .populate({
                path: 'order',
                populate: [
                    { path: 'user', select: 'name phone profile' },
                    {
                        path: 'product',
                        populate: [
                            { path: 'category' },
                            { path: 'subcategory' },
                            { path: 'brand' }
                        ]
                    }
                ]
            })
            .sort({ createdAt: -1 });

        return res.send({
            status: 200,
            data: bids,
            message: `Fetched ${bids.length} quotation(s)`,
            error: false
        });
    } catch (error) {
        console.log(error);
        return res.status(500).send({ status: 500, data: null, message: error.message, error: true });
    }
};

// ─── POST /api/bid/order ──────────────────────────────────────────────────────
// Buyer accepts a bid — sets order status to "ongoing" and marks bid as accepted.
const acceptBidForOrder = async (req, res) => {
    const { order: orderId, bid: bidId } = req.body;
    if (!orderId || !bidId) {
        return res.status(400).send({ status: 400, data: null, message: "order and bid are required", error: true });
    }
    try {
        // Mark the accepted bid
        await Bid.findByIdAndUpdate(bidId, { status: 'accepted' });

        // Update the order
        const order = await Order.findByIdAndUpdate(
            orderId,
            { bid: bidId, status: "ongoing" },
            { new: true }
        );

        return res.send({
            status: 200,
            data: order,
            message: "Quotation accepted. Order is now ongoing.",
            error: false
        });
    } catch (error) {
        console.log(error);
        return res.status(500).send({ status: 500, data: null, message: error.message, error: true });
    }
};

// ─── POST /api/bid/:id/decline ────────────────────────────────────────────────
// Buyer declines a specific bid — sets its status to "declined".
// The bid is hidden from the buyer's future views but seller can see it declined.
const declineBid = async (req, res) => {
    try {
        const bid = await Bid.findByIdAndUpdate(
            req.params.id,
            { status: 'declined' },
            { new: true }
        );
        if (!bid) {
            return res.status(404).send({ status: 404, data: null, message: "Quotation not found", error: true });
        }
        return res.send({ status: 200, data: null, message: "Quotation declined", error: false });
    } catch (error) {
        console.log(error);
        return res.status(500).send({ status: 500, data: null, message: error.message, error: true });
    }
};

module.exports = { addBid, getBidbyOrder, getMyBids, acceptBidForOrder, declineBid };
