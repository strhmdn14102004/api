const jwt = require('jsonwebtoken');
const secretKey = process.env.JWT_SECRET;

const authenticateToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ 
      message: 'Akses ditolak, token tidak tersedia' 
    });
  }
  
  jwt.verify(token, secretKey, (err, decoded) => {
    if (err) {
      return res.status(403).json({ 
        message: 'Token tidak valid',
        error: err.message 
      });
    }
    req.user = decoded;
    next();
  });
};

module.exports = authenticateToken;