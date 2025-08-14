const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const transactionController = require('../controllers/transactionController');
const authenticateToken = require('../middlewares/authMiddleware');

router.post('/update-fcm', authenticateToken, notificationController.updateFcmToken);
router.get('/transactions', authenticateToken, transactionController.getNotifications);

module.exports = router;