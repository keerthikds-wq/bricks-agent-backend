const { jwt, sg_mail, md5, fs, path,app } = require('../config');
const Seller = require("../Model/Seller");
const Otp = require('../Model/Otp');
const { randomString } = require('../Utils');
const axios = require('axios');
const { sendOtp } = require("../Utils/sms");
const cloudinary = require("../Utils/cloudinary");

const loginSeller = async (req, res, next) => {
    const { phone } = req.body;
    if (!phone) {
        return res.status(400).send({ "status": 400, "data": null, "message": "Phone number is required", "error": true });
    }
    try {
        const otpnum = Math.floor(1000 + Math.random() * 9000);
        await Otp.updateMany({ phone }, { "is_delete": 1 });
        await Otp.create({ Otp: otpnum, phone });
        // Fire SMS asynchronously — respond in <200ms regardless of SMS status
        sendOtp(phone, otpnum).catch(err => console.error('SMS async error:', err));
        console.log(`OTP generated for seller ${phone}: ${otpnum}`);
        return res.send({ "status": 200, "message": "OTP sent successfully", "error": false });
    } catch (error) {
        console.error("loginSeller error:", error.message);
        return res.status(500).send({ "status": 500, "data": null, "message": "Something went wrong. Please try again.", "error": true });
    }
}
const signupSeller = async (req, res, next) => {

    try {
        if (await Seller.exists({phone:req.body.phone})) {
            return res.status(401).send({ "status": 401, "data": null,  "message": "Seller already exists", "error": false });
        }
        const result=await cloudinary.uploader.upload(req.file.path)      
                    const data = await new Seller({
                        name:req.body.name,
                        email:req.body.email,
                        phone:req.body.phone,
                        pincode:req.body.pincode,
                        profile:result.secure_url,
                        gst:req.body.gst,
                        longitude:req.body.longitude,
                        latitude:req.body.latitude,
                        address:req.body.address,
                    });
       
  
                //let uploadPath = process.env.PRODUCT_FOLDER;
                //let sampleFiles = req.files.profile;
                //const result = await cloudinary.uploader.upload(req.file.path);
                // if (sampleFiles) {
                //     pictureimage = randomString() + path.extname(sampleFiles.name);
                //     //sampleFiles.mv(uploadPath + name);
                    
                //     profile = result.secure_url;
                //     // await unlink(path.join(__dirname, '.' + uploadPath + name));
                //     // console.log(`successfully deleted ${uploadPath + name}`);
                // }
             
                    //req.body.profile = result.secure_url;
               
            
       
        const seller = await data.save();
        console.log(seller)


        //let token = jwt.sign({ seller }, process.env.SECRET);
        const token = jwt.sign({
            id:seller._id,
            email:seller.email,
            phone:seller.phone,
            isSeller:seller.isSeller,
        }, process.env.SECRET, { expiresIn: "3d" });


        return res.send({ "status": 200, "data": seller,token, "message": "Seller created successfully", "error": false });
    } catch (error) {
        console.log(error);
        return res.status(401).send({ "status": 401, "data": null, "message": "Something went wrong!", "error": true });
    }
}
const emailVerify = async (req, res, next) => {
    const { email } = req.body;
    try {
        const seller = await Seller.findOne({ email, is_delete: 0 });
        if (!seller) {
            return res.status(401).send({ "status": 401, "data": null, "message": "Seller not found", "error": true });
        }
        let otpnum = Math.floor(1000 + Math.random() * 9000);
        await Otp.updateMany({ "is_delete": 1 });
        const otp = await Otp.create({
            Otp: otpnum,
            seller: seller.id,
            email
        });
        sendOtp(phone, otpnum).catch(err => console.error("SMS async error:", err));
        /* const dynamic = `Your OTP for login to Bricks Agent account is ${otpnum}. It is valid for 10 mins.\nBricks Agent Team.\n(A Product of Swami Vivekananda Technologies Pvt Ltd).`
        const url = 'https://api.textlocal.in/send/?apiKey=NzQ0MzdhNjU1NjU2MzY2MTZkNDEzOTYyNTQ0Mzc4NmU=&numbers=' + phone + '&sender=SVTPLC&message=' + encodeURIComponent(dynamic);
                        axios
                            .get(url)
                            .then(function (response) {
                                console.log('entered second');
                                console.log(response.data);
                            })
                            .catch(function (error) {
                                console.log(error);
                            }); */
        const msg = {
            to: seller.email, // Change to your recipient
            from: process.env.EMAIL, // Change to your verified sender
            subject: 'email verify',
            text: 'OTP : ' + otp.Otp,
            html: '<strong>OTP : ' + otp.Otp + '</strong>',
        }
        sg_mail.send(msg).then(() => {
            console.log('Email sent');
            return res.send({ "status": 200, "message": "Otp send successfully", "error": false });
        }).catch((error) => {
            console.error(error)
            return res.status(500).send({ "status": 500, "message": "Otp send Failed", "error": true });
        });
    } catch (error) {
        console.log(error.message);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": true });
    }

}
const otpVerifyLogin = async (req, res, next) => {
    const { phone, otp } = req.body;
    // Master OTP bypass for testing — remove before production
    const MASTER_OTP = "0000";
    try {
        // Allow master OTP to bypass DB lookup entirely
        if (String(otp) === MASTER_OTP) {
            const seller = await Seller.findOne({ phone, is_delete: 0 });
            if (seller) {
                app.set("data", { user: seller, uuid: md5(randomString()) });
                const token = jwt.sign({
                    id: seller._id,
                    email: seller.email,
                    phone: seller.phone,
                    isSeller: seller.isSeller,
                }, process.env.SECRET, { expiresIn: "3d" });
                return res.send({ "status": 200, "data": seller, token, "exist": true, "message": "Otp verified successfully", "error": false });
            }
            return res.send({ "status": 200, "data": null, "exist": false, "message": "Otp verified successfully", "error": false });
        }

        const o = await Otp.findOne({ phone, "is_delete": 0 });
        if (!o) {
            return res.status(401).send({ "status": 401, "data": null, "message": "OTP not found or already used. Please request a new OTP.", "error": true });
        }
        const expiry = new Date(new Date(o.createdAt).getTime() + (5 * 60000));
        if (new Date() > expiry) {
            return res.send({ "status": 200, "data": null, "message": "Otp timed-out", "error": false });
        }
        if (String(otp) !== String(o.Otp)) {
            return res.status(401).send({ "status": 401, "data": null, "message": "Otp verification failed", "error": true });
        }

        const seller = await Seller.findOne({ phone, is_delete: 0 });
        if (seller) {
            app.set("data", { user: seller, uuid: md5(randomString()) });
            const token = jwt.sign({
                id: seller._id,
                email: seller.email,
                phone: seller.phone,
                isSeller: seller.isSeller,
            }, process.env.SECRET, { expiresIn: "3d" });
            return res.send({ "status": 200, "data": seller, token, "exist": true, "message": "Otp verified successfully", "error": false });
        }
        return res.send({ "status": 200, "data": null, "exist": false, "message": "Otp verified successfully", "error": false });
    } catch (error) {
        console.error("seller otpVerifyLogin error:", error.message);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": true });
    }
}
const otpVerify = async (req, res, next) => {
    const { phone, otp } = req.body;
    try {
        const o = await Otp.findOne({ phone, "is_delete": 0 });
        if (!o) {
            return res.status(401).send({ "status": 401, "data": null, "message": "OTP not found or already used. Please request a new OTP.", "error": true });
        }
        const expiry = new Date(new Date(o.createdAt).getTime() + (5 * 60000));
        if (new Date() > expiry) {
            return res.send({ "status": 401, "data": null, "mes