// const { app, express, jwt, sg_mail, fs, path } = require("../config");
// const router = express.Router();
// const admin = require("firebase-admin");
// var fcm = require('fcm-notification');

// const user = require("../Model/User");

 //var serviceAccount = require("../bricks-agent-cdcff-firebase-adminsdk-d9esr-5dbe751f18.json");
// // admin.initializeApp({
// //     credential: 
// // });
// const FCM = new fcm(admin.credential.cert(serviceAccount))

// const pushNotificationAllUser = async (req, res, next) => {
//     const { messageBody } = req.body;
//     try {
//         let rTokens = await user.find().select('token');

//         const message = {
//             data: {
//                 "body" : "This week's edition is now available.",
//                 "title" : "NewsMagazine.com",
//             },
//             notification: {
//                 "body" : "This week's edition is now available.",
//                 "title" : "NewsMagazine.com",
//             },
//             topic: "test",
//             token:"eEFowoz6SqC4dLGIV8BwB_:APA91bGkV-tQmUflFGcEDcAKfHPfhUY7BKA0ncwnY0pMLRpjWBOwrm2Kc-1zXzN120Bo8n4iXpknn9jhyBAsJoN_rztuwFTfDn6qySd"
//           };
//           FCM.send(message,(err,res)=>{
//             if (err) {
//                 return res.send({
//                     status: 200,
//                     data: {err},
//                     message: "Notifications sent to all users",
//                     error: false,
//                 });
//             }
//             return res.send({
//                 status: 200,
//                 data: {res},
//                 message: "Notifications sent to all users",
//                 error: false,
//             });
//           })
//         // const message = {
//         //     "message":{
//         //       "topic":"test",
//         //       "data":{
//         //         "body" : "This week's edition is now available.",
//         //         "title" : "NewsMagazine.com",
//         //       },
//         //       "data" : {
//         //         "volume" : "3.21.15",
//         //         "contents" : "http://www.news-magazine.com/world-week/21659772"
//         //       },
//         //       "android":{
//         //         "priority":"normal"
//         //       },
//         //       "apns":{
//         //         "headers":{
//         //           "apns-priority":"5"
//         //         }
//         //       },
//         //       "webpush": {
//         //         "headers": {
//         //           "Urgency": "high"
//         //       }
//         //      }
//         //    }
//         //   };
          
//         //   admin
//         //     .messaging()
//         //     .send(message)
//         //     .then((response) => {
//         //       console.log("Successfully sent message:", response);
//         //     })
//         //     .catch((error) => {
//         //       console.log("Error sending message:", error);
//         //   });
//         // const notification_options = {
//         //     priority: "high",
//         //     timeToLive: 60 * 60 * 24
//         // };
//         // var payload = {
//         //     notification: {
//         //       title: message,
//         //       body: message
//         //     }
//         // };
//         // let tokensArray = ["eEFowoz6SqC4dLGIV8BwB_:APA91bGkV-tQmUflFGcEDcAKfHPfhUY7BKA0ncwnY0pMLRpjWBOwrm2Kc-1zXzN120Bo8n4iXpknn9jhyBAsJoN_rztuwFTfDn6qySd"];
//         // await admin.messaging().sendMulticast({
//         //     tokens: tokensArray,
//         //     notification: {
//         //       title: "Weather Warning!",
//         //       body: "A new weather warning has been issued for your location.",
//         //       imageUrl: "https://my-cdn.com/extreme-weather.png",
//         //     },
//         //   });
//         // rTokens.forEach(async (registrationToken) => {
//         //     // console.log(registrationToken,"registrationToken");
//         //     // await admin.messaging().sendToDevice(registrationToken.token, payload, notification_options);
//         //     tokensArray.push(registrationToken.token);
//         // });
//         // await admin.messaging().sendToDevice(tokensArray, payload, notification_options);
//         return res.send({
//             status: 200,
//             data: {message},
//             message: "Notifications sent to all users",
//             error: false,
//         });
//         // const messageT = {
//         //     data: {
//         //       type: "warning",
//         //       content: "A new weather warning has been created!",
//         //     },
//         //     // topic: "weather",
//         //   };
          
//         // admin.messaging().send(messageT).then((response) => {
//         //     console.log("Successfully sent message:", response);
//         // })
//         // .catch((error) => {
//         //     console.log("Error sending message:", error);
//         // });
//         return res.send({
//             status: 200,
//             data: null,
//             message: "Notifications sent to all users",
//             error: false,
//         });
//     } catch (error) {
//         console.log(error.message);
//         return res.status(500).send({
//             status: 500,
//             data: null,
//             message: error.message,
//             error: true,
//         });
//     }
// }
// const pushNotification = async (req, res, next) => {
//     const { message, token } = req.body;
//     try {
//         // let rTokens = await user.find().select('resiterToken');
        
//         const notification_options = {
//             priority: "high",
//             timeToLive: 60 * 60 * 24
//         };
//         await admin.messaging().sendToDevice(token, message, notification_options);
//         // rTokens.forEach(async (registrationToken) => {
//         // });
//         return res.send({
//             status: 200,
//             data: null,
//             message: "Notifications sent to user",
//             error: false,
//         });
//     } catch (error) {
//         console.log(error.message);
//         return res.status(500).send({
//             status: 500,
//             data: null,
//             message: error.message,
//             error: true,
//         });
//     }
// }
// const pushNotificationAllSeller = async (req, res, next) => {
//     const { message } = req.body;
//     try {
//         let rTokens = await user.find().select('token');

        
//         const notification_options = {
//             priority: "high",
//             timeToLive: 60 * 60 * 24
//         };
//         rTokens.forEach(async (registrationToken) => {
//             await admin.messaging().sendToDevice(registrationToken, message, notification_options);
//         });
//         return res.send({
//             status: 200,
//             data: null,
//             message: "Notifications sent to all users",
//             error: false,
//         });
//     } catch (error) {
//         console.log(error.message);
//         return res.status(500).send({
//             status: 500,
//             data: null,
//             message: error.message,
//             error: true,
//         });
//     }
// }

// module.exports = { pushNotificationAllUser, pushNotification, pushNotificationAllSeller };