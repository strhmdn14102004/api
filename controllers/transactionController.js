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
const TimeUtils = require('../utils/timeUtils');

// Create new transaction
exports.createTransaction = async (req, res) => {
  try {
    const { itemType, itemId } = req.body;
    
    if (!itemType || !itemId) {
      return res.status(400).json({ 
        success: false,
        message: 'Tipe item dan id item wajib diisi' 
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
        message: 'Item tidak ditemukan' 
      });
    }
    
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User tidak ditemukan' 
      });
    }
    
    // Untuk produk (bukan topup), cek apakah saldo cukup
    if ((itemType === 'imei' || itemType === 'bypass') && user.balance < item.price) {
      return res.status(400).json({ 
        success: false,
        message: 'Saldo tidak memadai',
        data: {
          required: item.price,
          current: user.balance,
          deficit: item.price - user.balance
        }
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
🛒 <b>Transaksi Baru</b> 🛒
------------------------
📌 <b>ID Transaksi:</b> ${transaction._id}
👤 <b>Kustomer:</b> ${user.fullName}
📧 <b>Email:</b> ${user.email}
📱 <b>Nomor Handphone:</b> ${user.phoneNumber}
🛍️ <b>Produk:</b> ${item.name}
💰 <b>Harga Produk:</b> Rp${item.price.toLocaleString('id-ID')}
💳 <b>Saldo saat ini:</b> Rp${user.balance.toLocaleString('id-ID')}
📅 <b>Waktu Transaksi:</b> ${TimeUtils.formatForUser(transaction.createdAt, user.timezone)}
🔗 <b>Link Pembayaran:</b> <a href="${transactionData.redirect_url}">Klik disini</a>
------------------------
<b>Status:</b> <i>Menunggu pembayaran</i> ⏳
    `;
    
    await sendTelegramNotification(telegramMessage);

    // Send email notification
    await sendTransactionEmail(user.email, transaction, user);

    res.status(201).json({ 
      success: true,
      message: 'Transaksi berhasil dibuat',
      data: {
        paymentUrl: transaction.paymentUrl,
        transaction,
        userBalance: user.balance,
        createdAt: TimeUtils.formatForUser(transaction.createdAt, user.timezone)
      }
    });
  } catch (err) {
    console.error('❌ Transaction Error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Gagal membuat transaksi', 
      error: err.message 
    });
  }
};

// Direct purchase without Midtrans (gunakan saldo langsung)
exports.directPurchase = async (req, res) => {
  try {
    const { itemType, itemId } = req.body;
    
    if (!itemType || !itemId) {
      return res.status(400).json({ 
        success: false,
        message: 'Tipe item dan id item wajib diisi' 
      });
    }
    
    let item;
    if (itemType === 'imei') {
      item = await ImeiData.findById(itemId);
    } else if (itemType === 'bypass') {
      item = await BypassData.findById(itemId);
    } else {
      return res.status(400).json({ 
        success: false,
        message: 'Tipe item tidak valid' 
      });
    }
    
    if (!item) {
      return res.status(404).json({ 
        success: false,
        message: 'Item tidak ditemukan' 
      });
    }
    
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'Pengguna tidak ditemukan' 
      });
    }
    
    // Cek apakah saldo cukup
    if (user.balance < item.price) {
      return res.status(400).json({ 
        success: false,
        message: 'Saldo tidak memadai',
        data: {
          required: item.price,
          current: user.balance,
          deficit: item.price - user.balance
        }
      });
    }
    
    // Kurangi saldo user
    user.balance -= item.price;
    await user.save();
    
    // Buat transaksi dengan status success
    const transaction = new Transaction({
      userId: req.user.id,
      itemType,
      itemId,
      itemName: item.name,
      amount: item.price,
      status: 'success'
    });
    
    await transaction.save();
    
    // Record balance history
    const balanceHistory = new BalanceHistory({
      userId: user._id,
      transactionId: transaction._id,
      amount: -item.price,
      previousBalance: user.balance + item.price,
      newBalance: user.balance,
      type: 'purchase',
      description: `Pembelian langsung ${itemType} - ${item.name}`
    });
    
    await balanceHistory.save();

    // Send Telegram notification
    const telegramMessage = `
🛒 <b>Pembelian Langsung</b> 🛒
------------------------
📌 <b>ID Transaksi:</b> ${transaction._id}
👤 <b>Kustomer:</b> ${user.fullName}
📧 <b>Email:</b> ${user.email}
📱 <b>Nomor Handphone:</b> ${user.phoneNumber}
🛍️ <b>Produk:</b> ${item.name}
💰 <b>Harga Produk:</b> Rp${item.price.toLocaleString('id-ID')}
💳 <b>Saldo terbaru:</b> Rp${user.balance.toLocaleString('id-ID')}
📅 <b>Tanggal Transaksi:</b> ${TimeUtils.formatForUser(transaction.createdAt, user.timezone)}
------------------------
<b>Status:</b> <i>Suksess</i> ✅
    `;
    
    await sendTelegramNotification(telegramMessage);

    // Send email notification
    await sendTransactionEmail(user.email, transaction, user);

    res.status(201).json({ 
      success: true,
      message: 'Transaksi secara langsung berhasil dilakukan',
      data: {
        transaction,
        newBalance: user.balance,
        createdAt: TimeUtils.formatForUser(transaction.createdAt, user.timezone)
      }
    });
  } catch (err) {
    console.error('❌ Direct Purchase Error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Gagal melakukan pembelian langsung', 
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
        message: 'Order ID dan status transaksi wajib diisi'
      });
    }
    
    if (!mongoose.Types.ObjectId.isValid(order_id)) {
      return res.status(400).json({
        success: false,
        message: 'Format ID transaksi tidak valid'
      });
    }
    
    const transaction = await Transaction.findById(order_id)
      .populate('userId', 'fcmToken fullName email phoneNumber balance timezone');
      
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaksi tidak ditemukan'
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
      
      const user = await User.findById(transaction.userId);
      
      // Update user balance based on transaction type
      if (newStatus === 'success') {
        if (transaction.itemType === 'topup') {
          // Top up - tambah saldo
          user.balance += transaction.amount;
          await user.save();
          
          // Record balance history untuk topup
          const balanceHistory = new BalanceHistory({
            userId: user._id,
            transactionId: transaction._id,
            amount: transaction.amount,
            previousBalance: user.balance - transaction.amount,
            newBalance: user.balance,
            type: 'topup',
            description: 'Top up saldo'
          });
          await balanceHistory.save();
          
        } else if (transaction.itemType === 'imei' || transaction.itemType === 'bypass') {
          // Pembelian produk - kurangi saldo
          if (user.balance >= transaction.amount) {
            user.balance -= transaction.amount;
            await user.save();
            
            // Record balance history untuk pembelian
            const balanceHistory = new BalanceHistory({
              userId: user._id,
              transactionId: transaction._id,
              amount: -transaction.amount,
              previousBalance: user.balance + transaction.amount,
              newBalance: user.balance,
              type: 'purchase',
              description: `Pembelian ${transaction.itemType} - ${transaction.itemName}`
            });
            await balanceHistory.save();
          } else {
            // Jika saldo tidak cukup, ubah status menjadi failed
            transaction.status = 'failed';
            await transaction.save();
            newStatus = 'failed';
            
            console.log(`❌ Saldo tidak cukup untuk membeli : User ${user._id}, Dibutukan: ${transaction.amount}, Saldo: ${user.balance}`);
          }
        }
      }
      
      // Update the transaction object with the latest user data
      transaction.userId = user;
      
      // Send notifications
      await this.sendTransactionNotifications(transaction);
    }
    
    res.status(200).json({
      success: true,
      message: 'Webhook sedang diproses',
      data: {
        transactionId: transaction._id,
        status: transaction.status
      }
    });
  } catch (err) {
    console.error('❌ Webhook Error:', err);
    res.status(500).json({
      success: false,
      message: 'Gagal memproses webhook',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// Helper method to send transaction notifications
exports.sendTransactionNotifications = async (transaction) => {
  try {
    // Pastikan user data terisi dengan benar
    let user = transaction.userId;
    
    // Jika user hanya berisi ObjectId, populate data user
    if (typeof user === 'string' || (user && !user.email)) {
      user = await User.findById(user).select('fullName email phoneNumber balance fcmToken');
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
📢 <b>Update Transaksi</b> 📢
------------------------
📌 <b>ID Transaksi:</b> ${transaction._id}
👤 <b>Kustomer:</b> ${user.fullName || 'Unknown'}
📧 <b>Email:</b> ${user.email || 'No email'}
📱 <b>Nomor Handphone:</b> ${user.phoneNumber || 'No phone'}
🛍️ <b>Produk:</b> ${transaction.itemName || 'Top Up'}
💰 <b>Harga:</b> Rp${transaction.amount.toLocaleString('id-ID')}
📅 <b>Tanggal Transaksi:</b> ${TimeUtils.formatForUser(transaction.createdAt, user.timezone)}
------------------------
<b>Status terbaru:</b> <i>${statusText}</i> ${statusEmoji}
    `;
    
    await sendTelegramNotification(telegramMessage);
    
    // Email notification - pastikan user object lengkap
    await sendTransactionEmail(user.email, transaction, {
      fullName: user.fullName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      balance: user.balance || 0
    });
    
    // Push notification if available
    if (user.fcmToken && transaction.status !== 'pending') {
      let notificationTitle = '';
      let notificationBody = '';
      
      if (transaction.status === 'success') {
        notificationTitle = 'Pembayaran Berhasil';
        notificationBody = `Your ${transaction.itemName || 'top up'} transaksi berhasil dilakukan`;
      } else if (transaction.status === 'failed') {
        notificationTitle = 'Pembayaran Gagal';
        notificationBody = `Your ${transaction.itemName || 'top up'} Transaksi gagal`;
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
      message: 'Gagal mendapatkan data notifikasi',
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
        message: 'ID Transaksi dan status wajib diisi' 
      });
    }
    
    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
      return res.status(404).json({ 
        message: 'Transaksi tidak ditemukan' 
      });
    }
    
    transaction.status = status;
    await transaction.save();
    
    // Send notifications
    await this.sendTransactionNotifications(transaction);
    
    res.status(200).json({ 
      message: 'Status transaksi berhasil diperbarui', 
      data: transaction 
    });
  } catch (err) {
    res.status(500).json({ 
      message: 'Error saat memperbarui transaksi', 
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
      message: 'Error saat mengambil histori transaksi', 
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
        message: 'Format ID transaksi tidak valid' 
      });
    }
    
    const transaction = await Transaction.findById(transactionId)
      .populate('userId', 'fullName phoneNumber timezone');
      
    if (!transaction) {
      return res.status(404).json({ 
        success: false,
        message: 'Transaksi tidak ditemukan' 
      });
    }
    
    // Check if user has access to this transaction
    if (transaction.userId._id.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false,
        message: 'Anda tidak memiliki akses ke transaksi ini' 
      });
    }
    
    let statusDisplay;
    switch (transaction.status) {
      case 'pending':
        statusDisplay = 'Menunggu Pembayaran ⏳';
        break;
      case 'success':
        statusDisplay = 'Sukses ✅';
        break;
      case 'failed':
        statusDisplay = 'Gagal ❌';
        break;
      default:
        statusDisplay = transaction.status;
    }
    
    const response = {
      success: true,
      message: 'Detail transaksi berhasil ditemukan',
      data: {
        transactionDetails: {
          'ID Transaksi': transaction._id.toString(),
          'Pelanggan': transaction.userId.fullName,
          'No. HP': transaction.userId.phoneNumber || 'Tidak ada',
          'Produk': transaction.itemName,
          'Harga': `Rp${transaction.amount.toLocaleString('id-ID')}`,
          'Waktu': TimeUtils.formatForUser(transaction.createdAt, transaction.userId.timezone),
          '------------------------': '------------------------',
          'Status Terbaru': statusDisplay
        },
        rawData: transaction
      }
    };
    
    res.status(200).json(response);
  } catch (err) {
    console.error('❌ Error mengambil detail transaksi:', err);
    res.status(500).json({ 
      success: false,
      message: 'Gagal mengambil detail transaksi',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// Helper function to send FCM notification
async function sendNotificationToUser(fcmToken, title, body) {
  try {
    if (!fcmToken) {
      console.log('❌ Tidak ada FCM token');
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
        console.log('✅ Notifikasi terkirim:', response);
        return response;
      })
      .catch((error) => {
        console.error('❌ Error pengiriman:', error);
        throw error;
      });
      
    return response;
  } catch (err) {
    console.error('❌ Gagal mengirim notifikasi:', err);   
    if (err.code === 'messaging/invalid-registration-token' || 
        err.code === 'messaging/registration-token-not-registered') {
      await User.updateOne(
        { fcmToken: fcmToken },
        { $unset: { fcmToken: 1 } }
      );
      console.log('🗑️ FCM token tidak valid, dihapus dari database');
    }
    throw err;
  }
}

// Approve transaction (Admin only)
exports.approveTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminNotes } = req.body;

    // Validasi input
    if (!adminNotes) {
      return res.status(400).json({
        success: false,
        message: 'Catatan admin wajib diisi'
      });
    }

    const transaction = await Transaction.findById(id);
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaksi tidak ditemukan'
      });
    }

    // Get user to access timezone
    const user = await User.findById(transaction.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Pengguna tidak ditemukan'
      });
    }

    // Update status dan catatan admin
    transaction.status = 'success';
    transaction.metadata = {
      ...transaction.metadata,
      adminNotes,
      approvedAt: TimeUtils.formatForUser(new Date(), user.timezone),
      approvedBy: req.user.id
    };

    await transaction.save();

    // Jika transaksi topup, update balance user
    if (transaction.itemType === 'topup') {
      user.balance += transaction.amount;
      await user.save();

      // Catat history balance
      const balanceHistory = new BalanceHistory({
        userId: user._id,
        transactionId: transaction._id,
        amount: transaction.amount,
        previousBalance: user.balance - transaction.amount,
        newBalance: user.balance,
        type: 'topup',
        description: 'Top up disetujui oleh admin'
      });
      await balanceHistory.save();
    }

    // Kirim notifikasi
    await this.sendTransactionNotifications(transaction);

    res.status(200).json({
      success: true,
      message: 'Transaksi berhasil disetujui',
      data: transaction
    });

  } catch (err) {
    console.error('❌ Approve Error:', err);
    res.status(500).json({
      success: false,
      message: 'Gagal menyetujui transaksi',
      error: err.message
    });
  }
};