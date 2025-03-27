const fmioffData = require('../models/FmioffData');
const authenticateToken = require('../middlewares/authMiddleware');

// Get all fmioff data
exports.getAllfmioff = async (req, res) => {
  try {
    const fmioffList = await fmioffData.find().select('-__v');
    res.status(200).json(fmioffList);
  } catch (err) {
    res.status(500).json({ message: 'Error saat mengambil data fmioff', error: err.message });
  }
};

// Add new fmioff data
exports.addfmioff = async (req, res) => {
  try {
    const { name, price } = req.body;
    const newfmioff = new fmioffData({ name, price });
    await newfmioff.save();
    
    res.status(201).json({ 
      message: 'Data fmioff berhasil ditambahkan', 
      data: newfmioff 
    });
  } catch (err) {
    res.status(500).json({ 
      message: 'Error saat menambahkan data fmioff', 
      error: err.message 
    });
  }
};