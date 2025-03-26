const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const authenticateToken = require('../middlewares/authMiddleware');

router.post('/update-fcm', authenticateToken, notificationController.updateFcmToken);

module.exports = router;