const mongoose = require('mongoose');
const TimeUtils = require('../utils/timeUtils');

const transactionSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  itemType: { 
    type: String, 
    enum: ['imei', 'bypass', 'topup', 'withdrawal', 'transfer'], 
    required: true 
  },
  itemId: { 
    type: mongoose.Schema.Types.ObjectId 
  },
  itemName: { 
    type: String, 
    trim: true
  },
  amount: { 
    type: Number, 
    required: true,
    min: 0
  },
  status: { 
    type: String, 
    enum: ['pending', 'failed', 'success', 'cancelled'], 
    default: 'pending' 
  },
  paymentUrl: { 
    type: String 
  },
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed
  },
  createdAt: { 
    type: Date, 
    default: TimeUtils.getUTCTime
  },
  updatedAt: { 
    type: Date, 
    default: TimeUtils.getUTCTime
  }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Update updatedAt sebelum save
transactionSchema.pre('save', function(next) {
  this.updatedAt = TimeUtils.getUTCTime();
  next();
});

// Virtual for transaction type
transactionSchema.virtual('type').get(function() {
  if (this.itemType === 'topup') return 'Top Up';
  if (this.itemType === 'withdrawal') return 'Withdrawal';
  if (this.itemType === 'transfer') return 'Transfer';
  return 'Product Purchase';
});

// Virtual untuk format waktu berdasarkan user timezone
transactionSchema.virtual('createdAtFormatted').get(function() {
  // Butuh populate user untuk mendapatkan timezone
  if (this.userId && this.userId.timezone) {
    return TimeUtils.formatForUser(this.createdAt, this.userId.timezone);
  }
  return TimeUtils.formatForUser(this.createdAt, 'Asia/Jakarta');
});

module.exports = mongoose.model('Transaction', transactionSchema);