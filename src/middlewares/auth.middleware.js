const jwt = require('jsonwebtoken');
const AppError = require('../utils/app-error');
const db = require('../config/db');

const isProd = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || (isProd ? (() => { throw new Error('FATAL: JWT_SECRET environment variable is missing in production'); })() : 'super_secret_jwt_access_key_2026_job_portal');

const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new AppError(401, 'Vui lòng đăng nhập để truy cập tài nguyên này');
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        // Check if account still exists and is not locked
        const result = await db.query(
            'SELECT id, email, role, is_locked FROM account WHERE id = $1',
            [decoded.id]
        );

        if (result.rows.length === 0) {
            throw new AppError(401, 'Tài khoản không tồn tại hoặc đã bị xóa');
        }

        const account = result.rows[0];

        if (account.is_locked) {
            throw new AppError(403, 'Tài khoản của bạn đã bị khóa bởi quản trị viên');
        }

        req.user = account;
        next();
    } catch (error) {
        next(error);
    }
};

const optionalAuthenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                const result = await db.query(
                    'SELECT id, email, role, is_locked FROM account WHERE id = $1',
                    [decoded.id]
                );
                if (result.rows.length > 0 && !result.rows[0].is_locked) {
                    req.user = result.rows[0];
                }
            } catch (jwtErr) {
                // Ignore invalid token for optional auth
            }
        }
        next();
    } catch (error) {
        next();
    }
};

const authorizeRoles = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return next(new AppError(403, 'Bạn không có quyền thực hiện thao tác này'));
        }
        next();
    };
};

module.exports = {
    authenticateToken,
    optionalAuthenticateToken,
    authorizeRoles,
};
