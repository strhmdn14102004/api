const express = require('express');
const router = express.Router();
const fmiOffController = require('../controllers/fmioffController');
const authenticateToken = require('../middlewares/authMiddleware');

// Get all FMI Off data (authenticated)
router.get('/', authenticateToken, fmiOffController.getAllFmiOff);

// Add new FMI Off data (authenticated)
router.post('/', authenticateToken, fmiOffController.addFmiOff);

// Update FMI Off data (authenticated)
router.put('/:id', authenticateToken, fmiOffController.updateFmiOff);

// Delete FMI Off data (authenticated)
router.delete('/:id', authenticateToken, fmiOffController.deleteFmiOff);

module.exports = router;