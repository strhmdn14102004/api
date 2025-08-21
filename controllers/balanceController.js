const User = require('../models/User');
const Transaction = require('../models/Transaction');
const BalanceHistory = require('../models/BalanceHistory');
const snap = require('../config/midtrans');
const sendTelegramNotification = require('../config/telegram');
const { sendTransactionEmail } = require('../config/email');
const admin = require('../config/firebase');
const TimeUtils = require('../utils/timeUtils');

// Get user balance
exports.getBalance = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('balance timezone');
    res.status(200).json({
      success: true,
      data: {
        balance: user.balance,
        timezone: user.timezone,
        lastUpdated: TimeUtils.formatForUser(user.updatedAt, user.timezone)
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Gagal mengambil saldo',
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
        message: 'Jumlah harus lebih dari 0'
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Pengguna tidak ditemukan'
      });
    }

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
💰 <b>Permintaan Top Up</b> 💰
------------------------
📌 <b>ID Transaksi:</b> ${transaction._id}
👤 <b>Kustomer:</b> ${user.fullName}
📧 <b>Email:</b> ${user.email}
📱 <b>Nomor Handphone:</b> ${user.phoneNumber}
💵 <b>Jumlah:</b> Rp${amount.toLocaleString('id-ID')}
📅 <b>Tanggal Transaksi:</b> ${TimeUtils.formatForUser(transaction.createdAt, user.timezone)}
🔗 <b>Link Pembayaran:</b> <a href="${transactionData.redirect_url}">Klik disini</a>
------------------------
<b>Status:</b> <i>Menunggu Pembayaran</i> ⏳
    `;
    
    await sendTelegramNotification(telegramMessage);

    // Send email notification
    await sendTransactionEmail(user.email, transaction, user);

    res.status(201).json({
      success: true,
      message: 'Permintaan top up berhasil dibuat',
      data: {
        transactionId: transaction._id,
        amount,
        paymentUrl: transactionData.redirect_url,
        createdAt: TimeUtils.formatForUser(transaction.createdAt, user.timezone)
      }
    });
  } catch (err) {
    console.error('❌ Top Up Error:', err);
    res.status(500).json({
      success: false,
      message: 'Gagal memproses top up',
      error: err.message
    });
  }
};

// Withdraw balance - langsung diproses tanpa approval
exports.withdraw = async (req, res) => {
  try {
    const { amount } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Jumlah penarikan harus lebih dari 0'
      });
    }

    const user = await User.findById(req.user.id);
    if (user.balance < amount) {
      return res.status(400).json({
        success: false,
        message: 'Saldo tidak mencukupi untuk penarikan'
      });
    }

    // Deduct balance immediately for withdrawal
    const previousBalance = user.balance;
    user.balance -= amount;
    await user.save();

    const transaction = new Transaction({
      userId: req.user.id,
      itemType: 'withdrawal',
      amount,
      status: 'success' // Langsung success, tidak pending
    });

    await transaction.save();

    // Record balance history
    const balanceHistory = new BalanceHistory({
      userId: req.user.id,
      transactionId: transaction._id,
      amount: -amount,
      previousBalance: previousBalance,
      newBalance: user.balance,
      type: 'withdrawal',
      description: 'Penarikan saldo'
    });

    await balanceHistory.save();

    // Send Telegram notification
    const telegramMessage = `
💸 <b>Penarikan Saldo Berhasil</b> 💸
------------------------
📌 <b>ID Transaksi:</b> ${transaction._id}
👤 <b>Kustomer:</b> ${user.fullName}
📧 <b>Email:</b> ${user.email}
📱 <b>Nomor Handphone:</b> ${user.phoneNumber}
💵 <b>Jumlah:</b> Rp${amount.toLocaleString('id-ID')}
📅 <b>Tanggal Transaksi:</b> ${TimeUtils.formatForUser(transaction.createdAt, user.timezone)}
💰 <b>Saldo Sebelumnya:</b> Rp${previousBalance.toLocaleString('id-ID')}
💰 <b>Saldo Sekarang:</b> Rp${user.balance.toLocaleString('id-ID')}
------------------------
<b>Status:</b> <i>Berhasil</i> ✅
    `;
    
    await sendTelegramNotification(telegramMessage);

    // Send email notification
    await sendTransactionEmail(user.email, transaction, user);

    res.status(201).json({
      success: true,
      message: 'Penarikan saldo berhasil',
      data: {
        transactionId: transaction._id,
        amount,
        previousBalance,
        newBalance: user.balance,
        createdAt: TimeUtils.formatForUser(transaction.createdAt, user.timezone)
      }
    });
  } catch (err) {
    console.error('❌ Withdrawal Error:', err);
    res.status(500).json({
      success: false,
      message: 'Gagal memproses penarikan',
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
        message: 'Username penerima dan jumlah harus diisi'
      });
    }

    if (req.user.username === recipientUsername) {
      return res.status(400).json({
        success: false,
        message: 'Tidak dapat mentransfer ke akun sendiri'
      });
    }

    const sender = await User.findById(req.user.id);
    const recipient = await User.findOne({ username: recipientUsername });

    if (!recipient) {
      return res.status(404).json({
        success: false,
        message: 'Penerima tidak ditemukan'
      });
    }

    if (sender.balance < amount) {
      return res.status(400).json({
        success: false,
        message: 'Saldo tidak mencukupi untuk transfer'
      });
    }

    // Perform transfer
    sender.balance -= amount;
    recipient.balance += amount;

    await Promise.all([sender.save(), recipient.save()]);

    // Create TWO transactions: one for sender and one for recipient
    const senderTransaction = new Transaction({
      userId: sender._id,
      itemType: 'transfer', // Gunakan 'transfer' sesuai enum
      amount: amount,
      status: 'success',
      recipientId: recipient._id,
      metadata: {
        notes,
        recipientName: recipient.fullName,
        recipientUsername: recipient.username,
        recipientPhone: recipient.phoneNumber,
        direction: 'outgoing', // Bedakan dengan metadata
        transactionType: 'transfer_out'
      }
    });

    const recipientTransaction = new Transaction({
      userId: recipient._id,
      itemType: 'transfer', // Gunakan 'transfer' sesuai enum
      amount: amount,
      status: 'success',
      senderId: sender._id,
      metadata: {
        notes,
        senderName: sender.fullName,
        senderUsername: sender.username,
        senderPhone: sender.phoneNumber,
        direction: 'incoming', // Bedakan dengan metadata
        transactionType: 'transfer_in'
      }
    });

    await Promise.all([senderTransaction.save(), recipientTransaction.save()]);

    // Record balance history for both users
    const senderHistory = new BalanceHistory({
      userId: sender._id,
      transactionId: senderTransaction._id,
      amount: -amount,
      previousBalance: sender.balance + amount,
      newBalance: sender.balance,
      type: 'transfer_out', // BalanceHistory mendukung transfer_out
      description: `Transfer to ${recipient.username} (${recipient.fullName})`
    });

    const recipientHistory = new BalanceHistory({
      userId: recipient._id,
      transactionId: recipientTransaction._id,
      amount: amount,
      previousBalance: recipient.balance - amount,
      newBalance: recipient.balance,
      type: 'transfer_in', // BalanceHistory mendukung transfer_in
      description: `Transfer from ${sender.username} (${sender.fullName})`
    });

    await Promise.all([senderHistory.save(), recipientHistory.save()]);

    // Send Telegram notification for sender
    const senderTelegramMessage = `
