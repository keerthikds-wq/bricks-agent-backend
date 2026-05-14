const Bid = require("../Model/Bid");
const Order = require("../Model/Order");
const { fs, path } = require('../config');
const { randomString } = require('../Utils');
const addBid = async (req, res, next) => {
    try {
        const bid = await Bid.create(req.body);
        return res.send({ "status": 200, "data": bid, "message": "Bid created successfully", "error": false });
    } catch (error) {
        console.log(error);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": false });
    }
};

const getBidbyOrder = async (req, res) => {
    try {
        let bids = await Bid.find({ order: req.params.id, is_delete: 0 })
            .populate("order")
            .populate({ path: "seller", select: "name company phone profile" });

        // Bid.find() always returns an array (never null), so empty = no bids yet
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