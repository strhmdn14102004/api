const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const ImeiData = require('../models/ImeiData');
const BypassData = require('../models/BypassData');
const snap = require('../config/midtrans');
const sendTelegramNotification = require('../config/telegram');
const admin = require('../config/firebase');
const authenticateToken = require('../middlewares/authMiddleware');

// Create new transaction
exports.createTransaction = async (req, res) => {
  try {
    const { itemType, itemId } = req.body;
    if (!itemType || !itemId) {
      return res.status(400).json({ 
        message: 'Tipe item dan ID item wajib diisi' 
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
        message: 'Item tidak ditemukan' 
      });
    }
    
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ 
        message: 'User tidak ditemukan' 
      });
    }
    
    const transaction = new Transaction({
      userId: req.user.id,
      itemType,
      itemId,
      itemName: item.name,
      price: item.price,
      status: 'pending'
    });
    await transaction.save();
    
    let parameter = {
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
        email: "testing@gmail.com",
        phone: user.phoneNumber
      }
    };
    
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
🛍️ <b>Produk:</b> ${item.name}
💰 <b>Harga:</b> Rp${item.price.toLocaleString('id-ID')}
📅 <b>Waktu:</b> ${new Date().toLocaleString('id-ID')}
🔗 <b>Link Pembayaran:</b> <a href="${transactionData.redirect_url}">Klik disini</a>
------------------------
<b>Status:</b> <i>Menunggu Pembayaran</i> ⏳
    `;
    
    await sendTelegramNotification(telegramMessage);

    res.status(201).json({ 
      message: 'Transaksi berhasil dibuat',
      paymentUrl: transaction.paymentUrl,
      data: transaction
    });
  } catch (err) {
    console.error('❌ Midtrans Error:', err);
    res.status(500).json({ 
      message: 'Gagal membuat payment link', 
      error: err.message 
    });
  }
};

// Midtrans webhook handler
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
      .populate('userId', 'fcmToken fullName phoneNumber');
      
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaksi tidak ditemukan'
      });
    }
    
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
      let statusEmoji = '';
      if (newStatus === 'sukses') statusEmoji = '✅';
      if (newStatus === 'gagal') statusEmoji = '❌';
      
      const telegramMessage = `
📢 <b>UPDATE TRANSAKSI</b> 📢
------------------------
📌 <b>ID Transaksi:</b> ${transaction._id}
👤 <b>Pelanggan:</b> ${transaction.userId.fullName}
📱 <b>No. HP:</b> ${transaction.userId.phoneNumber}
🛍️ <b>Produk:</b> ${transaction.itemName}
💰 <b>Harga:</b> Rp${transaction.price.toLocaleString('id-ID')}
📅 <b>Waktu:</b> ${new Date(transaction.createdAt).toLocaleString('id-ID')}
------------------------
<b>Status Terbaru:</b> <i>${newStatus.toUpperCase()}</i> ${statusEmoji}
      `;
      
      await sendTelegramNotification(telegramMessage);
    }
    
    if (newStatus === 'sukses' && transaction.userId?.fcmToken) {
      try {
        await sendNotificationToUser(
          transaction.userId.fcmToken,
          'Pembayaran Berhasil Dilakukan',
          `Pembelian ${transaction.itemType} ${transaction.itemName} telah berhasil dilakukan, cek riwayat pembelianmu dimenu histori transaksi`
        );
      } catch (notifError) {
        console.error('❌ Error mengirim notifikasi:', notifError);
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

// Update transaction status
exports.updateTransactionStatus = async (req, res) => {
  try {
    const { transactionId, status } = req.body;
    if (!transactionId || !status) {
      return res.status(400).json({ 
        message: 'Transaction ID dan status wajib diisi' 
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
      .populate('userId', 'fullName phoneNumber');
      
    if (!transaction) {
      return res.status(404).json({ 
        success: false,
        message: 'Transaksi tidak ditemukan' 
      });
    }
    
    if (transaction.userId._id.toString() !== req.user.id) {
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
      case 'sukses':
        statusDisplay = 'Sukses ✅';
        break;
      case 'gagal':
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
          'No. HP': transaction.userId.phoneNumber,
          'Produk': transaction.itemName,
          'Harga': `Rp${transaction.price.toLocaleString('id-ID')}`,
          'Waktu': transaction.createdAt.toLocaleString('id-ID'),
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