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
        let bid = await Bid.find({ order: req.params.id })
        .populate("order");
        if (!bid) {
            return res.status(404).send({ "status": 404, "data": null, "message": "No bid yet" });
            /* bid=[]; */
        }
        return res.send({ 
            "status": 200, 
            "data":bid, 
            "message": "Fetched bid details for " 
            + req.params.id, 
            "error": false
         });
    } catch (error) {
        console.log(error);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": false });
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