const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const ImeiData = require('../models/ImeiData');
const BypassData = require('../models/BypassData');
const FmiOff = require('../models/fmioff'); // Tambahkan import FmiOff
const snap = require('../config/midtrans');
const sendTelegramNotification = require('../config/telegram');
const admin = require('../config/firebase');
const authenticateToken = require('../middlewares/authMiddleware');

// Create new transaction (now supports imei, bypass, and fmi-off)
exports.createTransaction = async (req, res) => {
  try {
    const { itemType, itemId } = req.body;
    
    // Validate input
    if (!itemType || !itemId) {
      return res.status(400).json({ 
        success: false,
        message: 'Tipe item dan ID item wajib diisi' 
      });
    }
    
    // Find item based on type
    let item;
    switch (itemType) {
      case 'imei':
        item = await ImeiData.findById(itemId);
        break;
      case 'bypass':
        item = await BypassData.findById(itemId);
        break;
      case 'fmi-off': // Handle FMI Off
        item = await FmiOff.findById(itemId);
        break;
      default:
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
    
    // Verify user exists
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User tidak ditemukan' 
      });
    }
    
    // Create transaction record
    const transaction = new Transaction({
      userId: req.user.id,
      itemType,
      itemId,
      itemName: item.name,
      price: item.price,
      status: 'pending'
    });
    await transaction.save();
    
    // Prepare Midtrans payment request
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
        email: user.email || "customer@example.com",
        phone: user.phoneNumber
      }
    };
    
    // Create Midtrans transaction
    const transactionData = await snap.createTransaction(parameter);
    transaction.paymentUrl = transactionData.redirect_url;
    await transaction.save();

    // Send Telegram notification
    const telegramMessage = `
🛒 <b>TRANSAKSI BARU</b> 🛒
------------------------
📌 <b>ID Transaksi:</b> ${transaction._id}
👤 <b>Pelanggan:</b> ${user.fullName}
📱 <b>No. HP:</b> ${user.phoneNumber}
🛍️ <b>Produk:</b> ${item.name} (${itemType})
💰 <b>Harga:</b> Rp${item.price.toLocaleString('id-ID')}
📅 <b>Waktu:</b> ${new Date().toLocaleString('id-ID')}
🔗 <b>Link Pembayaran:</b> <a href="${transactionData.redirect_url}">Klik disini</a>
------------------------
<b>Status:</b> <i>Menunggu Pembayaran</i> ⏳
    `;
    
    await sendTelegramNotification(telegramMessage);

    // Return success response
    res.status(201).json({ 
      success: true,
      message: 'Transaksi berhasil dibuat',
      paymentUrl: transaction.payment_url,
      data: transaction
    });
  } catch (err) {
    console.error('❌ Transaction Error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Gagal membuat transaksi',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// Midtrans webhook handler (no changes needed for FMI Off)
exports.midtransWebhook = async (req, res) => {
  try {
    const { order_id, transaction_status } = req.body;
    
    if (!order_id || !transaction_status) {
      return res.status(400).json({
        success: false,
        message: 'Payload tidak lengkap'
      });
    }
    
    if (!mongoose.Types.ObjectId.isValid(order_id)) {
      return res.status(400).json({
        success: false,
        message: 'Format Order ID tidak valid'
      });
    }
    
    const transaction = await Transaction.findById(order_id)
      .populate('userId', 'fcmToken fullName phoneNumber email');
      
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaksi tidak ditemukan'
      });
    }
    
    // Update status based on Midtrans notification
    let newStatus;
    if (transaction_status === 'settlement') {
      newStatus = 'sukses';
    } else if (['cancel', 'expire', 'failure'].includes(transaction_status)) {
      newStatus = 'gagal';
    }
    
    if (newStatus) {
      transaction.status = newStatus;
      await transaction.save();
      
      // Send Telegram notification
      const statusEmoji = newStatus === 'sukses' ? '✅' : '❌';
      const telegramMessage = `
📢 <b>UPDATE TRANSAKSI</b> 📢
------------------------
📌 <b>ID Transaksi:</b> ${transaction._id}
👤 <b>Pelanggan:</b> ${transaction.userId.fullName}
📱 <b>No. HP:</b> ${transaction.userId.phoneNumber}
🛍️ <b>Produk:</b> ${transaction.itemName} (${transaction.itemType})
💰 <b>Harga:</b> Rp${transaction.price.toLocaleString('id-ID')}
📅 <b>Waktu:</b> ${new Date(transaction.createdAt).toLocaleString('id-ID')}
------------------------
<b>Status Terbaru:</b> <i>${newStatus.toUpperCase()}</i> ${statusEmoji}
      `;
      
      await sendTelegramNotification(telegramMessage);
      
      // Send FCM notification if success
      if (newStatus === 'sukses' && transaction.userId?.fcmToken) {
        await sendNotificationToUser(
          transaction.userId.fcmToken,
          'Pembayaran Berhasil',
          `Pembelian ${transaction.itemName} (${transaction.itemType}) telah berhasil`
        );
      }
    }
    
    res.status(200).json({
      success: true,
      message: 'Status transaksi diperbarui',
      data: {
        transactionId: transaction._id,
        newStatus: transaction.status
      }
    });
  } catch (err) {
    console.error('❌ Webhook Error:', err);
    res.status(500).json({
      success: false,
      message: 'Error memproses webhook',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// Get all transactions for logged in user
exports.getTransactionHistory = async (req, res) => {
  try {
    const transactions = await Transaction.find({ userId: req.user.id })
      .sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      count: transactions.length,
      data: transactions
    });
  } catch (err) {
    res.status(500).json({ 
      success: false,
      message: 'Gagal mengambil riwayat transaksi',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
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
      .populate('userId', 'fullName phoneNumber email');
      
    if (!transaction) {
      return res.status(404).json({ 
        success: false,
        message: 'Transaksi tidak ditemukan' 
      });
    }
    
    // Verify ownership
    if (transaction.userId._id.toString() !== req.user.id) {
      return res.status(403).json({ 
        success: false,
        message: 'Akses ditolak untuk transaksi ini' 
      });
    }
    
    // Format status display
    const statusDisplay = {
      'pending': 'Menunggu Pembayaran ⏳',
      'sukses': 'Sukses ✅',
      'gagal': 'Gagal ❌'
    }[transaction.status] || transaction.status;
    
    res.status(200).json({
      success: true,
      data: {
        id: transaction._id,
        itemType: transaction.itemType,
        itemName: transaction.itemName,
        price: transaction.price,
        status: transaction.status,
        statusDisplay,
        paymentUrl: transaction.paymentUrl,
        createdAt: transaction.createdAt,
        customer: {
          name: transaction.userId.fullName,
          phone: transaction.userId.phoneNumber,
          email: transaction.userId.email
        }
      }
    });
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
      console.log('⚠️ FCM token tidak tersedia');
      return;
    }
    
    const message = {
      notification: { title, body },
      token: fcmToken,
      android: { priority: 'high' },
      apns: {
        headers: { 'apns-priority': '10' },
        payload: { aps: { sound: 'default', badge: 1 } }
      }
    };
    
    await admin.messaging().send(message);
    console.log('📲 Notifikasi terkirim ke:', fcmToken);
  } catch (err) {
    console.error('❌ Gagal mengirim notifikasi:', err);
    
    // Remove invalid FCM token
    if (['messaging/invalid-registration-token', 'messaging/registration-token-not-registered'].includes(err.code)) {
      await User.updateOne(
        { fcmToken },
        { $unset: { fcmToken: 1 } }
      );
      console.log('🗑️ FCM token tidak valid dihapus');
    }
    
    throw err;
  }
}