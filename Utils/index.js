const { jwt, app } = require('../config');
const randomString = () => {
    var randomString = '';
    var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for (var i = 0; i < 20; i++) {
        randomString += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return randomString;
}


const verifyTokenwithAuthorization = (req, res, next) => {
    auth(req, res, () => {
        if (req.user.id === req.user.id || req.user.isAdmin || req.user.isSeller || req.user.isUser) {
            next();
        } else {
            res.status(403).json("You Are Not Authorized to Perform That Function")
        }
    })
   /*  const authHeader = req.headers['authorization'];
    if (authHeader) {
        const token = authHeader.split(" ")[1]
        jwt.verify(token, process.env.SECRET, (err, user) => {
            if (err) res.status(403).json("Token is Not Valid!");
            req.user = user
            next();
        })
    } else {
        return res.status(401).json("You are not authenticated!");
    } */
}





const auth = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (authHeader) {
        const token = authHeader.split(" ")[1]
        jwt.verify(token, process.env.SECRET, (err, user) => {
            if (err) res.status(403).json("Token is Not Valid!");
            req.user = user
            next();
        })
    } else {
        return res.status(401).json("You are not authenticated!");
    }



    /* if (req.headers.token == '') {
        return res.status(401).send({ "status": 401, "message": "Token empty", "error": true });
    }
    try {
        let decoded = await jwt.verify(req.headers['authorization'], process.env.SECRET);
        console.log(decoded,"decoded");
        console.log(app.get("data"),"app.get('data')");
        if (app.get("data").uuid != decoded.uuid) {
            return res.status(401).send({ "status": 401, "message": "Unauthorised token", "error": true });
        }
        next();
    } catch (error) {
        console.log(error.message);
        return res.status(401).send({ "status": 401, "message": "Unauthorised token", "error": true });

    } */
}
const sellerAuth = async (req, res, next) => {
    auth(req, res, () => {
        if (req.user.isSeller) {
            next();
        } else {
            res.status(403).json("You Are not a seller")
        }
    })
}
const userAuth = async (req, res, next) => {
    auth(req, res, () => {
        if (req.user.isUser) {
            next();
        } else {
            res.status(403).json("You Are not a User")
        }
    })
}
const adminAuth = async (req, res, next) => {
    auth(req, res, () => {
        if (req.user.isAdmin) {
            next();
        } else {
            res.status(403).json("You Are not an Admin")
        }
    })
    /* if (req.autho.token == '') {
        return res.status(401).send({ "status": 401, "message": "Token empty", "error": true });
    }
    try {
        let decoded = await jwt.verify(req.headers['authorization'], process.env.SECRET);
        console.log("adminAuth");
        next();
    } catch (error) {
        console.log(error.message);
        return res.status(401).send({ "status": 401, "message": "Unauthorised token", "error": true });

    } */
}
module.exports = { randomString, auth, adminAuth,verifyTokenwithAuthorization,sellerAuth,userAuth };