const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const TimeUtils = require('../utils/timeUtils');

const userSchema = new mongoose.Schema({
  username: { 
    type: String, 
    unique: true, 
    required: true,
    trim: true,
    lowercase: true
  },
  password: { 
    type: String, 
    required: true 
  },
  fullName: { 
    type: String, 
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please fill a valid email address']
  },
  address: { 
    type: String, 
    required: true,
    trim: true
  },
  phoneNumber: { 
    type: String, 
    required: true,
    trim: true
  },
  fcmToken: { 
    type: String 
  },
  timezone: {
    type: String,
    default: 'Asia/Jakarta',
    validate: {
      validator: function(tz) {
        return TimeUtils.isValidTimezone(tz);
      },
      message: 'Invalid timezone'
    }
  },
  balance: {
    type: Number,
    default: 0,
    min: 0
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  otp: {
    code: String,
    expiresAt: Date
  },
  resetToken: {
    token: String,
    expiresAt: Date
  },
  createdAt: {
    type: Date,
    default: TimeUtils.getUTCTime
  },
  updatedAt: {
    type: Date,
    default: TimeUtils.getUTCTime
  }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Update updatedAt sebelum save
userSchema.pre('save', function(next) {
  this.updatedAt = TimeUtils.getUTCTime();
  next();
});

// Method to compare passwords
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Virtual untuk format waktu user
userSchema.virtual('createdAtFormatted').get(function() {
  return TimeUtils.formatForUser(this.createdAt, this.timezone);
});

userSchema.virtual('updatedAtFormatted').get(function() {
  return TimeUtils.formatForUser(this.updatedAt, this.timezone);
});

module.exports = mongoose.model('User', userSchema);