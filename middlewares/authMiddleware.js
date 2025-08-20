const jwt = require('jsonwebtoken');
const User = require('../models/User');
const secretKey = process.env.JWT_SECRET;

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ 
        success: false,
        message: 'Access denied. No token provided.' 
      });
    }
    
    const decoded = jwt.verify(token, secretKey);
    
    // Check if user still exists and is active
    const user = await User.findById(decoded.id).select('-password');
    if (!user || !user.isActive) {
      return res.status(401).json({ 
        success: false,
        message: 'User not found or account is inactive' 
      });
    }
    
    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(403).json({ 
        success: false,
        message: 'Token expired' 
      });
    }
    
    if (err.name === 'JsonWebTokenError') {
      return res.status(403).json({ 
        success: false,
        message: 'Invalid token' 
      });
    }
    
    return res.status(500).json({ 
      success: false,
      message: 'Server error during authentication' 
    });
  }
};

// Optional: Admin middleware for admin-only routes
const requireAdmin = (req, res, next) => {
  // Assuming you have an isAdmin field in your User model
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ 
      success: false,
      message: 'Admin access required' 
    });
  }
  next();
};

module.exports = {
  authenticateToken,
  requireAdmin
};