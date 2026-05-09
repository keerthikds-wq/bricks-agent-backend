const { jwt, sg_mail, md5, fs, path, app,cloudinary } = require('../config');
const User = require("../Model/User");
const Otp = require('../Model/Otp');
const { randomString } = require('../Utils');
const axios = require('axios');
const { sendOtp } = require("../Utils/sms");


const loginUser = async (req, res, next) => {
    const { phone } = req.body;
    try {
        const otpnum = Math.floor(1000 + Math.random() * 9000);
        await Otp.updateMany({ phone }, { "is_delete": 1 });
        await Otp.create({
            Otp: otpnum,
            phone
        });
        await sendOtp(phone, otpnum);

    /*  const dynamic = `Hi,\n\nYour OTP for login to Bricks Agent account is ${otpnum}. It is valid for 10 mins.\n\nBricks Agent Team.\n(A Product of Swami Vivekananda Technologies Pvt Ltd).`
        const url = 'https://api.textlocal.in/send/?apiKey=NzQ0MzdhNjU1NjU2MzY2MTZkNDEzOTYyNTQ0Mzc4NmU=&numbers=' + phone + '&sender=SVTPLC&message=' + encodeURIComponent(dynamic);
                        axios
                            .get(url)
                            .then(function (response) {
                                console.log('entered second');
                                console.log(response.status);
                                console.log(phone)
                            })
                            .catch(function (error) {
                                console.log(error);
                            }); */
                            console.log(phone)
                            return res.send({ "status": 200, "message": "OTP sent successfully", "error": false });
                           
    } catch (error) {
        console.log(error.message);
        return res.status(401).send({ "status": 401, "data": null, "message": "Something went wrong!", "error": true });
    }
}
const signupUser = async (req, res, next) => {
    try {
        if (await User.exists({phone:req.body.phone})) {
            return res.status(401).send({ "status": 401, "data": null,  "message": "User already exists", "error": false });
        }
        const result=await cloudinary.uploader.upload(req.file.path)      
                    const data = await new User({
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
        // let profile = "";
        // if (req.files) {
        //     if (req.files.profile) {
        //         let uploadPath = process.env.PRODUCT_FOLDER;
        //         let sampleFiles = req.files.profile;
        //         if (sampleFiles) {
        //             name = randomString() + path.extname(sampleFiles.name);
        //             sampleFiles.mv(uploadPath + name);
        //             const result = await cloudinary.uploader.upload(process.env.PRODUCT_FOLDER + name);
        //             profile = result.secure_url;
        //             // await unlink(path.join(__dirname, '.' + uploadPath + name));
        //             // console.log(`successfully deleted ${uploadPath + name}`);
        //         }
        //         if (profile) {
        //             req.body.profile = profile;
        //         }
        //     }
        // }
       
        const user = await data.save();
        //let string = randomString();
        const token = jwt.sign({
            id:user._id,
            email:user.email,
            phone:user.phone,
            isUser:user.isUser,
        }, process.env.SECRET, { expiresIn: "3d" });
        //let token = jwt.sign({ user, uuid: md5(string) }, process.env.SECRET);
        console.log(token,user);
        return res.send({ "status": 200, "data": user, token, "message": "User created successfully", "error": false });
    } catch (error) {
        console.log(error.message);
        return res.status(401).send({ "status": 401, "data": null, "message": "Something went wrong!", "error": true });
    }
}
const emailVerify = async (req, res, next) => {
    const { email } = req.body;
    try {
        const user = await User.findOne({ email, is_delete: 0 });
        if (!user) {
            return res.status(401).send({ "status": 401, "data": null, "message": "User not found", "error": true });
        }
        let otpnum = Math.floor(1000 + Math.random() * 9000);
        await Otp.updateMany({ "is_delete": 1 });
        const otp = await Otp.create({
            Otp: otpnum,
            email
        });
        await sendOtp(phone, otpnum);
       /*  const dynamic = `Your OTP for login to Bricks Agent account is ${otpnum}. It is valid for 10 mins.\nBricks Agent Team.\n(A Product of Swami Vivekananda Technologies Pvt Ltd).`
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
            to: user.email, // Change to your recipient
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
    try {
        const o = await Otp.findOne({ phone, "is_delete": 0 });
        let dt = new Date(o.createdAt);
        if (new Date(dt.getTime() + (5 * 60000)) > new Date()) {
            if (otp == o.Otp) {
                const user = await User.findOne({ phone, is_delete: 0 });
                let string = randomString();
                if(user){
                    app.set("data", { user, uuid: md5(string) });
                    const token = jwt.sign({
                        id:user._id,
                        email:user.email,
                        phone:user.phone,
                        isUser:user.isUser,
                    }, process.env.SECRET, { expiresIn: "3d" });
                    //let token = jwt.sign({ user, uuid: md5(string) }, process.env.SECRET);
                    return res.send({ "status": 200, "data": user,"exist":true, token, "message": "Otp verified sucessfully", "error": false });
                }
                return res.send({ "status": 200, "data": user, "exist":false, "message": "Otp verified sucessfully", "error": false });
            } else {
                return res.status(401).send({ "status": 401, "data": null, "message": "Otp verification failed", "error": true });
            }
        } else {
            return res.send({ "status": 200, "data": null, "message": "Otp timed-out", "error": false });
        }
    } catch (error) {
        console.log(error.message);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": true });
    }
}
const otpVerify = async (req, res, next) => {
    const { phone, otp } = req.body;
    try {
        const o = await Otp.findOne({ phone, "is_delete": 0 });
        let dt = new Date(o.createdAt);
        if (new Date(dt.getTime() + (5 * 60000)) > new Date()) {
            if (otp == o.Otp) {
                return res.send({ "status": 200, "data": null, "message": "Otp verified sucessfully", "error": false });
            } else {
                return res.status(401).send({ "status": 401, "data": null, "message": "Otp verification failed", "error": true });
            }
        } else {
            return res.send({ "status": 401, "data": null, "message": "Otp timed-out", "error": false });
        }
    } catch (error) {
        console.log(error.message);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": true });
    }
}
const logout = (req, res, next) => {
    try {
        req.session.destroy();
        return res.send({ status: true, msg: "User Logged out successfully" })
    } catch (error) {
        console.log(error.message);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": true });
    }
};

module.exports = { loginUser, signupUser, emailVerify, otpVerify, otpVerifyLogin, logout };
