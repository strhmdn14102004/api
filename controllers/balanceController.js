const User = require('../models/User');
const Transaction = require('../models/Transaction');
const BalanceHistory = require('../models/BalanceHistory');
const snap = require('../config/midtrans');
const sendTelegramNotification = require('../config/telegram');
const { sendTransactionEmail } = require('../config/email');
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

// Top up balance with Midtrans payment
exports.topUp = async (req, res) => {
  try {
    const { amount } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be greater than 0'
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Create transaction
    const transaction = new Transaction({
      userId: req.user.id,
      itemType: 'topup',
      amount,
      status: 'pending'
    });

    await transaction.save();

    // Create Midtrans payment
    const parameter = {
      transaction_details: {
        order_id: transaction._id.toString(),
        gross_amount: amount
      },
      customer_details: {
        first_name: user.fullName,
        email: user.email,
        phone: user.phoneNumber
      },
      item_details: [{
        id: 'topup',
        name: 'Top Up Balance',
        price: amount,
        quantity: 1
      }]
    };

    const transactionData = await snap.createTransaction(parameter);
    transaction.paymentUrl = transactionData.redirect_url;
    await transaction.save();

    // Send Telegram notification
    const telegramMessage = `
💰 <b>TOP UP REQUEST</b> 💰
------------------------
📌 <b>Transaction ID:</b> ${transaction._id}
👤 <b>Customer:</b> ${user.fullName}
📧 <b>Email:</b> ${user.email}
📱 <b>Phone:</b> ${user.phoneNumber}
💵 <b>Amount:</b> Rp${amount.toLocaleString('id-ID')}
📅 <b>Time:</b> ${new Date().toLocaleString('id-ID')}
🔗 <b>Payment Link:</b> <a href="${transactionData.redirect_url}">Click here to pay</a>
------------------------
<b>Status:</b> <i>Pending Payment</i> ⏳
    `;
    
    await sendTelegramNotification(telegramMessage);

    // Send email notification
    await sendTransactionEmail(user.email, transaction, user);

    res.status(201).json({
      success: true,
      message: 'Top up request created',
      data: {
        transactionId: transaction._id,
        amount,
        paymentUrl: transactionData.redirect_url
      }
    });
  } catch (err) {
    console.error('❌ Top Up Error:', err);
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

    // Create withdrawal transaction
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
      previousBalance: user.balance,
      newBalance: user.balance,
      type: 'withdrawal',
      description: 'Withdrawal request - pending approval'
    });

    await balanceHistory.save();

    // Send Telegram notification for admin approval
    const telegramMessage = `
💸 <b>WITHDRAWAL REQUEST</b> 💸
------------------------
📌 <b>Transaction ID:</b> ${transaction._id}
👤 <b>Customer:</b> ${user.fullName}
📧 <b>Email:</b> ${user.email}
📱 <b>Phone:</b> ${user.phoneNumber}
💵 <b>Amount:</b> Rp${amount.toLocaleString('id-ID')}
💰 <b>Current Balance:</b> Rp${user.balance.toLocaleString('id-ID')}
📅 <b>Time:</b> ${new Date().toLocaleString('id-ID')}
------------------------
<b>Status:</b> <i>Pending Approval</i> ⏳
<b>Action Required:</b> Manual approval needed
    `;
    
    await sendTelegramNotification(telegramMessage);

    res.status(201).json({
      success: true,
      message: 'Withdrawal request created - awaiting admin approval',
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
        recipientName: recipient.fullName,
        recipientPhone: recipient.phoneNumber
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

    // Send Telegram notification
    const telegramMessage = `
🔄 <b>BALANCE TRANSFER</b> 🔄
------------------------
📌 <b>Transaction ID:</b> ${transaction._id}
👤 <b>Sender:</b> ${sender.fullName}
📧 <b>Sender Email:</b> ${sender.email}
📱 <b>Sender Phone:</b> ${sender.phoneNumber}
👤 <b>Recipient:</b> ${recipient.fullName}
📱 <b>Recipient Phone:</b> ${recipient.phoneNumber}
💵 <b>Amount:</b> Rp${amount.toLocaleString('id-ID')}
📝 <b>Notes:</b> ${notes || 'No notes'}
📅 <b>Time:</b> ${new Date().toLocaleString('id-ID')}
------------------------
<b>Status:</b> <i>Completed</i> ✅
    `;
    
    await sendTelegramNotification(telegramMessage);

    // Send email notifications to both users
    await sendTransactionEmail(sender.email, transaction, sender);
    await sendTransactionEmail(recipient.email, {
      ...transaction.toObject(),
      itemName: `Transfer from ${sender.username}`
    }, recipient);

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