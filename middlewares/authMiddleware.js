const jwt = require('jsonwebtoken');
const secretKey = process.env.JWT_SECRET;
const TimeUtils = require('../utils/timeUtils');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ 
      success: false,
      message: 'Access denied. No token provided.' 
    });
  }
  
  jwt.verify(token, secretKey, (err, decoded) => {
    if (err) {
      return res.status(403).json({ 
        success: false,
        message: 'Invalid or expired token' 
      });
    }
    
    // Deteksi timezone dari header jika ada
    const userTimezone = TimeUtils.detectTimezone(req);
    req.user = {
      ...decoded,
      timezone: decoded.timezone || userTimezone
    };
    
    next();
  });
};

module.exports = authenticateToken;