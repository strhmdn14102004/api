const BypassData = require('../models/BypassData');
const authenticateToken = require('../middlewares/authMiddleware');

// Get all bypass data
exports.getAllBypass = async (req, res) => {
  try {
    const bypassList = await BypassData.find().select('-__v');
    res.status(200).json(bypassList);
  } catch (err) {
    res.status(500).json({ message: 'Error saat mengambil data Bypass', error: err.message });
  }
};

// Add new bypass data
exports.addBypass = async (req, res) => {
  try {
    const { name, price } = req.body;
    const newBypass = new BypassData({ name, price });
    await newBypass.save();
    
    res.status(201).json({ 
      message: 'Data Bypass berhasil ditambahkan', 
      data: newBypass 
    });
  } catch (err) {
    res.status(500).json({ 
      message: 'Error saat menambahkan data Bypass', 
      error: err.message 
    });
  }
};