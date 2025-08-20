const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const ImeiData = require('../models/ImeiData');
const BypassData = require('../models/BypassData');
const BalanceHistory = require('../models/BalanceHistory');
const snap = require('../config/midtrans');
const sendTelegramNotification = require('../config/telegram');
const { sendTransactionEmail } = require('../config/email');
const admin = require('../config/firebase');

// Create new transaction
exports.createTransaction = async (req, res) => {
  try {
    const { itemType, itemId } = req.body;
    
    if (!itemType || !itemId) {
      return res.status(400).json({ 
        success: false,
        message: 'Item type and ID are required' 
      });
    }
    
    let item;
    if (itemType === 'imei') {
      item = await ImeiData.findById(itemId);
    } else if (itemType === 'bypass') {
      item = await BypassData.findById(itemId);
    }
    
    if (!item) {
      return res.status(404).json({ 
        success: false,
        message: 'Item not found' 
      });
    }
    
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }
    
    const transaction = new Transaction({
      userId: req.user.id,
      itemType,
      itemId,
      itemName: item.name,
      amount: item.price,
      status: 'pending'
    });
    
    await transaction.save();
    
    const parameter = {
      transaction_details: {
        order_id: transaction._id.toString(),
        gross_amount: item.price
      },
      item_details: [{
        id: itemId,
        name: item.name,
        price: item.price,
        quantity: 1
      }],
      customer_details: {
        first_name: user.fullName,
        email: user.email,
        phone: user.phoneNumber
      }
    };
    
    const transactionData = await snap.createTransaction(parameter);
    transaction.paymentUrl = transactionData.redirect_url;
    await transaction.save();

    // Send Telegram notification
    const telegramMessage = `
🛒 <b>NEW TRANSACTION</b> 🛒
------------------------
📌 <b>Transaction ID:</b> ${transaction._id}
👤 <b>Customer:</b> ${user.fullName}
📧 <b>Email:</b> ${user.email}
📱 <b>Phone:</b> ${user.phoneNumber}
🛍️ <b>Product:</b> ${item.name}
💰 <b>Price:</b> Rp${item.price.toLocaleString('id-ID')}
📅 <b>Time:</b> ${new Date().toLocaleString('id-ID')}
🔗 <b>Payment Link:</b> <a href="${transactionData.redirect_url}">Click here to pay</a>
------------------------
<b>Status:</b> <i>Waiting for payment</i> ⏳
    `;
    
    await sendTelegramNotification(telegramMessage);

    // Send email notification
    await sendTransactionEmail(user.email, transaction, user);

    res.status(201).json({ 
      success: true,
      message: 'Transaction created',
      data: {
        paymentUrl: transaction.paymentUrl,
        transaction
      }
    });
  } catch (err) {
    console.error('❌ Transaction Error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Failed to create transaction', 
      error: err.message 
    });
  }
};

