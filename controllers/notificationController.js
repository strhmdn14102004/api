const User = require('../models/User');
const admin = require('../config/firebase');
const authenticateToken = require('../middlewares/authMiddleware');

// Update FCM token
exports.updateFcmToken = async (req, res) => {
  try {
    const { fcm_token } = req.body;
    if (!fcm_token) {
      return res.status(400).json({ 
        success: false,
        message: 'FCM token wajib diisi' 
      });
    }
    
    if (!fcm_token.startsWith('c') && !fcm_token.includes(':')) {
      return res.status(400).json({
        success: false,
        message: 'Format FCM token tidak valid'
      });
    }
    
    const updatedUser = await User.findByIdAndUpdate(
      req.user.id, 
      { fcmToken: fcm_token },
      { new: true }
    );
    
    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User tidak ditemukan'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'FCM token berhasil diperbarui',
      data: {
        userId: updatedUser._id,
        fcmToken: updatedUser.fcmToken
      }
    });
  } catch (err) {
    console.error('❌ FCM Update Error:', err);
    res.status(500).json({
      success: false,
      message: 'Error memperbarui FCM token',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};