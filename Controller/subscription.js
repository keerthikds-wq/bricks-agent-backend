const { app, express, jwt, sg_mail, fs, path } = require("../config");
const router = express.Router();

const Subscription = require("../Model/Subscription");

const addSubscription = async (req, res, next) => {
    try {
        const subscription = await Subscription.create(req.body);
        return res.send({ "status": 200, "data": subscription, "message": "Subscription created successfully", "error": false });
    } catch (error) {
        console.log(error);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": false });
    }
};
const updateSubscription = async (req, res, next) => {
    try {
        await Subscription.updateOne({ _id: req.params.id }, req.body);
        const subscription = await Subscription.findOne({ _id: req.params.id });
        return res.send({ "status": 200, "data": subscription, "message": "Subscription updated successfully", "error": false });
    } catch (error) {
        console.log(error);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": false });
    }
};
const deleteSubscription = async (req, res, next) => {
    try {
        const subscription = await Subscription.updateOne({ _id: req.params.id }, { is_delete: 1 });
        return res.send({ "status": 200, "data": subscription, "message": "Subscription deleted successfully", "error": false });
    } catch (error) {
        console.log(error);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": false });
    }
};
const allSubscription = async (req, res, next) => {
    try {
        let obj = req.query;
        let condition = { is_delete: 0 };
        let limit = 0, page = 0;
        for (const key in obj) {
            if (key != "limit" && key != "page" && "term") {
                condition[key] = obj[key];
            }
        }
        const subscriptionCount = await Subscription.count(condition);
        if (req.query.page) {
            page = parseInt(req.query.page);
        }
        if (req.query.limit) {
            limit = parseInt(req.query.limit);
        }
        let pagesCount = 0;
        if (subscriptionCount > limit) {
            pagesCount = subscriptionCount / limit;
            pagesCount = Math.ceil(pagesCount);
        }
        let subscription = await Subscription.find(condition).skip(limit * (page - 1)).limit(limit);
        return res.send({ "status": 200, "data": subscription, "pagination": { pagesCount, subscriptionCount }, "message": "Fetched all subscription successfully", "error": false });
    } catch (error) {
        console.log(error);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": false });
    }
};

const getSubscription = async (req, res, next) => {
    try {
        const subscription = await Subscription.findOne({ _id: req.params.id });
        return res.send({ "status": 200, "data": subscription, "message": "Fetched subscription details for " + req.params.id, "error": false });
    } catch (error) {
        console.log(error);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": false });
    }
};

module.exports = { addSubscription, updateSubscription, deleteSubscription, allSubscription, getSubscription };