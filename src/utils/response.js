/**
 * Send standardized API Response
 * Format: { success: true/false, data, message, meta }
 */
const sendResponse = (res, statusCode, message, data = null, meta = null) => {
    const responsePayload = {
        success: statusCode >= 200 && statusCode < 300,
        message,
        data,
    };

    if (meta) {
        responsePayload.meta = meta;
        responsePayload.pagination = meta;
    }

    return res.status(statusCode).json(responsePayload);
};

module.exports = {
    sendResponse,
};