// Midtrans webhook handler
exports.midtransWebhook = async (req, res) => {
  try {
    const { order_id, transaction_status, fraud_status } = req.body;
    
    if (!order_id || !transaction_status) {
      return res.status(400).json({
        success: false,
        message: 'Incomplete payload'
      });
    }
    
    if (!mongoose.Types.ObjectId.isValid(order_id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid transaction ID format'
      });
    }
    
    const transaction = await Transaction.findById(order_id)
      .populate('userId', 'fcmToken fullName email phoneNumber balance');
      
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }
    
    let newStatus;
    if (transaction_status === 'capture' || transaction_status === 'settlement') {
      newStatus = 'success';
    } else if (transaction_status === 'pending') {
      newStatus = 'pending';
    } else if (transaction_status === 'deny' || transaction_status === 'expire' || transaction_status === 'cancel') {
      newStatus = 'failed';
    }
    
    if (newStatus && transaction.status !== newStatus) {
      transaction.status = newStatus;
      await transaction.save();
      
      // Update user balance if transaction is successful
      if (newStatus === 'success' && transaction.itemType === 'topup') {
        const user = await User.findById(transaction.userId);
        const previousBalance = user.balance;
        user.balance += transaction.amount;
        await user.save();
        
        // Record balance history
        const balanceHistory = new BalanceHistory({
          userId: user._id,
          transactionId: transaction._id,
          amount: transaction.amount,
          previousBalance: previousBalance,
          newBalance: user.balance,
          type: 'topup',
          description: 'Top up balance via Midtrans'
        });
        
        await balanceHistory.save();
      }
      
      // Send notifications
      await this.sendTransactionNotifications(transaction);
    }
    
    res.status(200).json({
      success: true,
      message: 'Webhook processed',
      data: {
        transactionId: transaction._id,
        status: transaction.status
      }
    });
  } catch (err) {
    console.error('❌ Webhook Error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to process webhook',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// Helper method to send transaction notifications
exports.sendTransactionNotifications = async (transaction) => {
  try {
    const user = await User.findById(transaction.userId);
    if (!user) {
      console.error('❌ User not found for notification');
      return;
    }
    
    let statusEmoji = '';
    let statusText = '';
    
    switch (transaction.status) {
      case 'success':
        statusEmoji = '✅';
        statusText = 'SUCCESS';
        break;
      case 'failed':
        statusEmoji = '❌';
        statusText = 'FAILED';
        break;
      case 'pending':
        statusEmoji = '⏳';
        statusText = 'PENDING';
        break;
      default:
        statusEmoji = '';
        statusText = transaction.status.toUpperCase();
    }
    
    // Telegram notification
    const telegramMessage = `
📢 <b>TRANSACTION UPDATE</b> 📢
------------------------
📌 <b>Transaction ID:</b> ${transaction._id}
👤 <b>Customer:</b> ${user.fullName}
📧 <b>Email:</b> ${user.email}
📱 <b>Phone:</b> ${user.phoneNumber}
🛍️ <b>Product:</b> ${transaction.itemName || 'Top Up'}
💰 <b>Amount:</b> Rp${transaction.amount.toLocaleString('id-ID')}
📅 <b>Time:</b> ${new Date(transaction.createdAt).toLocaleString('id-ID')}
------------------------
<b>New Status:</b> <i>${statusText}</i> ${statusEmoji}
    `;
    
    await sendTelegramNotification(telegramMessage);
    
    // Email notification
    await sendTransactionEmail(user.email, transaction, user);
    
    // Push notification if available
    if (user.fcmToken && transaction.status !== 'pending') {
      let notificationTitle = '';
      let notificationBody = '';
      
      if (transaction.status === 'success') {
        notificationTitle = 'Payment Successful';
        notificationBody = `Your ${transaction.itemName || 'top up'} transaction was successful`;
      } else if (transaction.status === 'failed') {
        notificationTitle = 'Payment Failed';
        notificationBody = `Your ${transaction.itemName || 'top up'} transaction failed`;
      }
      
      if (notificationTitle && notificationBody) {
        await sendNotificationToUser(
          user.fcmToken,
          notificationTitle,
          notificationBody
        );
      }
    }
  } catch (error) {
    console.error('❌ Notification Error:', error);
  }
};

// Get transaction notifications
exports.getNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    
    const transactions = await Transaction.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const count = await Transaction.countDocuments({ userId: req.user.id });
    
    const notifications = transactions.map(tx => ({
      id: tx._id,
      type: tx.itemType === 'topup' ? 'Top Up' : 
            tx.itemType === 'transfer' ? 'Transfer' : 'Purchase',
      amount: tx.amount,
      status: tx.status,
      date: tx.createdAt,
      itemName: tx.itemName,
      metadata: tx.metadata
    }));
    
    res.status(200).json({
      success: true,
      data: notifications,
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
      message: 'Failed to get notifications',
      error: err.message
    });
  }
};

// Update transaction status
exports.updateTransactionStatus = async (req, res) => {
  try {
    const { transactionId, status } = req.body;
    if (!transactionId || !status) {
      return res.status(400).json({ 
        message: 'Transaction ID and status are required' 
      });
    }
    
    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
      return res.status(404).json({ 
        message: 'Transaction not found' 
      });
    }
    
    transaction.status = status;
    await transaction.save();
    
    // Send notifications if status changed
    if (status === 'success' || status === 'failed') {
      await this.sendTransactionNotifications(transaction);
    }
    
    res.status(200).json({ 
      message: 'Transaction status updated successfully', 
      data: transaction 
    });
  } catch (err) {
    res.status(500).json({ 
      message: 'Error updating transaction', 
      error: err.message 
    });
  }
};

