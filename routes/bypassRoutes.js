const express = require('express');
const router = express.Router();
const bypassController = require('../controllers/bypassController');
const authenticateToken = require('../middlewares/authMiddleware');

router.get('/', authenticateToken, bypassController.getAllBypass);
router.post('/', authenticateToken, bypassController.addBypass);

module.exports = router;