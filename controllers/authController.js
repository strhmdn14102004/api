const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const emailjs = require('emailjs-com');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const secretKey = process.env.JWT_SECRET;

// Register new user
exports.register = async (req, res) => {
  try {
    const { username, password, fullName, address, phoneNumber } = req.body;
    
    if (!username || !password || !fullName || !address || !phoneNumber) {
      return res.status(400).json({ message: 'Semua field wajib diisi' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPassword, fullName, address, phoneNumber });
    await newUser.save();
    
    res.status(201).json({ message: 'User berhasil didaftarkan' });
  } catch (err) {
    res.status(500).json({ message: 'Error saat registrasi', error: err.message });
  }
};

// User login
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'Username dan password wajib diisi' });
    
    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ message: 'User tidak ditemukan' });
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Password salah' });
    
    const token = jwt.sign({ 
      id: user._id, 
      username: user.username, 
      fullName: user.fullName 
    }, secretKey, { expiresIn: '1h' });
    
    res.status(200).json({
      message: 'Login berhasil',
      token,
      user: {
        id: user._id,
        username: user.username,
        fullName: user.fullName,
        address: user.address,
        phoneNumber: user.phoneNumber
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Error saat login', error: err.message });
  }
};

exports.requestResetPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email wajib diisi' });

    const user = await User.findOne({ username: email });
    if (!user) return res.status(404).json({ message: 'User dengan email tersebut tidak ditemukan' });

    // Generate token
    const token = crypto.randomBytes(20).toString('hex');
    
    // Set token expiry (1 hour from now)
    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    // Send email using EmailJS
    const templateParams = {
      to_email: email,
      reset_link: `${process.env.CLIENT_URL}/reset-password?token=${token}`,
      user_name: user.fullName
    };

    await emailjs.send(
      process.env.EMAILJS_SERVICE_ID,
      process.env.EMAILJS_TEMPLATE_ID,
      templateParams,
      process.env.EMAILJS_USER_ID
    );

    res.status(200).json({ message: 'Link reset password telah dikirim ke email Anda' });
  } catch (err) {
    res.status(500).json({ message: 'Error saat memproses reset password', error: err.message });
  }
};

// Verify reset token
exports.verifyResetToken = async (req, res) => {
  try {
    const { token } = req.params;
    
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Token reset password tidak valid atau sudah kadaluarsa' });
    }

    res.status(200).json({ message: 'Token valid', email: user.username });
  } catch (err) {
    res.status(500).json({ message: 'Error saat verifikasi token', error: err.message });
  }
};

// Reset password
exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    
    if (!token || !newPassword) {
      return res.status(400).json({ message: 'Token dan password baru wajib diisi' });
    }

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Token reset password tidak valid atau sudah kadaluarsa' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update password and clear reset token
    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.status(200).json({ message: 'Password berhasil direset' });
  } catch (err) {
    res.status(500).json({ message: 'Error saat reset password', error: err.message });
  }
};