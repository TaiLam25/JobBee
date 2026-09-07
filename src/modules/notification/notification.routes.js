const express = require('express');
const notificationController = require('./notification.controller');
const { authenticateToken } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.get('/notifications', authenticateToken, notificationController.getNotifications);
router.put('/notifications/read-all', authenticateToken, notificationController.markAllAsRead);
router.put('/notifications/:id/read', authenticateToken, notificationController.markAsRead);

module.exports = router;
