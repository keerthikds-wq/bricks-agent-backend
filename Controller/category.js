const Category = require("../Model/Category");
const { fs, path, cloudinary} = require('../config');
const { randomString } = require('../Utils');
const addCategory = async (req, res, next) => {
    try {
       
        const adminid=req.user.id;
        const result=await cloudinary.uploader.upload(req.file.path)      
        const data = await new Category({
            name:req.body.name,
            created_by:adminid,
            image:result.secure_url,
            cloudinaryid:result.public_id
        });




        // if (req.files) {
        //     if (req.files.image) {
        //         let uploadPath = process.env.PRODUCT_FOLDER;
        //         let sampleFiles = req.files.image;
        //         if (sampleFiles) {
        //             name = randomString() + path.extname(sampleFiles.name);
        //             sampleFiles.mv(uploadPath + name);
        //             const result = await cloudinary.uploader.upload(process.env.PRODUCT_FOLDER + name);
        //             image = result.secure_url;
        //             // await unlink(path.join(__dirname, '.' + uploadPath + name));
        //             // console.log(`successfully deleted ${uploadPath + name}`);
        //         }
        //         if (image) {
        //             req.body.image = image;
        //         }
        //     }
        // }
        const category = await data.save();
        return res.send({ "status": 200, "data": category, "message": "Category created successfully", "error": false });
    } catch (error) {
        console.log(error);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": false });
    }
};
const updateCategory = async (req, res, next) => {
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
        await Category.updateOne({ _id: req.params.id }, req.body);
        const category = await Category.findOne({ _id: req.params.id });
        return res.send({ "status": 200, "data": category, "message": "Category updated successfully", "error": false });
    } catch (error) {
        console.log(error);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": false });
    }
};
const deleteCategory = async (req, res, next) => {
    try {
        const category = await Category.updateOne({ _id: req.params.id }, { is_delete: 1 });
        return res.send({ "status": 200, "data": category, "message": "Category deleted successfully", "error": false });
    } catch (error) {
        console.log(error);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": false });
    }
};
const allCategory = async (req, res, next) => {
    try {
        const category = await Category.find({ is_delete: 0 });
        return res.send({ "status": 200, "data": category, "message": "Fetched all categories successfully", "error": false });
    } catch (error) {
        console.log(error);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": false });
    }
};

const getCategory = async (req, res, next) => {
    try {
        const category = await Category.findOne({ _id: req.params.id });
        return res.send({ "status": 200, "data": category, "message": "Fetched category details for " + req.params.id, "error": false });
    } catch (error) {
        console.log(error);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": false });
    }
};

module.exports = { addCategory, updateCategory, deleteCategory, allCategory, getCategory };