const Order = require("../Model/Order");
const Bid = require("../Model/Bid");
const { fs, path } = require('../config');
const { randomString } = require('../Utils');
const { StatusCodes } = require("http-status-codes");


const addOrder = async (req, res, next) => {

    const {product,user,bid,quantity,longitude,latitude,address} = req.body
    if(product==''|| user=='' || bid=='' || quantity=='' || longitude=='' || latitude=='' || address==''){
        return res.status(StatusCodes.BAD_REQUEST).json({
            message:"Empty Field not Allowed",
            status:"Failed"
        });
    }else{
        try {
                const data={
                    product,
                    user:req.user.id,
                    bid,
                    quantity,
                    distance:"4km",
                    longitude,
                    latitude,
                    address,
                };
                const updateer=await Order.create(data)
                if(updateer){
                    res.status(StatusCodes.CREATED).json({
                        error: false,
                        status:"Success",
                        message:"Order Added Successfully",
                        data
                    })
                }else{
                    res.status(StatusCodes.BAD_REQUEST).json({
                        status:"Fail",
                        message:"Something went wrong",
                    })
                }
               
        
        } catch (error) {
            console.log(error)
            res.status(500).json(error)
        }  
    } 









   /*  try {
        const order = await Order.create(req.body);
        return res.send({ "status": 200, "data": order, "message": "Order created successfully", "error": false });
    } catch (error) {
        console.log(error);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": false });
    } */
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
        .populate("product")
        .populate("bid")
       /*  .populate({
            path: 'seller',
            populate: {
              path: 'bid',
              model: 'bid'
            }
          }) */


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
        .populate("product")
        .populate("bid")
        .populate({
            path:"product",
            model:'product',
            populate:{
                path:"category",
                model:'category'
            }
        })
        .populate({
            path:"product",
            model:'product',
            populate:{
                path:"subcategory",
                model:'subcategory'
            }
        })
        .populate({
            path:"product",
            model:'product',
            populate:{
                path:"brand",
                model:'brand'
            }
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
