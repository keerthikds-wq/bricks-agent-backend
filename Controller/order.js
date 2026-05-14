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
        let term = "";
        if (req.query.term) {
            term = req.query.term;
        }
        console.log(term);
        let regex = new RegExp(`.*${term}.*`, "i");
        let obj = req.query;
        let condition = { user: req.params.id };
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
        let order = await Order.find(condition)
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
        .sort({ createdAt: 'descending' })
        .skip(limit * (page - 1))
        .limit(limit);
        let bid = await Bid.find({is_delete:0});
        let temp = {};
        let tempArray = [];
        let str = "";
        bid.map((element)=>{
            if(str != element.order){
                temp[element.order] = [element];
                str = element.order;
            }else{
                temp[element.order].push(element);
            }
        });
        // return res.send({ "status": 200, "data": product, "pagination": { pagesCount, orderCount }, "message": "Fetched all products successfully", "error": false });
        // const order = await Order.findOne({ user: req.params.id });
        return res.send({ "status": 200, "data": order, bid:temp,"pagination": { pagesCount, orderCount }, "message": "Fetched order details for " + req.params.id, "error": false });
    } catch (error) {
        console.log(error);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": false });
    }
};
const getOrderAll = async (req, res) => {
    try {
        let term = "";
        if (req.query.term) {
            term = req.query.term;
        }
        console.log(term);
        let regex = new RegExp(`.*${term}.*`, "i");
        let obj = req.query;
        let condition = { is_delete: 0 };
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
        let order = await Order.find(condition)
        .populate("user")
        .populate({
            // Single populate with all nested sub-documents — multiple separate .populate("product")
            // calls override each other (last one wins), so we must combine them here.
            path: "product",
            populate: [
                { path: "category" },
                { path: "subcategory" },
                { path: "brand" }
            ]
        })
        .populate({
            // Populate bid AND nest-populate the seller inside it so
            // Flutter can compare bid.seller._id with the logged-in seller's ID.
            path: "bid",
            populate: { path: "seller", select: "name company phone profile" }
        })
        .sort({ createdAt: 'descending' }).skip(limit * (page - 1)).limit(limit);
        // return res.send({ "status": 200, "data": product, "pagination": { pagesCount, orderCount }, "message": "Fetched all products successfully", "error": false });
        // const order = await Order.findOne({ user: req.params.id });
        return res.send({ "status": 200, "data": order, "pagination": { pagesCount, orderCount }, "message": "Fetched order details for " + req.params.id, "error": false });
    } catch (error) {
        console.log(error);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": false });
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
