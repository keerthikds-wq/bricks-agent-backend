const { jwt, sg_mail, md5, fs, path } = require('../config');
const Admin = require("../Model/Admin");
const Otp = require('../Model/Otp');
const { randomString } = require('../Utils');
const { sendOtp } = require("../Utils/sms");

const loginAdmin = async (req, res, next) => {
    const { email, password } = req.body;
    try {
        const admin = await Admin.findOne({ email, is_delete: 0 });
        if (admin) {
            if (admin.password == md5(password)) {
                //token = jwt.sign({ admin, exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 30) }, process.env.SECRET);
                const token = jwt.sign({
                    id:admin._id,
                    email:admin.email,
                    phone:admin.phone,
                    isAdmin:admin.isAdmin,
                }, process.env.SECRET, { expiresIn: "3d" });

                return res.send({ "status": 200, token, "data": admin, "message": "Admin logged in successfully", "error": false });
            } else {
                return res.send({ "status": 200, "data": null, "message": "Password do not match", "error": false });
            }
        } else {
            return res.status(401).send({ "status": 401, "data": null, "message": "Admin not found", "error": true });
        }
    } catch (error) {
        console.log(error.message);
        return res.status(401).send({ "status": 401, "data": null, "message": "Something went wrong!", "error": true });
    }
}
const signupAdmin = async (req, res, next) => {
    const { name, email, password, phone } = req.body;
    try {
        req.body.password = md5(req.body.password);
        const admin = await Admin.create(req.body);
        return res.send({ "status": 200, "data": admin, "message": "Admin created successfully", "error": false });
    } catch (error) {
        console.log(error.message);
        return res.status(401).send({ "status": 401, "data": null, "message": "Something went wrong!", "error": true });
    }
}
const forgotPassword = async (req, res, next) => {
    const { email } = req.body;
    try {
        const admin = await Admin.findOne({ email, is_delete: 0 });
        if (!admin) {
            return res.status(401).send({ "status": 401, "data": null, "message": "Admin not found", "error": true });
        }
        const otpnum = Math.floor(1000 + Math.random() * 9000);
        await Otp.updateMany({ userId: admin.id }, { "is_delete": 1 });
        await Otp.create({
            Otp: otpnum,
            userId: admin.id,
            email
        });
        await sendOtp(phone, otpnum);
       /*  const dynamic = `Your OTP for reset password on Bricks Agent account is ${otpnum}. It is valid for 10 mins.\nBricks Agent Team.\n(A Product of Swami Vivekananda Technologies Pvt Ltd).`
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
            to: admin.email, // Change to your recipient
            from: process.env.EMAIL, // Change to your verified sender
            subject: 'forgot password',
            text: 'OTP : ' + otpnum,
            html: '<strong>OTP : ' + otpnum + '</strong>',
        }
        sg_mail.send(msg).then(() => {
            console.log('Email sent');
            console.log(admin.email);
            return res.send({ "status": 200, "otp": otpnum, "message": "Otp send successfully", "error": false });
        }).catch((error) => {
            console.error(error)
            return res.status(500).send({ "status": 500, "message": "Otp send Failed", "error": true });
        });

    } catch (error) {
        console.log(error.message);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": true });
    }
}
const emailVerify = async (req, res, next) => {
    const { email } = req.body;
    try {
        const admin = await Admin.findOne({ email, is_delete: 0 });
        if (!admin) {
            return res.status(401).send({ "status": 401, "data": null, "message": "Admin not found", "error": true });
        }
        let otpnum = Math.floor(100000 + Math.random() * 900000);
        await Otp.updateMany({ "is_delete": 1 });
        const otp = await Otp.create({
            Otp: otpnum,
            userId: admin.id,
            email
        });
        await sendOtp(phone, otpnum);

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
            to: admin.email, // Change to your recipient
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
const changePassword = async (req, res, next) => {
    const { email, password, prevpassword } = req.body;
    try {
        const admin = await Admin.findOne({ email, is_delete: 0 });
        if (prevpassword != '' && (md5(prevpassword) != admin.password)) {
            console.log("error pass");
            return res.status(401).send({ "status": 401, "data": null, "message": "Admin passwords do not match", "error": true });
        } else {
            // console.log("error");
            if (Object.keys(admin).length !== 0) {
                admin.password = md5(password);
                await admin.save();
                return res.send({ "status": 200, "data": admin, "message": "Password updated successfully", "error": false });
            } else {
                console.log("error else");
                return res.status(401).send({ "status": 401, "data": null, "message": "Admin not found", "error": true });
            }
        }
    } catch (error) {
        console.log(error);
        return res.status(500).send({ "status": 500, "data": null, "message": error.message, "error": true });
    }
}
const otpVerify = async (req, res, next) => {
    const { email, otp, verify } = req.body;
    try {
        const o = await Otp.findOne({ email, "is_delete": 0 });
        let dt = new Date(o.createdAt);
        if (new Date(dt.getTime() + (5 * 60000)) > new Date()) {
            if (otp == o.Otp) {
                if (verify == 'email') {
                    const admin = await Admin.findOne({ email, is_delete: 0 });
                    admin.is_verified = 1;
                    await admin.save();
                    return res.send({ "status": 200, "data": null, "message": "Otp verified sucessfully", "error": false });
                }
                return res.send({ "status": 200, "data": null, "message": "Otp verified sucessfully", "error": false });
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

module.exports = { loginAdmin, signupAdmin, forgotPassword, emailVerify, changePassword, otpVerify };
