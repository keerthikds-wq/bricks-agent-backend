const Subcategory = require("../Model/Subcategory");
const { fs, path } = require('../config');
const { randomString } = require('../Utils');
const {ObjectId}=require('mongodb')

const addSubcategory = async (req, res, next) => {
    try {
        const subcategory = await Subcategory.create(req.body);
        return res.send({ "status": 200, "data": subcategory, "message": "Subcategory created successfully", "error": false });
    } catch (error) {
        console.log(error);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": false });
    }
};
const updateSubcategory = async (req, res, next) => {
    try {
        await Subcategory.updateOne({ _id: req.params.id }, req.body);
        const subcategory = await Subcategory.findOne({ _id: req.params.id });
        return res.send({ "status": 200, "data": subcategory, "message": "Subcategory updated successfully", "error": false });
    } catch (error) {
        console.log(error);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": false });
    }
};
const deleteSubcategory = async (req, res, next) => {
    try {
        const subcategory = await Subcategory.updateOne({ _id: req.params.id }, { is_delete: 1 });
        return res.send({ "status": 200, "data": subcategory, "message": "Subcategory deleted successfully", "error": false });
    } catch (error) {
        console.log(error);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": false });
    }
};
const allSubcategory = async (req, res, next) => {
    try {
        const subcategory = await Subcategory.find({ is_delete: 0 });
        return res.send({ "status": 200, "data": subcategory, "message": "Fetched all categories successfully", "error": false });
    } catch (error) {
        console.log(error);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": false });
    }
};

const getSubcategory = async (req, res, next) => {
    try {
        const subcategory = await Subcategory.findOne({ _id: req.params.id },{ is_delete: 0 });
        return res.send({ "status": 200, "data": subcategory, "message": "Fetched subcategory details for " + req.params.id, "error": false });
    } catch (error) {
        console.log(error);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": false });
    }
};
const getSubcategoryByCategory = async (req, res, next) => {
    



    const counters=0
    const checkID=req.params.category
    try {
        const displayAvailable=await Subcategory.aggregate([
            {
              '$match': {
                'is_delete': 0, 
                'category': new ObjectId(checkID)
              }
            },
            // {
            //     $project: {
            //       _id: 0,
            //       name: 1,
            //       category: 1,
            //       createdAt: 1
            //     }
            //   }
          ])

          res.status(200).json({
            data:displayAvailable,
            message: "Fetched subcategory details for category",
            status: 200,
            
          }) 
          //console.log(displayAvailable)

        return displayAvailable;

        // const subcategory = await Subcategory.find({category:checkID},{ is_delete: counters });
        // return res.send({ "status": 200, "data": subcategory, "message": "Fetched subcategory details for category : " + req.params.id, "error": false });
    } catch (error) {
        console.log(error);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": false });
    }
};
module.exports = { addSubcategory, updateSubcategory, deleteSubcategory, allSubcategory, getSubcategory, getSubcategoryByCategory };