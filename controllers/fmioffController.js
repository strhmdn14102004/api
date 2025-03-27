const FmiOff = require('../models/fmioff');
const { authenticateToken } = require('../middlewares/authMiddleware');

// Get all FMI Off data
exports.getAllFmiOff = async (req, res) => {
  try {
    const fmiOffList = await FmiOff.find().select('-__v');
    res.status(200).json({
      success: true,
      data: fmiOffList
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Error fetching FMI Off data',
      error: err.message
    });
  }
};

// Add new FMI Off data
exports.addFmiOff = async (req, res) => {
  try {
    const { name, price } = req.body;
    
    if (!name || !price) {
      return res.status(400).json({
        success: false,
        message: 'Name and price are required'
      });
    }

    const newFmiOff = new FmiOff({ name, price });
    await newFmiOff.save();
    
    res.status(201).json({
      success: true,
      message: 'FMI Off data added successfully',
      data: newFmiOff
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Error adding FMI Off data',
      error: err.message
    });
  }
};

// Update FMI Off data
exports.updateFmiOff = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price } = req.body;
    
    const updatedFmiOff = await FmiOff.findByIdAndUpdate(
      id,
      { name, price },
      { new: true, runValidators: true }
    );
    
    if (!updatedFmiOff) {
      return res.status(404).json({
        success: false,
        message: 'FMI Off data not found'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'FMI Off data updated successfully',
      data: updatedFmiOff
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Error updating FMI Off data',
      error: err.message
    });
  }
};

// Delete FMI Off data
exports.deleteFmiOff = async (req, res) => {
  try {
    const { id } = req.params;
    
    const deletedFmiOff = await FmiOff.findByIdAndDelete(id);
    
    if (!deletedFmiOff) {
      return res.status(404).json({
        success: false,
        message: 'FMI Off data not found'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'FMI Off data deleted successfully'
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Error deleting FMI Off data',
      error: err.message
    });
  }
};