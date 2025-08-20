const User = require('../models/User');
const Transaction = require('../models/Transaction');
const BalanceHistory = require('../models/BalanceHistory');
const { sendFormattedTransactionNotification } = require('../config/telegram');
const { sendTransactionEmail } = require('../config/email');

// Get all transactions with filtering and pagination
exports.getAllTransactions = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status, 
      itemType, 
      startDate, 
      endDate,
      userId 
    } = req.query;
    
    const filter = {};
    
    if (status) filter.status = status;
    if (itemType) filter.itemType = itemType;
    if (userId) filter.userId = userId;
    
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }
    
    const transactions = await Transaction.find(filter)
      .populate('userId', 'username fullName email phoneNumber')
      .populate('recipientId', 'username fullName')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const count = await Transaction.countDocuments(filter);
    
    res.status(200).json({
      success: true,
      data: transactions,
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
      message: 'Failed to fetch transactions',
      error: err.message
    });
  }
};

// Get dashboard statistics
exports.getDashboardStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });
    
    const totalTransactions = await Transaction.countDocuments();
    const pendingTransactions = await Transaction.countDocuments({ status: 'pending' });
    const successfulTransactions = await Transaction.countDocuments({ status: 'success' });
    
    const totalRevenue = await Transaction.aggregate([
      { $match: { status: 'success', itemType: { $in: ['imei', 'bypass'] } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    
    const totalTopups = await Transaction.aggregate([
      { $match: { status: 'success', itemType: 'topup' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    
    const recentTransactions = await Transaction.find()
      .populate('userId', 'username fullName')
      .sort({ createdAt: -1 })
      .limit(5);
    
    res.status(200).json({
      success: true,
      data: {
        users: {
          total: totalUsers,
          active: activeUsers
        },
        transactions: {
          total: totalTransactions,
          pending: pendingTransactions,
          successful: successfulTransactions
        },
        revenue: totalRevenue[0]?.total || 0,
        topups: totalTopups[0]?.total || 0,
        recentTransactions
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard stats',
      error: err.message
    });
  }
};

// Manual transaction approval (for non-Midtrans payments)
exports.manualApproveTransaction = async (req, res) => {
  try {
    const { transactionId, paymentMethod, adminNotes } = req.body;
    
    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message: 'Transaction ID is required'
      });
    }
    
    const transaction = await Transaction.findById(transactionId)
      .populate('userId', 'fullName email phoneNumber balance');
    
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }
    
    if (transaction.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Transaction is not pending approval'
      });
    }
    
    // Update transaction status
    transaction.status = 'success';
    transaction.paymentMethod = paymentMethod || 'manual';
    transaction.metadata = {
      ...transaction.metadata,
      adminNotes,
      approvedAt: new Date(),
      approvedBy: req.user.id
    };
    
    await transaction.save();
    
    // Update user balance if it's a topup
    if (transaction.itemType === 'topup') {
      const user = await User.findById(transaction.userId);
      user.balance += transaction.amount;
      await user.save();
      
      // Record balance history
      const balanceHistory = new BalanceHistory({
        userId: user._id,
        transactionId: transaction._id,
        amount: transaction.amount,
        previousBalance: user.balance - transaction.amount,
        newBalance: user.balance,
        type: 'topup',
        description: `Top up approved manually by admin (${paymentMethod || 'manual'})`
      });
      
      await balanceHistory.save();
    }
    
    // Send notifications
    await sendFormattedTransactionNotification({
      transactionId: transaction._id,
      customerName: transaction.userId.fullName,
      customerEmail: transaction.userId.email,
      customerPhone: transaction.userId.phoneNumber,
      productName: transaction.itemName,
      amount: transaction.amount,
      status: 'success',
      transactionType: transaction.itemType
    });
    
    await sendTransactionEmail(transaction.userId.email, transaction, transaction.userId);
    
    res.status(200).json({
      success: true,
      message: 'Transaction approved successfully',
      data: transaction
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to approve transaction',
      error: err.message
    });
  }
};

// Reject transaction
exports.rejectTransaction = async (req, res) => {
  try {
    const { transactionId, adminNotes } = req.body;
    
    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message: 'Transaction ID is required'
      });
    }
    
    const transaction = await Transaction.findById(transactionId)
      .populate('userId', 'fullName email phoneNumber');
    
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }
    
    if (transaction.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Transaction is not pending'
      });
    }
    
    // Update transaction status
    transaction.status = 'failed';
    transaction.metadata = {
      ...transaction.metadata,
      adminNotes,
      rejectedAt: new Date(),
      rejectedBy: req.user.id
    };
    
    await transaction.save();
    
    // Send notifications
    await sendFormattedTransactionNotification({
      transactionId: transaction._id,
      customerName: transaction.userId.fullName,
      customerEmail: transaction.userId.email,
      customerPhone: transaction.userId.phoneNumber,
      productName: transaction.itemName,
      amount: transaction.amount,
      status: 'failed',
      transactionType: transaction.itemType
    });
    
    await sendTransactionEmail(transaction.userId.email, transaction, transaction.userId);
    
    res.status(200).json({
      success: true,
      message: 'Transaction rejected successfully',
      data: transaction
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to reject transaction',
      error: err.message
    });
  }
};

// Get all users with pagination
exports.getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, search } = req.query;
    
    const filter = { isActive: true };
    
    if (search) {
      filter.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { fullName: { $regex: search, $options: 'i' } },
        { phoneNumber: { $regex: search, $options: 'i' } }
      ];
    }
    
    const users = await User.find(filter)
      .select('-password -otp -resetToken')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const count = await User.countDocuments(filter);
    
    res.status(200).json({
      success: true,
      data: users,
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
      message: 'Failed to fetch users',
      error: err.message
    });
  }
};