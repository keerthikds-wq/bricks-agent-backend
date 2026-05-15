const Order = require("../Model/Order");
const Bid = require("../Model/Bid");
const { fs, path } = require('../config');
const { randomString } = require('../Utils');
const { StatusCodes } = require("http-status-codes");


const addOrder = async (req, res, next) => {
    // NOTE: bid is NOT required at order creation — a bid is submitted by the seller later
    const { product, quantity, longitude, latitude, address } = req.body;
    if (!product || !quantity || !longitude || !latitude || !address) {
        return res.status(StatusCodes.BAD_REQUEST).json({
            message: "product, quantity, longitude, latitude and address are required",
            status: "Failed"
        });
    }
    try {
        const data = {
            product,
            user: req.user.id,
            quantity,
            distance: "4km",
            longitude,
            latitude,
            address,
            status: "pending",
        };
        const order = await Order.create(data);
        if (order) {
            return res.status(StatusCodes.CREATED).json({
                error: false,
                status: "Success",
                message: "Order Added Successfully",
                data: order
            });
        } else {
            return res.status(StatusCodes.BAD_REQUEST).json({
                status: "Fail",
                message: "Something went wrong",
            });
        }
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: true, message: error.message });
    }


};
const getOrder = async (req, res, next) => {
    try {
        const order = await Order.findOne({ _id: req.params.id });
        return res.send({ "status": 200, "data": order, "message": "Order details for " + req.params.id, "error": false });
    } catch (error) {
        console.log(error);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": false });
    }
};



const getSellersOrders= async (req, res, next) => {
    /* try {
        const userid= req.user.id;
        const checkUser= await Order.find()
        if(checkUser){
            return "hello"
        }else{
            return "err"
        }
    }
    catch(error){
        return error;
    } */
    console.log("hello");
}




const getOrderBySeller = async (req, res, next) => {
    try {
        let term = "";
        if (req.query.term) {
            term = req.query.term;
        }
        console.log(term);
        let regex = new RegExp(`.*${term}.*`, "i");
        let obj = req.query;
        let condition = { seller: req.params.id };
        let limit = 0, page = 0;
        for (const key in obj) {
            if (key != "limit" && key != "page" && "term") {
                condition[key] = obj[key];
            }
        }
        const orderCount = await Order.countDocuments(condition);
        if (req.query.page) {
            page = parseInt(req.query.page);
        }
        if (req.query.limit) {
            limit = parseInt(req.query.limit);
        }
        let pagesCount = 0;
        if (orderCount > limit) {
            pagesCount = orderCount / limit; 
            pagesCount = Math.ceil(pagesCount);
        }
        let order = await Order.find(condition).populate("user").populate("product").sort({ createdAt: 'descending' }).skip(limit * (page - 1)).limit(limit);
        // return res.send({ "status": 200, "data": product, "pagination": { pagesCount, orderCount }, "message": "Fetched all products successfully", "error": false });
        // const order = await Order.findOne({ user: req.params.id });
        return res.send({ "status": 200, "data": order, "pagination": { pagesCount, orderCount }, "message": "Fetched order details for " + req.params.id, "error": false });
        // const order = await Order.find({ is_delete: 0 });
        return res.send({ "status": 200, "data": order, "message": "Fetched order details for " + req.params.id, "error": false });
    } catch (error) {
        console.log(error);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": false });
    }
};

