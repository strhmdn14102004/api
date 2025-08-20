const mongoose = require('mongoose');

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
  paymentMethod: {
    type: String,
    enum: ['midtrans', 'manual', 'balance'],
    default: 'midtrans'
  },
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed
  },
  midtransResponse: {
    type: mongoose.Schema.Types.Mixed
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Update the updatedAt field before saving
transactionSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Virtual for transaction type
transactionSchema.virtual('type').get(function() {
  if (this.itemType === 'topup') return 'Top Up';
  if (this.itemType === 'withdrawal') return 'Withdrawal';
  if (this.itemType === 'transfer') return 'Transfer';
  return 'Product Purchase';
});

// Index for better performance
transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ status: 1 });
transactionSchema.index({ itemType: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);