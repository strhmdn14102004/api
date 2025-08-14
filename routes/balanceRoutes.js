const express = require('express');
const router = express.Router();
const balanceController = require('../controllers/balanceController');
const authenticateToken = require('../middlewares/authMiddleware');

router.get('/', authenticateToken, balanceController.getBalance);
router.post('/topup', authenticateToken, balanceController.topUp);
router.post('/withdraw', authenticateToken, balanceController.withdraw);
router.post('/transfer', authenticateToken, balanceController.transfer);
router.get('/history', authenticateToken, balanceController.getHistory);

module.exports = router;