➡️ <b>Pengiriman Saldo</b> ➡️
------------------------
📌 <b>ID Transaksi:</b> ${senderTransaction._id}
👤 <b>Pengirim:</b> ${sender.fullName}
📧 <b>Email Pengirim:</b> ${sender.email}
📱 <b>Nomor Handphone Pengirim:</b> ${sender.phoneNumber}
👥 <b>Penerima:</b> ${recipient.fullName} (@${recipient.username})
📱 <b>Nomor Handphone Penerima:</b> ${recipient.phoneNumber}
💵 <b>Jumlah:</b> Rp${amount.toLocaleString('id-ID')}
📝 <b>Catatan:</b> ${notes || 'Tidak ada catatan'}
📅 <b>Waktu transaksi:</b> ${TimeUtils.formatForUser(senderTransaction.createdAt, sender.timezone)}
------------------------
<b>Status:</b> <i>Berhasil</i> ✅
    `;
    
    await sendTelegramNotification(senderTelegramMessage);

    // Send Telegram notification for recipient
    const recipientTelegramMessage = `
⬅️ <b>Penerimaan saldo</b> ⬅️
------------------------
📌 <b>ID Transaksi:</b> ${recipientTransaction._id}
👤 <b>Pengirim:</b> ${sender.fullName} (@${sender.username})
📧 <b>Email Pengirim:</b> ${sender.email}
📱 <b>Nomor Handphone Pengirim:</b> ${sender.phoneNumber}
👥 <b>Penerima:</b> ${recipient.fullName}
📧 <b>Email Penerima:</b> ${recipient.email}
📱 <b>Nomor Handphone Penerima:</b> ${recipient.phoneNumber}
💵 <b>Jumlah:</b> Rp${amount.toLocaleString('id-ID')}
📝 <b>Catatan:</b> ${notes || 'Tidak ada catatan'}
📅 <b>Waktu transaksi:</b> ${TimeUtils.formatForUser(recipientTransaction.createdAt, recipient.timezone)}
------------------------
<b>Status:</b> <i>Berhasil</i> ✅
    `;
    
    await sendTelegramNotification(recipientTelegramMessage);

    // Send email notifications
    await Promise.all([
      sendTransactionEmail(sender.email, senderTransaction, sender),
      sendTransactionEmail(recipient.email, recipientTransaction, recipient)
    ]);

    res.status(201).json({
      success: true,
      message: 'Pengiriman Saldo Berhasil Dilakukan',
      data: {
        transactionId: senderTransaction._id,
        amount,
        recipient: {
          username: recipient.username,
          fullName: recipient.fullName,
          phoneNumber: recipient.phoneNumber
        },
        createdAt: TimeUtils.formatForUser(senderTransaction.createdAt, sender.timezone)
      }
    });
  } catch (err) {
    console.error('❌ Transfer Error:', err);
    res.status(500).json({
      success: false,
      message: 'Gagal memproses transfer',
      error: err.message
    });
  }
};

// Get balance history
exports.getHistory = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    
    const user = await User.findById(req.user.id).select('timezone');
    const userTimezone = user?.timezone || 'Asia/Jakarta';

    const history = await BalanceHistory.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    // Format waktu untuk user
    const formattedHistory = history.map(item => ({
      ...item,
      createdAtFormatted: TimeUtils.formatForUser(item.createdAt, userTimezone)
    }));

    const count = await BalanceHistory.countDocuments({ userId: req.user.id });

    res.status(200).json({
      success: true,
      data: formattedHistory,
      timezone: userTimezone,
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
      message: 'Gagal mengambil riwayat saldo',
      error: err.message
    });
  }
};