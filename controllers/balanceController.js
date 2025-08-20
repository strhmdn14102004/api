const User = require('../models/User');
const Transaction = require('../models/Transaction');
const BalanceHistory = require('../models/BalanceHistory');
const { sendEmail } = require('../config/email');
const authenticateToken = require('../middlewares/authMiddleware');

// Get user balance
exports.getBalance = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('balance');
    res.status(200).json({
      success: true,
      data: {
        balance: user.balance
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Error fetching balance',
      error: err.message
    });
  }
};

// Top up balance
exports.topUp = async (req, res) => {
  try {
    const { amount } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be greater than 0'
      });
    }

    const transaction = new Transaction({
      userId: req.user.id,
      itemType: 'topup',
      amount,
      status: 'pending'
    });

    await transaction.save();

    res.status(201).json({
      success: true,
      message: 'Top up request created',
      data: {
        transactionId: transaction._id,
        amount
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Error processing top up',
      error: err.message
    });
  }
};

// Withdraw balance
exports.withdraw = async (req, res) => {
  try {
    const { amount } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be greater than 0'
      });
    }

    const user = await User.findById(req.user.id);
    if (user.balance < amount) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance'
      });
    }

    // Deduct balance immediately for withdrawal
    user.balance -= amount;
    await user.save();

    const transaction = new Transaction({
      userId: req.user.id,
      itemType: 'withdrawal',
      amount,
      status: 'pending'
    });

    await transaction.save();

    // Record balance history
    const balanceHistory = new BalanceHistory({
      userId: req.user.id,
      transactionId: transaction._id,
      amount: -amount,
      previousBalance: user.balance + amount,
      newBalance: user.balance,
      type: 'withdrawal',
      description: 'Withdrawal request'
    });

    await balanceHistory.save();

    res.status(201).json({
      success: true,
      message: 'Withdrawal request created',
      data: {
        transactionId: transaction._id,
        amount
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Error processing withdrawal',
      error: err.message
    });
  }
};

// Transfer balance to another user
exports.transfer = async (req, res) => {
  try {
    const { recipientUsername, amount, notes } = req.body;
    
    if (!recipientUsername || !amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Recipient and amount are required'
      });
    }

    if (req.user.username === recipientUsername) {
      return res.status(400).json({
        success: false,
        message: 'Cannot transfer to yourself'
      });
    }

    const sender = await User.findById(req.user.id);
    const recipient = await User.findOne({ username: recipientUsername });

    if (!recipient) {
      return res.status(404).json({
        success: false,
        message: 'Recipient not found'
      });
    }

    if (sender.balance < amount) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance'
      });
    }

    // Perform transfer
    sender.balance -= amount;
    recipient.balance += amount;

    await Promise.all([sender.save(), recipient.save()]);

    const transaction = new Transaction({
      userId: req.user.id,
      itemType: 'transfer',
      amount,
      status: 'success',
      recipientId: recipient._id,
      metadata: {
        notes,
        recipientName: recipient.fullName
      }
    });

    await transaction.save();

    // Record balance history for both users
    const senderHistory = new BalanceHistory({
      userId: sender._id,
      transactionId: transaction._id,
      amount: -amount,
      previousBalance: sender.balance + amount,
      newBalance: sender.balance,
      type: 'transfer',
      description: `Transfer to ${recipient.username}`
    });

    const recipientHistory = new BalanceHistory({
      userId: recipient._id,
      transactionId: transaction._id,
      amount,
      previousBalance: recipient.balance - amount,
      newBalance: recipient.balance,
      type: 'transfer',
      description: `Transfer from ${sender.username}`
    });

    await Promise.all([senderHistory.save(), recipientHistory.save()]);

    res.status(201).json({
      success: true,
      message: 'Transfer successful',
      data: {
        transactionId: transaction._id,
        amount,
        recipient: {
          username: recipient.username,
          fullName: recipient.fullName
        }
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Error processing transfer',
      error: err.message
    });
  }
};

// Get balance history
exports.getHistory = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    
    const history = await BalanceHistory.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    const count = await BalanceHistory.countDocuments({ userId: req.user.id });

    res.status(200).json({
      success: true,
      data: history,
      pagination: {
        total: count,
        page: parseInt(page),
        pages: Math.ceil(count / limit),
        limit: parseInt(limit)
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Error fetching balance history',
      error: err.message
    });
  }
};