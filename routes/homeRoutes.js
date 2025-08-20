const express = require('express');
const router = express.Router();
const homeController = require('../controllers/homeController');
const authenticateToken = require('../middlewares/authMiddleware');

// Home page routes
router.get('/', authenticateToken, homeController.getHomeData);
router.get('/stats', authenticateToken, homeController.getDashboardStats);
router.get('/profile', authenticateToken, homeController.getProfileSummary);

module.exports = router;