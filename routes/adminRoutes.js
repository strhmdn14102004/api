const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticateToken, requireAdmin } = require('../middlewares/authMiddleware');

// Admin dashboard routes
router.get('/dashboard/stats', authenticateToken, requireAdmin, adminController.getDashboardStats);
router.get('/transactions', authenticateToken, requireAdmin, adminController.getAllTransactions);
router.get('/users', authenticateToken, requireAdmin, adminController.getAllUsers);

// Transaction management
router.post('/transactions/approve', authenticateToken, requireAdmin, adminController.manualApproveTransaction);
router.post('/transactions/reject', authenticateToken, requireAdmin, adminController.rejectTransaction);

module.exports = router;