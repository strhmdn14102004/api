const User = require('../models/User');
const Transaction = require('../models/Transaction');
const BalanceHistory = require('../models/BalanceHistory');
const ImeiData = require('../models/ImeiData');
const BypassData = require('../models/BypassData');

// Get home page data
exports.getHomeData = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('username fullName email phoneNumber address balance fcmToken emailVerified createdAt');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Pengguna tidak ditemukan'
      });
    }

    // Get recent transactions (last 5)
    const recentTransactions = await Transaction.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('itemType itemName amount status createdAt')
      .lean();

    // Get today's transactions count
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const todayTransactions = await Transaction.countDocuments({
      userId: req.user.id,
      createdAt: { $gte: todayStart, $lte: todayEnd }
    });

    // Get total transactions count
    const totalTransactions = await Transaction.countDocuments({ 
      userId: req.user.id 
    });

    // Get successful transactions count
    const successfulTransactions = await Transaction.countDocuments({ 
      userId: req.user.id,
      status: 'success'
    });

    // Get available products count
    const imeiProductsCount = await ImeiData.countDocuments();
    const bypassProductsCount = await BypassData.countDocuments();
    const totalProducts = imeiProductsCount + bypassProductsCount;

    // Get balance statistics
    const balanceHistory = await BalanceHistory.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('amount type description createdAt')
      .lean();

    // Calculate total spent
    const totalSpentResult = await BalanceHistory.aggregate([
      { $match: { userId: req.user._id, amount: { $lt: 0 } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    
    const totalSpent = totalSpentResult.length > 0 ? Math.abs(totalSpentResult[0].total) : 0;

    // Calculate total received
    const totalReceivedResult = await BalanceHistory.aggregate([
      { $match: { userId: req.user._id, amount: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    
    const totalReceived = totalReceivedResult.length > 0 ? totalReceivedResult[0].total : 0;

    // Format response
    const homeData = {
      user: {
        id: user._id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        address: user.address,
        balance: user.balance,
        emailVerified: user.emailVerified,
        fcmToken: user.fcmToken,
        memberSince: user.createdAt
      },
      statistics: {
        balance: user.balance,
        totalTransactions,
        successfulTransactions,
        todayTransactions,
        totalSpent,
        totalReceived,
        totalProducts,
        imeiProducts: imeiProductsCount,
        bypassProducts: bypassProductsCount
      },
      recentTransactions: recentTransactions.map(tx => ({
        id: tx._id,
        type: tx.itemType,
        name: tx.itemName || this.getTransactionTypeName(tx.itemType),
        amount: tx.amount,
        status: tx.status,
        date: tx.createdAt,
        statusDisplay: this.getStatusDisplay(tx.status)
      })),
      balanceHistory: balanceHistory.map(history => ({
        amount: history.amount,
        type: history.type,
        description: history.description,
        date: history.createdAt,
        isPositive: history.amount > 0
      })),
      quickActions: [
        {
          id: 'topup',
          name: 'Top Up',
          icon: '💰',
          description: 'Isi saldo akun Anda',
          route: '/balance/topup'
        },
        {
          id: 'transfer',
          name: 'Transfer',
          icon: '➡️',
          description: 'Transfer ke pengguna lain',
          route: '/balance/transfer'
        },
        {
          id: 'imei',
          name: 'IMEI Services',
          icon: '📱',
          description: 'Layanan IMEI',
          route: '/imei'
        },
        {
          id: 'bypass',
          name: 'Bypass Services',
          icon: '🔓',
          description: 'Layanan Bypass',
          route: '/bypass'
        }
      ],
      serverInfo: {
        currentTime: new Date(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        environment: process.env.NODE_ENV || 'development'
      }
    };

    res.status(200).json({
      success: true,
      message: 'Data beranda berhasil diambil',
      data: homeData
    });
  } catch (err) {
    console.error('❌ Home Data Error:', err);
    res.status(500).json({
      success: false,
      message: 'Gagal mengambil data beranda',
      error: err.message
    });
  }
};

// Helper method to get transaction type name
exports.getTransactionTypeName = (type) => {
  const typeNames = {
    'topup': 'Top Up Balance',
    'withdrawal': 'Withdrawal',
    'transfer': 'Balance Transfer',
    'imei': 'IMEI Service',
    'bypass': 'Bypass Service'
  };
  return typeNames[type] || type;
};

// Helper method to get status display
exports.getStatusDisplay = (status) => {
  const statusDisplay = {
    'pending': { text: 'Pending', emoji: '⏳', color: '#FFC107' },
    'success': { text: 'Success', emoji: '✅', color: '#4CAF50' },
    'failed': { text: 'Failed', emoji: '❌', color: '#F44336' },
    'cancelled': { text: 'Cancelled', emoji: '🚫', color: '#9E9E9E' }
  };
  return statusDisplay[status] || { text: status, emoji: '❓', color: '#9E9E9E' };
};

// Get dashboard statistics (for charts and graphs)
exports.getDashboardStats = async (req, res) => {
  try {
    const { period = '7d' } = req.query; // 7d, 30d, 90d
    
    let days;
    switch (period) {
      case '7d':
        days = 7;
        break;
      case '30d':
        days = 30;
        break;
      case '90d':
        days = 90;
        break;
      default:
        days = 7;
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    // Get transaction statistics by date
    const transactionStats = await Transaction.aggregate([
      {
        $match: {
          userId: req.user._id,
          createdAt: { $gte: startDate },
          status: 'success'
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Get transaction statistics by type
    const transactionByType = await Transaction.aggregate([
      {
        $match: {
          userId: req.user._id,
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: "$itemType",
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" }
        }
      }
    ]);

    // Get balance flow
    const balanceFlow = await BalanceHistory.aggregate([
      {
        $match: {
          userId: req.user._id,
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          income: {
            $sum: { $cond: [{ $gt: ["$amount", 0] }, "$amount", 0] }
          },
          expense: {
            $sum: { $cond: [{ $lt: ["$amount", 0] }, "$amount", 0] }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.status(200).json({
      success: true,
      message: 'Statistik dashboard berhasil diambil',
      data: {
        period,
        transactionStats,
        transactionByType,
        balanceFlow,
        summary: {
          totalTransactions: transactionStats.reduce((sum, item) => sum + item.count, 0),
          totalAmount: transactionStats.reduce((sum, item) => sum + item.totalAmount, 0),
          totalIncome: balanceFlow.reduce((sum, item) => sum + item.income, 0),
          totalExpense: Math.abs(balanceFlow.reduce((sum, item) => sum + item.expense, 0))
        }
      }
    });
  } catch (err) {
    console.error('❌ Dashboard Stats Error:', err);
    res.status(500).json({
      success: false,
      message: 'Gagal mengambil statistik dashboard',
      error: err.message
    });
  }
};

// Get user profile summary
exports.getProfileSummary = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('username fullName email phoneNumber address balance emailVerified createdAt');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Pengguna tidak ditemukan'
      });
    }

    // Get various counts
    const [
      totalTransactions,
      successfulTransactions,
      failedTransactions,
      pendingTransactions
    ] = await Promise.all([
      Transaction.countDocuments({ userId: req.user.id }),
      Transaction.countDocuments({ userId: req.user.id, status: 'success' }),
      Transaction.countDocuments({ userId: req.user.id, status: 'failed' }),
      Transaction.countDocuments({ userId: req.user.id, status: 'pending' })
    ]);

    // Get last login time (approximate)
    const lastLogin = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago for demo

    const profileSummary = {
      user: {
        id: user._id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        address: user.address,
        balance: user.balance,
        emailVerified: user.emailVerified,
        memberSince: user.createdAt,
        accountAge: Math.floor((Date.now() - user.createdAt) / (1000 * 60 * 60 * 24)) + ' days'
      },
      activity: {
        totalTransactions,
        successfulTransactions,
        failedTransactions,
        pendingTransactions,
        successRate: totalTransactions > 0 ? ((successfulTransactions / totalTransactions) * 100).toFixed(1) + '%' : '0%',
        lastLogin: lastLogin
      },
      status: {
        isActive: true,
        isVerified: user.emailVerified,
        hasBalance: user.balance > 0,
        hasRecentActivity: totalTransactions > 0
      }
    };

    res.status(200).json({
      success: true,
      message: 'Ringkasan profil berhasil diambil',
      data: profileSummary
    });
  } catch (err) {
    console.error('❌ Profile Summary Error:', err);
    res.status(500).json({
      success: false,
      message: 'Gagal mengambil ringkasan profil',
      error: err.message
    });
  }
};