const ImeiData = require('../models/ImeiData');
const authenticateToken = require('../middlewares/authMiddleware');

// Get all IMEI data
exports.getAllImei = async (req, res) => {
  try {
    const imeiList = await ImeiData.find();
    res.status(200).json({ data: imeiList });
  } catch (err) {
    res.status(500).json({ 
      message: 'Error saat mengambil data IMEI', 
      error: err.message 
    });
  }
};

// Add new IMEI data
exports.addImei = async (req, res) => {
  try {
    const { name, price } = req.body;
    if (!name || !price) {
      return res.status(400).json({ 
        message: 'Nama dan harga wajib diisi' 
      });
    }
    
    const newImeiData = new ImeiData({ name, price });
    await newImeiData.save();
    
    res.status(201).json({ 
      message: 'Data IMEI berhasil ditambahkan', 
      data: newImeiData 
    });
  } catch (err) {
    res.status(500).json({ 
      message: 'Error saat menambahkan data IMEI', 
      error: err.message 
    });
  }
};