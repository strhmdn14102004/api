const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transactionController');
const authenticateToken = require('../middlewares/authMiddleware');

router.post('/', authenticateToken, transactionController.createTransaction);
router.post('/midtrans/webhook', transactionController.midtransWebhook);
router.post('/update', authenticateToken, transactionController.updateTransactionStatus);
router.get('/', authenticateToken, transactionController.getTransactionHistory);
router.get('/:id', authenticateToken, transactionController.getTransactionDetails);
router.put('/:id/approve', authenticateToken, transactionController.approveTransaction);
router.post('/direct', authenticateToken, transactionController.directPurchase);

module.exports = router;