const notificationModel = require('./notification.model');
const AppError = require('../../utils/app-error');

const getNotifications = async (accountId, query) => {
    return await notificationModel.getNotificationsByAccountId(accountId, query);
};

const markAsRead = async (accountId, notificationId) => {
    const updated = await notificationModel.markAsRead(notificationId, accountId);
    if (!updated) {
        throw new AppError(404, 'Không tìm thấy thông báo');
    }
    return updated;
};

const markAllAsRead = async (accountId) => {
    await notificationModel.markAllAsRead(accountId);
};

module.exports = {
    getNotifications,
    markAsRead,
    markAllAsRead,
};
