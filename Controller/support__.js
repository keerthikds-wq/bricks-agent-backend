// const Order = require("../Model/Order");
// const { fs, path } = require('../config');
// const { randomString } = require('../Utils');
// const addOrder = async (req, res, next) => {
//     try {
//         const order = await Order.create(req.body);
//         return res.send({ "status": 200, "data": order, "message": "Order created successfully", "error": false });
//     } catch (error) {
//         console.log(error);
//         return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": false });
//     }
// };
// const getOrder = async (req, res, next) => {
//     try {
//         const order = await Order.findOne({ _id: req.params.id });
//         return res.send({ "status": 200, "data": order, "message": "Order details for " + req.params.id, "error": false });
//     } catch (error) {
//         console.log(error);
//         return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": false });
//     }
// };

// const getOrderBySeller = async (req, res, next) => {
//     try {
//         let term = "";
//         if (req.query.term) {
//             term = req.query.term;
//         }
//         console.log(term);
//         let regex = new RegExp(`.*${term}.*`, "i");
//         let obj = req.query;
//         let condition = { seller: req.params.id };
//         let limit = 0, page = 0;
//         for (const key in obj) {
//             if (key != "limit" && key != "page" && "term") {
//                 condition[key] = obj[key];
//             }
//         }
//         const orderCount = await Order.count(condition);
//         if (req.query.page) {
//             page = parseInt(req.query.page);
//         }
//         if (req.query.limit) {
//             limit = parseInt(req.query.limit);
//         }
//         let pagesCount = 0;
//         if (orderCount > limit) {
//             pagesCount = orderCount / limit;
//             pagesCount = Math.ceil(pagesCount);
//         }
//         let order = await Order.find(condition).populate("user").populate("product").populate("bid").sort({ createdAt: 'descending' }).skip(limit * (page - 1)).limit(limit);
//         // return res.send({ "status": 200, "data": product, "pagination": { pagesCount, orderCount }, "message": "Fetched all products successfully", "error": false });
//         // const order = await Order.findOne({ user: req.params.id });
//         return res.send({ "status": 200, "data": order, "pagination": { pagesCount, orderCount }, "message": "Fetched order details for " + req.params.id, "error": false });
//         // const order = await Order.find({ is_delete: 0 });
//         return res.send({ "status": 200, "data": order, "message": "Fetched order details for " + req.params.id, "error": false });
//     } catch (error) {
//         console.log(error);
//         return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": false });
//     }
// };

// const getOrderbyUser = async (req, res, next) => {
//     try {
//         let term = "";
//         if (req.query.term) {
//             term = req.query.term;
//         }
//         console.log(term);
//         let regex = new RegExp(`.*${term}.*`, "i");
//         let obj = req.query;
//         let condition = { user: req.params.id };
//         let limit = 0, page = 0;
//         for (const key in obj) {
//             if (key != "limit" && key != "page" && "term") {
//                 condition[key] = obj[key];
//             }
//         }
//         const orderCount = await Order.count(condition);
//         if (req.query.page) {
//             page = parseInt(req.query.page);
//         }
//         if (req.query.limit) {
//             limit = parseInt(req.query.limit);
//         }
//         let pagesCount = 0;
//         if (orderCount > limit) {
//             pagesCount = orderCount / limit;
//             pagesCount = Math.ceil(pagesCount);
//         }
//         let order = await Order.find(condition).populate("user").populate("product").populate("bid").sort({ createdAt: 'descending' }).skip(limit * (page - 1)).limit(limit);
//         // return res.send({ "status": 200, "data": product, "pagination": { pagesCount, orderCount }, "message": "Fetched all products successfully", "error": false });
//         // const order = await Order.findOne({ user: req.params.id });
//         return res.send({ "status": 200, "data": order, "pagination": { pagesCount, orderCount }, "message": "Fetched order details for " + req.params.id, "error": false });
//     } catch (error) {
//         console.log(error);
//         return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": false });
//     }
// };
// const getOrderAll = async (req, res, next) => {
//     try {
//         let term = "";
//         if (req.query.term) {
//             term = req.query.term;
//         }
//         console.log(term);
//         let regex = new RegExp(`.*${term}.*`, "i");
//         let obj = req.query;
//         let condition = { is_delete: 0 };
//         let limit = 0, page = 0;
//         for (const key in obj) {
//             if (key != "limit" && key != "page" && "term") {
//                 condition[key] = obj[key];
//             }
//         }
//         const orderCount = await Order.count(condition);
//         if (req.query.page) {
//             page = parseInt(req.query.page);
//         }
//         if (req.query.limit) {
//             limit = parseInt(req.query.limit);
//         }
//         let pagesCount = 0;
//         if (orderCount > limit) {
//             pagesCount = orderCount / limit;
//             pagesCount = Math.ceil(pagesCount);
//         }
//         let order = await Order.find(condition).populate("user").populate("product").populate("bid").sort({ createdAt: 'descending' }).skip(limit * (page - 1)).limit(limit);
//         // return res.send({ "status": 200, "data": product, "pagination": { pagesCount, orderCount }, "message": "Fetched all products successfully", "error": false });
//         // const order = await Order.findOne({ user: req.params.id });
//         return res.send({ "status": 200, "data": order, "pagination": { pagesCount, orderCount }, "message": "Fetched order details for " + req.params.id, "error": false });
//     } catch (error) {
//         console.log(error);
//         return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": false });
//     }
// };


// module.exports = { addOrder, getOrder, getOrderbyUser, getOrderBySeller, getOrderAll };