const express = require('express');
const rateLimit = require('express-rate-limit');
const authController = require('./auth.controller');
const validate = require('../../middlewares/validate.middleware');
const { authenticateToken } = require('../../middlewares/auth.middleware');
const {
    registerSchema,
    loginSchema,
    forgotPasswordSchema,
    resetPasswordSchema,
    changePasswordSchema,
} = require('./auth.schema');

const router = express.Router();

// Rate limiter for auth brute-force protection
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === 'test' ? 1000 : 100, // Max 100 requests per window
    message: {
        success: false,
        message: 'Thao tác quá nhiều lần. Vui lòng thử lại sau 15 phút.',
        data: null,
    },
});

// Public endpoints
router.post('/auth/register', authLimiter, validate(registerSchema), authController.register);
router.post('/auth/login', authLimiter, validate(loginSchema), authController.login);
router.post('/auth/logout', authController.logout);
router.post('/auth/refresh-token', authController.refreshToken);
router.post('/auth/forgot-password', authLimiter, validate(forgotPasswordSchema), authController.forgotPassword);
router.post('/auth/reset-password', validate(resetPasswordSchema), authController.resetPassword);

// Authenticated endpoints
router.get('/accounts/me', authenticateToken, authController.getMe);
router.put('/accounts/me', authenticateToken, authController.updateMe);
router.put('/accounts/me/password', authenticateToken, validate(changePasswordSchema), authController.changePassword);

module.exports = router;
