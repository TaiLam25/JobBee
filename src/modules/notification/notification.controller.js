const notificationService = require('./notification.service');
const { sendResponse } = require('../../utils/response');

const getNotifications = async (req, res, next) => {
    try {
        const result = await notificationService.getNotifications(req.user.id, req.query);
        return sendResponse(res, 200, 'Lấy danh sách thông báo thành công', result.notifications, result.meta);
    } catch (error) {
        next(error);
    }
};

const markAsRead = async (req, res, next) => {
    try {
        const updated = await notificationService.markAsRead(req.user.id, req.params.id);
        return sendResponse(res, 200, 'Đã đánh dấu thông báo là đã đọc', updated);
    } catch (error) {
        next(error);
    }
};

const markAllAsRead = async (req, res, next) => {
    try {
        await notificationService.markAllAsRead(req.user.id);
        return sendResponse(res, 200, 'Đã đánh dấu tất cả thông báo là đã đọc');
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getNotifications,
    markAsRead,
    markAllAsRead,
};