// Get transaction history
exports.getTransactionHistory = async (req, res) => {
  try {
    const transactions = await Transaction.find({ userId: req.user.id })
      .sort({ createdAt: -1 });
    res.status(200).json({ data: transactions });
  } catch (err) {
    res.status(500).json({ 
      message: 'Error fetching transaction history', 
      error: err.message 
    });
  }
};

// Get transaction details
exports.getTransactionDetails = async (req, res) => {
  try {
    const transactionId = req.params.id;
    
    if (!mongoose.Types.ObjectId.isValid(transactionId)) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid transaction ID format' 
      });
    }
    
    const transaction = await Transaction.findById(transactionId)
      .populate('userId', 'fullName phoneNumber');
      
    if (!transaction) {
      return res.status(404).json({ 
        success: false,
        message: 'Transaction not found' 
      });
    }
    
    if (transaction.userId._id.toString() !== req.user.id) {
      return res.status(403).json({ 
        success: false,
        message: 'You do not have access to this transaction' 
      });
    }
    
    let statusDisplay;
    switch (transaction.status) {
      case 'pending':
        statusDisplay = 'Waiting for Payment ⏳';
        break;
      case 'success':
        statusDisplay = 'Success ✅';
        break;
      case 'failed':
        statusDisplay = 'Failed ❌';
        break;
      default:
        statusDisplay = transaction.status;
    }
    
    const response = {
      success: true,
      message: 'Transaction details retrieved successfully',
      data: {
        transactionDetails: {
          'Transaction ID': transaction._id.toString(),
          'Customer': transaction.userId.fullName,
          'Phone Number': transaction.userId.phoneNumber,
          'Product': transaction.itemName,
          'Price': `Rp${transaction.amount.toLocaleString('id-ID')}`,
          'Time': transaction.createdAt.toLocaleString('id-ID'),
          '------------------------': '------------------------',
          'Status': statusDisplay
        },
        rawData: transaction
      }
    };
    
    res.status(200).json(response);
  } catch (err) {
    console.error('❌ Error fetching transaction details:', err);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch transaction details',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// Helper function to send FCM notification
async function sendNotificationToUser(fcmToken, title, body) {
  try {
    if (!fcmToken) {
      console.log('❌ No FCM token available');
      return;
    }
    
    const message = {
      notification: { 
        title,
        body
      },
      token: fcmToken,
      android: {
        priority: 'high'
      },
      apns: {
        headers: {
          'apns-priority': '10'
        },
        payload: {
          aps: {
            sound: 'default',
            badge: 1
          }
        }
      }
    };
    
    const response = await admin.messaging().send(message)
      .then((response) => {
        console.log('✅ Notification sent:', response);
        return response;
      })
      .catch((error) => {
        console.error('❌ Delivery error:', error);
        throw error;
      });
      
    return response;
  } catch (err) {
    console.error('❌ Failed to send notification:', err);   
    if (err.code === 'messaging/invalid-registration-token' || 
        err.code === 'messaging/registration-token-not-registered') {
      await User.updateOne(
        { fcmToken: fcmToken },
        { $unset: { fcmToken: 1 } }
      );
      console.log('🗑️ Invalid FCM token removed from database');
    }
    throw err;
  }
}

// Approve transaction (Admin only)
exports.approveTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminNotes } = req.body;

    if (!adminNotes) {
      return res.status(400).json({
        success: false,
        message: 'Admin notes are required'
      });
    }

    const transaction = await Transaction.findById(id);
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    // Update status and admin notes
    transaction.status = 'success';
    transaction.metadata = {
      ...transaction.metadata,
      adminNotes,
      approvedAt: new Date(),
      approvedBy: req.user.id
    };

    await transaction.save();

    // If transaction is topup, update user balance
    if (transaction.itemType === 'topup') {
      const user = await User.findById(transaction.userId);
      const previousBalance = user.balance;
      user.balance += transaction.amount;
      await user.save();

      // Record balance history
      const balanceHistory = new BalanceHistory({
        userId: user._id,
        transactionId: transaction._id,
        amount: transaction.amount,
        previousBalance: previousBalance,
        newBalance: user.balance,
        type: 'topup',
        description: 'Top up approved by admin'
      });
      await balanceHistory.save();
    }

    // Send notifications
    await this.sendTransactionNotifications(transaction);

    res.status(200).json({
      success: true,
      message: 'Transaction approved successfully',
      data: transaction
    });

  } catch (err) {
    console.error('❌ Approve Error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to approve transaction',
      error: err.message
    });
  }
};