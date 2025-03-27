const bcrypt = require('bcryptjs');
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
    const { username } = req.body;
    
    if (!username) {
      return res.status(400).json({ message: 'Username wajib diisi' });
    }
    
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: 'User tidak ditemukan' });
    }
    
    // Generate token
    const resetToken = crypto.randomBytes(20).toString('hex');
    const resetPasswordExpires = Date.now() + 3600000; // 1 jam dari sekarang
    
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = resetPasswordExpires;
    await user.save();
    
    // Dalam implementasi nyata, di sini Anda akan mengirim email dengan token
    // Untuk contoh, kita kembalikan token di response (tidak aman untuk produksi)
    res.status(200).json({ 
      message: 'Reset password link has been generated',
      resetToken: resetToken // Hanya untuk development, jangan lakukan ini di produksi
    });
    
  } catch (err) {
    res.status(500).json({ message: 'Error saat memproses reset password', error: err.message });
  }
};

// Reset password dengan token
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
      return res.status(400).json({ message: 'Token invalid atau sudah kadaluarsa' });
    }
    
    // Hash password baru
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update password dan hapus token
    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();
    
    res.status(200).json({ message: 'Password berhasil direset' });
    
  } catch (err) {
    res.status(500).json({ message: 'Error saat reset password', error: err.message });
  }
};

// Update password (untuk user yang sudah login)
exports.updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id; // Dari middleware authenticate
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Password saat ini dan password baru wajib diisi' });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User tidak ditemukan' });
    }
    
    // Verifikasi password saat ini
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Password saat ini salah' });
    }
    
    // Hash password baru
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();
    
    res.status(200).json({ message: 'Password berhasil diupdate' });
    
  } catch (err) {
    res.status(500).json({ message: 'Error saat update password', error: err.message });
  }
};