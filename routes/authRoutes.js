const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authenticate = require('../middlewares/authMiddleware');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/request-reset-password', authController.requestResetPassword);
router.post('/reset-password', authController.resetPassword);
router.post('/update-password', authenticate, authController.updatePassword);

module.exports = router;