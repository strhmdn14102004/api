const mongoose = require('mongoose');

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
    enum: ['topup', 'withdrawal', 'transfer', 'purchase', 'income'],
    required: true
  },
  description: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('BalanceHistory', balanceHistorySchema);