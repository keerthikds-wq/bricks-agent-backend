const mongoose = require("mongoose");
require("dotenv").config();

module.exports = connect = async () => {
    try {
        await mongoose.connect(process.env.URL);
        console.log("MongoDB connected successfully");
    } catch (error) {
        console.error("MongoDB connection error:", error.message);
        process.exit(1);
    }
};
