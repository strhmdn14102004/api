const express = require('express');
const router = express.Router();
const FmioffController = require('../controllers/fmioffController');
const authenticateToken = require('../middlewares/authMiddleware');

router.get('/', authenticateToken, FmioffController.getAllFmioff);
router.post('/', authenticateToken, FmioffController.addFmioff);

module.exports = router;