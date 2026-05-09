require("dotenv").config();
const { v2: cloudinary } = require("cloudinary");

cloudinary.config({
    cloud_name: process.env.CLOUDANARY_CLOUD_NAME,
    api_key:    process.env.CLOUDANARY_API_KEY,
    api_secret: process.env.CLOUDANARY_API_SECRET,
});

/**
 * Upload a file (local path, URL, or base64 data URI) to Cloudinary.
 * Returns { url, id } on success.
 */
const uploads = (file, folder) => {
    return new Promise((resolve, reject) => {
        cloudinary.uploader.upload(file, { resource_type: "auto", folder }, (error, result) => {
            if (error) return reject(error);
            resolve({ url: result.secure_url, id: result.public_id });
        });
    });
};

module.exports = cloudinary;
module.exports.uploads = uploads;
