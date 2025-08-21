const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const TimeUtils = require('../utils/timeUtils');
const { sendOtpEmail, sendResetPasswordEmail } = require('../config/email');
const secretKey = process.env.JWT_SECRET;

// Generate OTP
const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

// Register new user with OTP
exports.register = async (req, res) => {
  try {
    const { username, password, fullName, email, address, phoneNumber, timezone } = req.body;
    
    // Validation
    if (!username || !password || !fullName || !email || !address || !phoneNumber) {
      return res.status(400).json({ 
        success: false,
        message: 'Semua field harus diisi' 
      });
    }

    // Validasi timezone - handle undefined/null
    const userTimezone = timezone && TimeUtils.isValidTimezone(timezone) ? timezone : 'Asia/Jakarta';

    // Check if user exists
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Username atau email sudah terdaftar'
      });
    }

    // Create user with OTP
    const otpCode = generateOtp();
    const otpExpires = TimeUtils.addMinutesUTC(TimeUtils.getUTCTime(), 5); // 5 minutes

    const newUser = new User({
      username,
      password,
      fullName,
      email,
      address,
      phoneNumber,
      timezone: userTimezone,
      otp: {
        code: otpCode,
        expiresAt: otpExpires
      }
    });

    await newUser.save();

    // Send OTP email
    await sendOtpEmail(email, otpCode);

    res.status(201).json({
      success: true,
      message: 'Registrasi berhasil, silakan cek email Anda untuk OTP',
      data: {
        userId: newUser._id,
        timezone: userTimezone
      }
    });
  } catch (err) {
    console.error('❌ Registration Error:', err);
    res.status(500).json({
      success: false,
      message: 'Gagal melakukan registrasi',
      error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
  }
};
//verify reset password token
exports.verifyResetToken = async (req, res) => {
    try {
        const { email, token } = req.body;
        
        if (!email || !token) {
            return res.status(400).json({
                success: false,
                message: 'Email dan token harus diisi'
            });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Pengguna tidak ditemukan'
            });
        }

        if (!user.resetToken || user.resetToken.token !== token) {
            return res.status(400).json({
                success: false,
                message: 'Token tidak valid'
            });
        }

        if (user.resetToken.expiresAt < TimeUtils.getUTCTime()) {
            return res.status(400).json({
                success: false,
                message: 'Token telah kedaluwarsa'
            });
        }

        // Verify the token
        jwt.verify(token, secretKey + user.password);

        res.status(200).json({
            success: true,
            message: 'Token valid',
            data: {
                userId: user._id
            }
        });
    } catch (err) {
        res.status(400).json({
            success: false,
            message: 'Token tidak valid',
            error: err.message
        });
    }
};
// Verify OTP
exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    
    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Email dan OTP harus diisi'
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Pengguna tidak ditemukan'
      });
    }

    if (user.emailVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email sudah diverifikasi'
      });
    }

    if (!user.otp || user.otp.code !== otp) {
      return res.status(400).json({
        success: false,
        message: 'OTP tidak valid'
      });
    }

    if (user.otp.expiresAt < TimeUtils.getUTCTime()) {
      return res.status(400).json({
        success: false,
        message: 'OTP telah kedaluwarsa'
      });
    }

    user.emailVerified = true;
    user.otp = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Email berhasil diverifikasi',
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Gagal memverifikasi OTP',
      error: err.message
    });
  }
};

// Resend OTP
exports.resendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email diperlukan'
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Pengguna tidak ditemukan'
      });
    }

    if (user.emailVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email sudah diverifikasi, tidak perlu mengirim ulang OTP'
      });
    }

    const otpCode = generateOtp();
    const otpExpires = TimeUtils.addMinutesUTC(TimeUtils.getUTCTime(), 5); // 5 minutes

    user.otp = {
      code: otpCode,
      expiresAt: otpExpires
    };

    await user.save();
    await sendOtpEmail(email, otpCode);

    res.status(200).json({
      success: true,
      message: 'OTP baru telah dikirim ke email Anda',
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Gagal mengirim ulang OTP',
      error: err.message
    });
  }
};

// User login
exports.login = async (req, res) => {
  try {
    const { username, password, timezone } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username dan password harus diisi'
      });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Username atau password salah'
      });
    }

    if (!user.emailVerified) {
      return res.status(403).json({
        success: false,
        message: 'Email Anda belum diverifikasi. Silakan verifikasi email Anda terlebih dahulu.'
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Username atau password salah'
      });
    }

    // Update timezone jika provided
    if (timezone && TimeUtils.isValidTimezone(timezone)) {
      user.timezone = timezone;
      await user.save();
    }

    const token = jwt.sign(
      { 
        id: user._id, 
        username: user.username,
        email: user.email,
        timezone: user.timezone
      }, 
      secretKey, 
      { expiresIn: '1h' }
    );

    res.status(200).json({
      success: true,
      message: 'Login berhasil',
      token,
      user: {
        id: user._id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        address: user.address,
        phoneNumber: user.phoneNumber,
        balance: user.balance,
        timezone: user.timezone,
        createdAt: TimeUtils.formatForUser(user.createdAt, user.timezone)
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Gagal melakukan login',
      error: err.message
    });
  }
};

// Forgot password
// Forgot password
exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email diperlukan'
            });
        }

        const user = await User.findOne({ email });
        if (!user) {
            // Untuk keamanan, tetap return success meski email tidak ditemukan
            return res.status(200).json({
                success: true,
                message: 'Jika email ini terdaftar, token reset akan dikirim'
            });
        }

        const resetToken = jwt.sign(
            { id: user._id },
            secretKey + user.password,
            { expiresIn: '15m' }
        );

        // Simpan token ke database
        user.resetToken = {
            token: resetToken,
            expiresAt: TimeUtils.addMinutesUTC(TimeUtils.getUTCTime(), 15)
        };

        await user.save();
        
        // Kirim email dengan token saja (bukan link)
        await sendResetPasswordEmail(email, resetToken);

        res.status(200).json({
            success: true,
            message: 'Token reset password telah dikirim ke email Anda',
            data: {
                userId: user._id // Kirim juga user ID untuk memudahkan frontend
            }
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: 'Gagal mengirim token reset password',
            error: err.message
        });
    }
};

// Reset password
// Reset password
exports.resetPassword = async (req, res) => {
    try {
        const { email, token, newPassword } = req.body;
        
        if (!email || !token || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Email, token, dan password baru harus diisi'
            });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Pengguna tidak ditemukan'
            });
        }

        if (!user.resetToken || user.resetToken.token !== token) {
            return res.status(400).json({
                success: false,
                message: 'Token tidak valid'
            });
        }

        if (user.resetToken.expiresAt < TimeUtils.getUTCTime()) {
            return res.status(400).json({
                success: false,
                message: 'Token telah kedaluwarsa'
            });
        }

        // Verify the token
        jwt.verify(token, secretKey + user.password);

        user.password = newPassword;
        user.resetToken = undefined;
        await user.save();

        res.status(200).json({
            success: true,
            message: 'Password berhasil direset'
        });
    } catch (err) {
        res.status(400).json({
            success: false,
            message: 'Gagal mereset password',
            error: err.message
        });
    }
};