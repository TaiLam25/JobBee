const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const db = require('./config/db');
const { morganMiddleware } = require('./config/logger');
const errorHandler = require('./middlewares/error.middleware');

// Module Routes
const authRoutes = require('./modules/auth/auth.routes');
const profileRoutes = require('./modules/profile/profile.routes');
const companyRoutes = require('./modules/company/company.routes');
const jobRoutes = require('./modules/job/job.routes');
const smallJobRoutes = require('./modules/job/small_job.routes');
const appRoutes = require('./modules/application/application.routes');
const reviewRoutes = require('./modules/review/review.routes');
const aiRoutes = require('./modules/ai/ai.routes');
const adminRoutes = require('./modules/admin/admin.routes');
const notificationRoutes = require('./modules/notification/notification.routes');
const provinceRoutes = require('./modules/job/province.routes');

const app = express();

// Security Headers (Requirement 4)
app.use(helmet());

// CORS configuration (Requirement: configurable origins)
const rawFrontendUrls = process.env.FRONTEND_URL || 'http://localhost:3000,http://localhost:5173';
const allowedOrigins = rawFrontendUrls.split(',').map((url) => url.trim()).filter(Boolean);
const isProd = process.env.NODE_ENV === 'production';

app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
                callback(null, true);
            } else if (!isProd) {
                callback(null, true); // Allow during development
            } else {
                callback(new Error('CORS blocked: Origin not allowed by Access-Control-Allow-Origin'));
            }
        },
        credentials: true,
    })
);

// Global Rate Limiter (Requirement: DoS Protection)
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Quá nhiều yêu cầu từ IP của bạn, vui lòng thử lại sau 15 phút.',
        data: null,
    },
});
app.use('/api/', globalLimiter);

// Auth Rate Limiter (Requirement: Brute Force Protection on login/register)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30, // 30 attempts per 15 minutes
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Quá nhiều yêu cầu đăng nhập/đăng ký. Vui lòng thử lại sau 15 phút.',
        data: null,
    },
});
app.use('/api/v1/auth/login', authLimiter);
app.use('/api/v1/auth/register', authLimiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morganMiddleware);

// Serve static upload files
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// Requirement 11: Health Check Endpoint (DB connectivity check for Railway)
app.get('/health', async (req, res) => {
    try {
        await db.query('SELECT 1');
        return res.status(200).json({
            status: 'UP',
            message: 'Database connection healthy',
            timestamp: new Date(),
        });
    } catch (err) {
        return res.status(500).json({
            status: 'DOWN',
            message: 'Database connection failed',
            error: err.message,
        });
    }
});

// Mount API v1 Routes
const API_PREFIX = '/api/v1';

app.use(API_PREFIX, authRoutes);
app.use(API_PREFIX, profileRoutes);
app.use(API_PREFIX, companyRoutes);
app.use(API_PREFIX, jobRoutes);
app.use(API_PREFIX, smallJobRoutes);
app.use(API_PREFIX, appRoutes);
app.use(API_PREFIX, reviewRoutes);
app.use(API_PREFIX, aiRoutes);
app.use(API_PREFIX, adminRoutes);
app.use(API_PREFIX, notificationRoutes);
app.use(API_PREFIX, provinceRoutes);

// Centralized Error Handler (Requirement 8)
app.use(errorHandler);

module.exports = app;
