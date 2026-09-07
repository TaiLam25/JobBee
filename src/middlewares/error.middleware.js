const AppError = require('../utils/app-error');
const { logger } = require('../config/logger');

const errorHandler = (err, req, res, next) => {
    let statusCode = err.statusCode || 500;
    let message = err.message || 'Lỗi hệ thống nội bộ';

    if (err.name === 'ZodError') {
        statusCode = 400;
        message = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
    } else if (err.code === '23505') {
        // Postgres unique violation
        statusCode = 409;
        message = 'Dữ liệu đã tồn tại trong hệ thống (vi phạm ràng buộc duy nhất)';
    } else if (err.name === 'JsonWebTokenError') {
        statusCode = 401;
        message = 'Token xác thực không hợp lệ';
    } else if (err.name === 'TokenExpiredError') {
        statusCode = 401;
        message = 'Token xác thực đã hết hạn';
    } else if (err.name === 'MulterError') {
        statusCode = 400;
        if (err.code === 'LIMIT_FILE_SIZE') {
            message = 'Kích thước tệp tải lên vượt quá giới hạn cho phép';
        } else {
            message = `Lỗi tải lên tệp: ${err.message}`;
        }
    }

    if (statusCode >= 500) {
        logger.error(`[500 Error] ${req.method} ${req.originalUrl}:`, err);
        if (process.env.NODE_ENV === 'production') {
            message = 'Đã có lỗi xảy ra từ hệ thống máy chủ. Vui lòng thử lại sau.';
        }
    }

    return res.status(statusCode).json({
        success: false,
        message,
        data: null,
    });
};

module.exports = errorHandler;
