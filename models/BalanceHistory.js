const mongoose = require('mongoose');
const TimeUtils = require('../utils/timeUtils');

const balanceHistorySchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  transactionId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Transaction' 
  },
  amount: {
    type: Number,
    required: true
  },
  previousBalance: {
    type: Number,
    required: true
  },
  newBalance: {
    type: Number,
    required: true
  },
  type: {
    type: String,
    enum: ['topup', 'withdrawal', 'transfer', 'purchase', 'income', 'refund', 'fee','transfer_in', 'transfer_out'],
    required: true
  },
  description: {
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
  createdAt: {
    type: Date,
    default:TimeUtils.getUTCTime
  }
});

module.exports = mongoose.model('BalanceHistory', balanceHistorySchema);