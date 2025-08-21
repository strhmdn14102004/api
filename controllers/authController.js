const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const TimeUtils = require('../utils/timeUtils');
const { sendOtpEmail, sendResetPasswordEmail } = require('../config/email');
const secretKey = process.env.JWT_SECRET;
const userTimezone = timezone && TimeUtils.isValidTimezone(timezone) ? timezone : 'Asia/Jakarta';
// Generate OTP
const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

// Register new user with OTP
exports.register = async (req, res) => {
  try {
    const { username, password, fullName, email, address, phoneNumber } = req.body;
    
    // Validation
    if (!username || !password || !fullName || !email || !address || !phoneNumber) {
      return res.status(400).json({ 
        success: false,
        message: 'All fields are required' 
      });
    }
      // Validasi timezone
   const userTimezone = timezone && TimeUtils.isValidTimezone(timezone) ? timezone : 'Asia/Jakarta';

    // Check if user exists
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Username or email already exists'
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
      message: 'User registered. Please verify your email with the OTP sent.',
      data: {
        userId: newUser._id,
        timezone: userTimezone
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Registration failed',
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
        message: 'Email and OTP are required'
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.emailVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email already verified'
      });
    }

    if (!user.otp || user.otp.code !== otp) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP'
      });
    }

    if (user.otp.expiresAt < TimeUtils.getUTCTime()) {
      return res.status(400).json({
        success: false,
        message: 'OTP has expired'
      });
    }

    user.emailVerified = true;
    user.otp = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Email verified successfully'
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'OTP verification failed',
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
        message: 'Email is required'
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.emailVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email already verified'
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
      message: 'New OTP sent to your email'
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to resend OTP',
      error: err.message
    });
  }
};

// User login
exports.login = async (req, res) => {
  try {
    const { username, password,timezone } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    if (!user.emailVerified) {
      return res.status(403).json({
        success: false,
        message: 'Email not verified. Please verify your email first.'
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
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
      message: 'Login successful',
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
      message: 'Login failed',
      error: err.message
    });
  }
};

// Forgot password
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'If this email exists, a reset link will be sent'
      });
    }

    const resetToken = jwt.sign(
      { id: user._id },
      secretKey + user.password,
      { expiresIn: '15m' }
    );

    const resetLink = `${process.env.CLIENT_URL}/reset-password?token=${resetToken}&id=${user._id}`;

    user.resetToken = {
      token: resetToken,
       expiresAt: TimeUtils.addMinutesUTC(TimeUtils.getUTCTime(), 15) // 15 minutes
    };

    await user.save();
    await sendResetPasswordEmail(email, resetLink);

    res.status(200).json({
      success: true,
      message: 'Password reset link sent to your email'
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to process password reset',
      error: err.message
    });
  }
};

// Reset password
exports.resetPassword = async (req, res) => {
  try {
    const { token, userId, newPassword } = req.body;
    
    if (!token || !userId || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Token, user ID and new password are required'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!user.resetToken || user.resetToken.token !== token) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    if (user.resetToken.expiresAt < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Token has expired'
      });
    }

    // Verify the token
    jwt.verify(token, secretKey + user.password);

    user.password = newPassword;
    user.resetToken = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password reset successful'
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Password reset failed',
      error: err.message
    });
  }
};