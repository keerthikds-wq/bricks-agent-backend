require("dotenv").config();
const { express, app, cors, connect, cookieParser, session, cloudinary } = require('./config');
const serverless = require('serverless-http');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

cloudinary.config({
    cloud_name: process.env.CLOUDANARY_CLOUD_NAME,
    api_key:    process.env.CLOUDANARY_API_KEY,
    api_secret: process.env.CLOUDANARY_API_SECRET,
});

app.use(helmet());
app.use(compression());
app.use(morgan('combined'));
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'token'],
}));
app.use(cookieParser());
app.use("/public", express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '10mb' }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'change_me_in_production',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === 'production', httpOnly: true },
}));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: 429, message: 'Too many requests, please try again later.', error: true },
});
app.use('/api', limiter);

const authLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 20,
    message: { status: 429, message: 'Too many auth attempts, please try again in 10 minutes.', error: true },
});
app.use('/api/auth', authLimiter);
app.use('/api/admin/login', authLimiter);
app.use('/api/seller/login',  authLimiter);
app.use('/api/builder/login', authLimiter);
app.use('/api/masonry/login',  authLimiter);

// Connect DB, seed default data, auto-seed price trends
connect().then(async () => {
    require('./Utils/seedPackages')();
    await require('./Utils/priceTrendScheduler')();
}).catch(() => {
    setTimeout(async () => {
        require('./Utils/seedPackages')();
        await require('./Utils/priceTrendScheduler')();
    }, 3000);
});

app.use('/api', require('./Routes/index'));

app.get('/', (req, res) => {
    res.status(200).json({
        name: 'Bricks Agent API',
        version: '2.0.0',
        status: 'running',
        timestamp: new Date().toISOString(),
    });
});

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({
        status: err.status || 500,
        message: err.message || 'Internal Server Error',
        error: true,
    });
});

module.exports.handler = serverless(app);
module.exports.app = app;
