require("dotenv").config();
const express = require("express");
const fs = require('fs');
const path = require('path');
const { v2: cloudinary } = require('cloudinary'); // Cloudinary v2
const session = require('express-session');
const app = express();
const jwt = require('jsonwebtoken');
const connect = require("./db");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const md5 = require('md5');
const sg_mail = require('@sendgrid/mail');
sg_mail.setApiKey(process.env.SENDGRID_API_KEY);


module.exports = { express, app, cors, connect, cookieParser, sg_mail, md5, jwt, fs, path, session, cloudinary };
