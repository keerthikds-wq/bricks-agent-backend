require("dotenv").config();
const { express, app, cors, connect, cookieParser, session, cloudinary } = require('./config');
const serverless = require('serverless-http');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

// Configure Cloudinary (v2)
cloudinary.config({
    cloud_name: process.env.CLOUDANARY_CLOUD_NAME,
    api_key:    process.env.CLOUDANARY_API_KEY,
    api_secret: process.env.CLOUDANARY_API_SECRET,
});

// Security headers
app.use(helmet());

// Compress all responses
app.use(compression());

// HTTP request logging
app.use(morgan('combined'));

// CORS
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',')
        : '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'token'],
}));

app.use(cookieParser());
app.use("/public", express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '10mb' }));

// Session
app.use(session({
    secret: process.env.SESSION_SECRET || 'change_me_in_production',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === 'production', httpOnly: true },
}));

// Global rate limiter: 200 req / 15 min per IP
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: 429, message: 'Too many requests, please try again later.', error: true },
});
app.use('/api', limiter);

// Stricter limiter on auth endpoints: 20 req / 10 min
const authLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 20,
    message: { status: 429, message: 'Too many auth attempts, please try again in 10 minutes.', error: true },
});
app.use('/api/auth', authLimiter);
app.use('/api/admin/login', authLimiter);
app.use('/api/seller/login', authLimiter);

// Connect DB, seed default data, then mount routes
connect().then(() => {
    require('./Utils/seedPackages')();
}).catch(() => {
    // connect() may not return a promise in all versions — seed anyway after delay
    setTimeout(() => require('./Utils/seedPackages')(), 3000);
});
app.use('/api', require('./Routes/index'));

// Root route — friendly info instead of "Cannot GET /"
app.get('/', (req, res) => {
    res.status(200).json({
        name: 'Bricks Agent API',
        version: '2.0.0',
        status: 'running',
        timestamp: new Date().toISOString(),
        endpoints: {
            health:   'GET /health',
            auth:     'POST /api/auth/login  |  POST /api/auth/verify-otp',
            products: 'GET /api/product',
            orders:   'GET /api/order',
            sellers:  'GET /api/seller',
        },
    });
});

// Health-check for Render
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Global error handler
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
