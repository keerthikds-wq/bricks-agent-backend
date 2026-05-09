const { app, express, jwt, sg_mail, fs, path } = require("../config");
const router = express.Router();

const SubscriptionLog = require("../Model/SubscriptionLog");

const addSubscriptionLog = async (req, res, next) => {
    try {
        if (await SubscriptionLog.exists(req.body)) {
            return res.send({ "status": 200, "data": null, "message": "SubscriptionLog already exist", "error": false });
        }
        const subscriptionLog = await SubscriptionLog.create(req.body);
        return res.send({ "status": 200, "data": subscriptionLog, "message": "SubscriptionLog created successfully", "error": false });
    } catch (error) {
        console.log(error);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": false });
    }
};
const allSubscriptionLog = async (req, res, next) => {
    try {
        let obj = req.query;
        let condition = { is_delete: 0 };
        let limit = 0, page = 0;
        for (const key in obj) {
            if (key != "limit" && key != "page" && "term") {
                condition[key] = obj[key];
            }
        }
        const subscriptionCount = await SubscriptionLog.count(condition);
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
        let subscriptionLog = await SubscriptionLog.find(condition).skip(limit * (page - 1)).limit(limit);
        return res.send({ "status": 200, "data": subscriptionLog, "pagination": { pagesCount, subscriptionCount }, "message": "Fetched all subscriptionLog successfully", "error": false });
    } catch (error) {
        console.log(error);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": false });
    }
};

const getSubscriptionLog = async (req, res, next) => {
    try {
        const subscriptionLog = await SubscriptionLog.findOne({ _id: req.params.id });
        return res.send({ "status": 200, "data": subscriptionLog, "message": "Fetched subscriptionLog details for " + req.params.id, "error": false });
    } catch (error) {
        console.log(error);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": false });
    }
};

module.exports = { addSubscriptionLog, allSubscriptionLog, getSubscriptionLog };