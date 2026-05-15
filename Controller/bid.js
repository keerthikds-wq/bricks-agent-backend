const Bid = require("../Model/Bid");
const Order = require("../Model/Order");
const { fs, path } = require('../config');
const { randomString } = require('../Utils');

const addBid = async (req, res, next) => {
    // seller is always taken from the verified JWT — never from req.body.
    // This prevents any client from submitting a bid on behalf of another seller.
    const { order, description, price, representative_name, representative_no, delivery_date } = req.body;

    if (!order || price === undefined || price === null || price === '') {
        return res.status(400).send({
            "status": 400, "data": null,
            "message": "order and price are required",
            "error": true
        });
    }

    try {
        const bid = await Bid.create({
            order,
            seller: req.user.id,       // from verified JWT, not req.body
            price: Number(price),
            description: description || "",
            representative_name: representative_name || "",
            representative_no: representative_no || null,
            delivery_date: delivery_date || null,
        });
        return res.send({ "status": 200, "data": bid, "message": "Bid created successfully", "error": false });
    } catch (error) {
        console.log(error);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": true });
    }
};

const getBidbyOrder = async (req, res) => {
    try {
        // Use $ne:1 so bids without is_delete field still appear.
        // Sort by price ascending — rank #1 = lowest/best price for the buyer.
        let bids = await Bid.find({ order: req.params.id, is_delete: { $ne: 1 } })
            .populate("order")
            .populate({ path: "seller", select: "name company phone profile" })
            .sort({ price: 1 });

        return res.send({
            "status": 200,
            "data": bids,
            "message": bids.length === 0
                ? "No bids yet for order " + req.params.id
                : "Fetched " + bids.length + " bid(s) for order " + req.params.id,
            "error": false
        });
    } catch (error) {
        console.log(error);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": true });
    }
};

const acceptBidForOrder = async (req, res, next) => {
    try {
        const order = await Order.updateOne({ _id: req.body.order }, { bid: req.body.bid, status: "ongoing" });
        return res.send({ "status": 200, "data": order, "message": "order updated with bid " + req.body.bid + " successfully", "error": false });
    } catch (error) {
        console.log(error);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": false });
    }
};


module.exports = { addBid, getBidbyOrder, acceptBidForOrder };
