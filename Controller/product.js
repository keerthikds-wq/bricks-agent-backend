const Product = require("../Model/Product");
const List = require("../Model/List");
const { fs, path, cloudinary } = require('../config');
const { unlink } = require('fs/promises');
const { randomString } = require('../Utils');
const { isValidObjectId } = require("mongoose");
const { StatusCodes } = require("http-status-codes");









const addProduct =  async(req, res) => {
    try{
        const{name, description, size, min_quantity, min_price, max_price,subtitle,manufacturer,disclaimer,category,subcategory,brand} = req.body;
    const files = req.files;
    // validate
    if(!name || !description || !size || !min_quantity || !category || !brand) return res.status(401).json({"code":401, "message":"Incomplete fields"});
    if(!files || !files.length) return res.status(401).json({"code":401, 'message':'Image is required'});
    if(!isValidObjectId(subcategory)) return res.status(401).json({"code":401, "message":"Subcategory ID is invalid"});    
    if(!isValidObjectId(category)) return res.status(401).json({"code":401, "message":"category ID is invalid"});    
    if(!isValidObjectId(brand)) return res.status(401).json({"code":401, "message":"brand ID is invalid"});    

    // upload images and add to images array
    let image = [];
    for(const file of files ){
        const imagePath = await cloudinary.uploader.upload(file.path);
        image.push({
            "public_id": imagePath.public_id,
            "secure_url": imagePath.secure_url
        });
    }

    // dietary preferance
    const newProduct = await Product.create({
        name, subcategory, image, size, min_quantity, min_price, max_price,subtitle,manufacturer,disclaimer,category,brand,
        description: description || null
    });

    res.status(201).json({"code":201, "message":"Product created", "data":newProduct});
    }
    catch(error){
        console.log(error)
    }
    
}

const addList = async(req, res) => {
    const{productid} = req.body;
    
    try {
        const usersid=req.user.id
        const data={
            productid,
            sellerid: usersid
        }
        const addlist=await List.create(data)
        if(addlist){
            res.status(StatusCodes.CREATED).json({
                status:"Success",
                message:"List Added",
                addlist
            })
        }else{
            res.status(StatusCodes.BAD-REQUEST).json({
                status:"error",
                message:"Oops! Something went wrong",
            })
        }
    } catch (error) {
        res.status(500).json({message:"error"})
    }
}














// const addProduct = async (req, res, next) => {
//     try {
//         let image = [];
//         if (req.files) {
//             if (req.files.image) {
//                 let uploadPath = process.env.PRODUCT_FOLDER;
//                 let sampleFiles = req.files.image;
//                 if (sampleFiles) {
//                     for (const [key, value] of Object.entries(sampleFiles)) {
//                         if (typeof value !== 'object') {
//                             name = randomString() + path.extname(sampleFiles.name);
//                             sampleFiles.mv(uploadPath + name);
//                             const result = await cloudinary.uploader.upload(process.env.PRODUCT_FOLDER + name);
//                             image.push(result.secure_url);
//                             // await unlink(path.join(__dirname, '.' + uploadPath + name));
//                             // console.log(`successfully deleted ${uploadPath + name}`);
//                             break;
//                         } else {
//                             name = randomString() + path.extname(value.name);
//                             value.mv(uploadPath + name);
//                             const result = await cloudinary.uploader.upload(process.env.PRODUCT_FOLDER + name);
//                             image.push(result.secure_url);
//                             // await unlink(path.join(__dirname, '.' + uploadPath + name));
//                             // await unlink(uploadPath + name);
//                             // ,.?console.log(`successfully deleted ${uploadPath + name}`);
//                         }
//                     }
//                 }
//                 if (image.length !== 0) {
//                     req.body.image = image;
//                 }
//             }
//         }
//         const product = await Product.create(req.body);
//         return res.send({ "status": 200, "data": product, "message": "Product created successfully", "error": false });
//     } catch (error) {
//         console.log(error);
//         return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": false });
//     }
// };












const updateProduct = async (req, res, next) => {
    try {
        let image = [];
        if (req.files) {
            if (req.files.image) {
                let uploadPath = process.env.PRODUCT_FOLDER;
                let sampleFiles = req.files.image;
                if (sampleFiles) {
                    for (const [key, value] of Object.entries(sampleFiles)) {
                        if (typeof value !== 'object') {
                            name = randomString() + path.extname(sampleFiles.name);
                            sampleFiles.mv(uploadPath + name);
                            const result = await cloudinary.uploader.upload(process.env.PRODUCT_FOLDER + name);
                            image.push(result.secure_url);
                            // await unlink(path.join(__dirname, '.' + uploadPath + name));
                            // console.log(`successfully deleted ${uploadPath + name}`);
                            break;
                        } else {
                            name = randomString() + path.extname(value.name);
                            value.mv(uploadPath + name);
                            const result = await cloudinary.uploader.upload(process.env.PRODUCT_FOLDER + name);
                            image.push(result.secure_url);
                            // await unlink(path.join(__dirname, '.' + uploadPath + name));
                            // await unlink(uploadPath + name);
                            // ,.?console.log(`successfully deleted ${uploadPath + name}`);
                        }
                    }
                }
                if (image.length !== 0) {
                    req.body.image = image;
                }
            }
        }
        await Product.updateOne({ _id: req.params.id }, req.body);
        const product = await Product.findOne({ _id: req.params.id });
        return res.send({ "status": 200, "data": product, "message": "Product updated successfully", "error": false });
    } catch (error) {
        console.log(error);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": false });
    }
};
const deleteProduct = async (req, res, next) => {
    try {
        const product = await Product.updateOne({ _id: req.params.id }, { is_delete: 1 });
        return res.send({ "status": 200, "data": product, "message": "Product deleted successfully", "error": false });
    } catch (error) {
        console.log(error);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": false });
    }
};
const allProduct = async (req, res, next) => {
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
        const productCount = await Product.countDocuments(condition);
        if (req.query.page) {
            page = parseInt(req.query.page);
        }
        if (req.query.limit) {
            limit = parseInt(req.query.limit);
        }
        let pagesCount = 0;
        if (productCount > limit) {
            pagesCount = productCount / limit;
            pagesCount = Math.ceil(pagesCount);
        }
        let product = await Product.find(condition).populate("subcategory").populate("category").populate("brand").sort({ createdAt: 'descending' }).or([{ 'name': regex }, { 'description': regex }]).skip(limit * (page - 1)).limit(limit);
        return res.send({ "status": 200, "data": product, "pagination": { pagesCount, productCount }, "message": "Fetched all products successfully", "error": false });
        // const product = await Product.find({ is_delete: 0 });
        // return res.send({ "status": 200, "data": product, "message": "Fetched all categories successfully", "error": false });
    } catch (error) {
        console.log(error);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": false });
    }
};

const getProduct = async (req, res, next) => {
    try {
        const product = await Product.findOne({ _id: req.params.id });
        return res.send({ "status": 200, "data": product, "message": "Fetched product details for " + req.params.id, "error": false });
    } catch (error) {
        console.log(error);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": false });
    }
};
const getProductbyUserID = async (req, res, next) => {
    try {
        const usersid=req.user.id
        const product = await List.find({ sellerid: usersid })
        .populate({path: "productid"})
        return res.send({ "status": 200, "data": product, "message": "Fetched product details", "error": false });
    } catch (error) {
        console.log(error);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": false });
    }
};

module.exports = {getProductbyUserID,addList, addProduct, updateProduct, deleteProduct, allProduct, getProduct };
