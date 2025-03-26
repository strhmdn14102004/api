const express = require('express');
const router = express.Router();
const imeiController = require('../controllers/imeiController');
const authenticateToken = require('../middlewares/authMiddleware');

router.get('/', authenticateToken, imeiController.getAllImei);
router.post('/', authenticateToken, imeiController.addImei);

module.exports = router;