const getOrderbyUser = async (req, res, next) => {
    try {
        // Only include known, safe query params in the condition.
        // Old code used for..in on req.query which dumped ALL params into MongoDB query.
        const status = req.query.status;  // e.g. "pending" | "ongoing" | "completed"
        const limit  = Math.max(0, parseInt(req.query.limit)  || 0);
        const page   = Math.max(1, parseInt(req.query.page)   || 1);

        // $ne:1 is more resilient than ===0 — catches docs where is_delete is null or missing
        const condition = { user: req.params.id, is_delete: { $ne: 1 } };
        if (status) condition.status = status;

        const orderCount = await Order.countDocuments(condition);
        const pagesCount = (limit > 0 && orderCount > limit) ? Math.ceil(orderCount / limit) : 1;
        const skip       = limit > 0 ? limit * (page - 1) : 0;

        const orders = await Order.find(condition)
            .populate("user")
            .populate({
                path: "product",
                populate: [
                    { path: "category" },
                    { path: "subcategory" },
                    { path: "brand" }
                ]
            })
            .populate({
                path: "bid",
                populate: { path: "seller", select: "name company phone profile" }
            })
            .sort({ createdAt: "descending" })
            .skip(skip)
            .limit(limit);

        // Also return a map of all bids keyed by orderId so the buyer can see bid counts
        const allBids = await Bid.find({ is_delete: { $ne: 1 } }).select("order price seller description");
        const bidMap  = {};
        allBids.forEach((b) => {
            const key = b.order?.toString();
            if (!key) return;
            if (!bidMap[key]) bidMap[key] = [];
            bidMap[key].push(b);
        });

        console.log(`getOrderbyUser: user=${req.params.id}, status=${status||'any'}, found=${orders.length}`);

        return res.send({
            "status": 200,
            "data":   orders,
            "bid":    bidMap,
            "pagination": { pagesCount, orderCount },
            "message": `Fetched ${orders.length} order(s) for user ${req.params.id}`,
            "error": false
        });
    } catch (error) {
        console.log("getOrderbyUser error:", error);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": true });
    }
};

const getOrderAll = async (req, res) => {
    try {
        // IMPORTANT: Only read known query params explicitly.
        // Old code used `for..in` on req.query and added every param to the MongoDB
        // condition — this meant unknown or extra params could silently break the query.
        const status = req.query.status;  // "pending" | "ongoing" | "completed" | undefined
        const limit  = Math.max(0, parseInt(req.query.limit)  || 0);
        const page   = Math.max(1, parseInt(req.query.page)   || 1);

        // Use $ne:1 instead of ===0 so documents where is_delete is null/missing also match.
        const condition = { is_delete: { $ne: 1 } };
        if (status) condition.status = status;

        const orderCount = await Order.countDocuments(condition);
        const pagesCount = (limit > 0 && orderCount > limit) ? Math.ceil(orderCount / limit) : 1;
        const skip       = limit > 0 ? limit * (page - 1) : 0;

        const orders = await Order.find(condition)
            .populate("user")
            .populate({
                path: "product",
                populate: [
                    { path: "category" },
                    { path: "subcategory" },
                    { path: "brand" }
                ]
            })
            .populate({
                path: "bid",
                populate: { path: "seller", select: "name company phone profile" }
            })
            .sort({ createdAt: "descending" })
            .skip(skip)
            .limit(limit);

        console.log(`getOrderAll: status=${status||'any'}, limit=${limit}, page=${page}, found=${orders.length}, total=${orderCount}`);

        return res.send({
            "status": 200,
            "data":   orders,
            "pagination": { pagesCount, orderCount },
            "message": `Fetched ${orders.length} order(s)`,
            "error": false
        });
    } catch (error) {
        console.log("getOrderAll error:", error);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": true });
    }
};

const changeStatus=async (req, res, next) => {
    try{
        const orderid=req.params.id
        const updaters=await Order.findById(orderid)
        //console.log(updaters)
        if(updaters){
            const updates=await Order.findByIdAndUpdate(orderid,{status:"completed"},{new:true})
            if(updates){
                res.status(StatusCodes.OK).json({
                    message: "Order Completed Successfully",
                    status: StatusCodes.OK,
                    updates
                })
            }else{
                res.status(StatusCodes.BAD_REQUEST).json({
                    message: "SOmething Went Wrong",
                    status: StatusCodes.BAD_REQUEST
                })
            }

        }else{
            res.status(StatusCodes.NOT_FOUND).json({
                message: "Invalid Order ID",
                status: StatusCodes.NOT_FOUND
            })
        }
    }
    catch (error) {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(error)
    }
}


module.exports = { changeStatus, getSellersOrders, addOrder, getOrder, getOrderbyUser, getOrderBySeller, getOrderAll };
