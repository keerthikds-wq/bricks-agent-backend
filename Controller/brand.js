const Brand = require("../Model/Brand");
const { fs, path,cloudinary } = require('../config');
const { randomString } = require('../Utils');
const addBrand = async (req, res, next) => {
    try{
        const adminid=req.user.id;
        const result=await cloudinary.uploader.upload(req.file.path)      
        const data = await new Brand({
            name:req.body.name,
            created_by:adminid,
            image:result.secure_url,
            cloudinaryid:result.public_id
        });
        const brand = await data.save();
        return res.send({ "status": 200, "data": brand, "message": "Brand created successfully", "error": false });
    }
    catch(error){
        console.log(error);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": false });
    }
};
const updateBrand = async (req, res, next) => {
    try {
        let image = "";
        if (req.files) {
            if (req.files.image) {
                let uploadPath = process.env.PRODUCT_FOLDER;
                let sampleFiles = req.files.image;
                if (sampleFiles) {
                    name = randomString() + path.extname(sampleFiles.name);
                    sampleFiles.mv(uploadPath + name);
                    const result = await cloudinary.uploader.upload(process.env.PRODUCT_FOLDER + name);
                    image = result.secure_url;
                    // await unlink(path.join(__dirname, '.' + uploadPath + name));
                    // console.log(`successfully deleted ${uploadPath + name}`);
                }
                if (image) {
                    req.body.image = image;
                }
            }
        }
        await Brand.updateOne({ _id: req.params.id }, req.body);
        const brand = await Brand.findOne({ _id: req.params.id });
        return res.send({ "status": 200, "data": brand, "message": "Brand updated successfully", "error": false });
    } catch (error) {
        console.log(error);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": false });
    }
};
const deleteBrand = async (req, res, next) => {
    try {
        const brand = await Brand.updateOne({ _id: req.params.id }, { is_delete: 1 });
        return res.send({ "status": 200, "data": brand, "message": "Brand deleted successfully", "error": false });
    } catch (error) {
        console.log(error);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": false });
    }
};
const allBrand = async (req, res, next) => {
    try {
        const brand = await Brand.find({ is_delete: 0 });
        return res.send({ "status": 200, "data": brand, "message": "Fetched all categories successfully", "error": false });
    } catch (error) {
        console.log(error);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": false });
    }
};

const getBrand = async (req, res, next) => {
    try {
        const brand = await Brand.findOne({ _id: req.params.id });
        return res.send({ "status": 200, "data": brand, "message": "Fetched brand details for " + req.params.id, "error": false });
    } catch (error) {
        console.log(error);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": false });
    }
};

module.exports = { addBrand, updateBrand, deleteBrand, allBrand, getBrand };