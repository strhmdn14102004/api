require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const midtransClient = require('midtrans-client');
const axios = require('axios');
const app = express();
const port = process.env.PORT || 3000;
const secretKey = process.env.JWT_SECRET;
const admin = require("firebase-admin");
const serviceAccount = require("./firebase-admin-config.json");

// Konfigurasi Telegram
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!serviceAccount.private_key || !serviceAccount.private_key.includes('BEGIN PRIVATE KEY')) {
  console.error('❌ Format private key tidak valid');
  process.exit(1);
}

try {
  if (!serviceAccount.private_key || !serviceAccount.client_email) {
    throw new Error("Konfigurasi Firebase tidak valid");
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://satset-toko-default-rtdb.asia-southeast1.firebasedatabase.app"
  });
  console.log("✅ Firebase berhasil diinisialisasi");
} catch (error) {
  console.error("❌ Gagal menginisialisasi Firebase:", error.message);
  process.exit(1);
}

// Middleware
app.use(cors());
app.use(express.json());

// Koneksi MongoDB
mongoose.connect(process.env.MONGO_URI, {
  serverSelectionTimeoutMS: 5000,
}).then(() => {
  console.log("✅ MongoDB Connected");
}).catch(err => {
  console.error("❌ MongoDB Connection Error:", err);
});

// Schema & Model
const User = mongoose.model('User', new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  fullName: { type: String, required: true },
  address: { type: String, required: true },
  phoneNumber: { type: String, required: true },
  fcmToken: { type: String }
}));

const Transaction = mongoose.model('Transaction', new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  itemType: { type: String, enum: ['imei', 'bypass'], required: true },
  itemId: { type: mongoose.Schema.Types.ObjectId, required: true },
  itemName: { type: String, required: true },
  price: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'gagal', 'sukses'], default: 'pending' },
  paymentUrl: { type: String },
  createdAt: { type: Date, default: Date.now }
}));

const ImeiData = mongoose.model('ImeiData', new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
}));

const BypassData = mongoose.model('BypassData', new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
}));

// Middleware: Verifikasi JWT
const authenticateToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Akses ditolak, token tidak tersedia' });
  jwt.verify(token, secretKey, (err, decoded) => {
    if (err) return res.status(403).json({ message: 'Token tidak valid' });
    req.user = decoded;
    next();
  });
};

// Midtrans Config
const snap = new midtransClient.Snap({
  isProduction: true,
  serverKey: process.env.MIDTRANS_SERVER_KEY
});

// Fungsi untuk mengirim notifikasi Telegram
async function sendTelegramNotification(message) {
  try {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      console.warn('⚠️ Token atau Chat ID Telegram tidak dikonfigurasi');
      return;
    }

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const response = await axios.post(url, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'HTML'
    });

    console.log('📤 Notifikasi Telegram terkirim:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Gagal mengirim notifikasi Telegram:', error.response?.data || error.message);
    throw error;
  }
}

// 📌 Transaksi Midtrans
app.post('/api/transactions', authenticateToken, async (req, res) => {
  try {
    const { itemType, itemId } = req.body;
    if (!itemType || !itemId) return res.status(400).json({ message: 'Tipe item dan ID item wajib diisi' });
    
    let item;
    if (itemType === 'imei') {
      item = await ImeiData.findById(itemId);
    } else if (itemType === 'bypass') {
      item = await BypassData.findById(itemId);
    }
    if (!item) return res.status(404).json({ message: 'Item tidak ditemukan' });
    
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User tidak ditemukan' });
    
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
      item_details: [
        {
          id: itemId,
          name: item.name,
          price: item.price,
          quantity: 1
        }
      ],
      customer_details: {
        first_name: user.fullName,
        email: "testing@gmail.com",
        phone: user.phoneNumber
      }
    };
    
    const transactionData = await snap.createTransaction(parameter);
    transaction.paymentUrl = transactionData.redirect_url;
    await transaction.save();

    // Kirim notifikasi Telegram untuk transaksi baru
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
    res.status(500).json({ message: 'Gagal membuat payment link', error: err.message });
  }
});

// 📌 Webhook Midtrans
app.post('/api/midtrans/webhook', async (req, res) => {
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
      
      // Kirim notifikasi Telegram untuk update status
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
});

// Fungsi untuk mengirim notifikasi FCM
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

// 📌 Update FCM Token
app.post('/api/update-fcm', authenticateToken, async (req, res) => {
  try {
    const { fcm_token } = req.body;
    if (!fcm_token) {
      return res.status(400).json({ 
        success: false,
        message: 'FCM token wajib diisi' 
      });
    }
    
    if (!fcm_token.startsWith('c') && !fcm_token.includes(':')) {
      return res.status(400).json({
        success: false,
        message: 'Format FCM token tidak valid'
      });
    }
    
    const updatedUser = await User.findByIdAndUpdate(
      req.user.id, 
      { fcmToken: fcm_token },
      { new: true }
    );
    
    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User tidak ditemukan'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'FCM token berhasil diperbarui',
      data: {
        userId: updatedUser._id,
        fcmToken: updatedUser.fcmToken
      }
    });
  } catch (err) {
    console.error('❌ FCM Update Error:', err);
    res.status(500).json({
      success: false,
      message: 'Error memperbarui FCM token',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// 📌 Register (Daftar Pengguna Baru)
app.post('/api/register', async (req, res) => {
  try {
    const { username, password, fullName, address, phoneNumber } = req.body;
    if (!username || !password || !fullName || !address || !phoneNumber) {
      return res.status(400).json({ message: 'Semua field wajib diisi' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPassword, fullName, address, phoneNumber });
    await newUser.save();
    
    res.status(201).json({ message: 'User berhasil didaftarkan' });
  } catch (err) {
    res.status(500).json({ message: 'Error saat registrasi', error: err.message });
  }
});

// 📌 Login
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'Username dan password wajib diisi' });
    
    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ message: 'User tidak ditemukan' });
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Password salah' });
    
    const token = jwt.sign({ id: user._id, username: user.username, fullName: user.fullName }, secretKey, { expiresIn: '1h' });
    
    res.status(200).json({
      message: 'Login berhasil',
      token,
      user: {
        id: user._id,
        username: user.username,
        fullName: user.fullName,
        address: user.address,
        phoneNumber: user.phoneNumber
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Error saat login', error: err.message });
  }
});

// 📌 Update Status Transaksi
app.post('/api/transactions/update', async (req, res) => {
  try {
    const { transactionId, status } = req.body;
    if (!transactionId || !status) return res.status(400).json({ message: 'Transaction ID dan status wajib diisi' });
    
    const transaction = await Transaction.findById(transactionId);
    if (!transaction) return res.status(404).json({ message: 'Transaksi tidak ditemukan' });
    
    transaction.status = status;
    await transaction.save();
    
    res.status(200).json({ message: 'Status transaksi berhasil diperbarui', data: transaction });
  } catch (err) {
    res.status(500).json({ message: 'Error saat memperbarui transaksi', error: err.message });
  }
});

// 📌 Lihat Histori Transaksi
app.get('/api/transactions', authenticateToken, async (req, res) => {
  try {
    const transactions = await Transaction.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.status(200).json({ data: transactions });
  } catch (err) {
    res.status(500).json({ message: 'Error saat mengambil histori transaksi', error: err.message });
  }
});

// 📌 Ambil Data IMEI (Hanya Jika Login)
app.get('/api/imei', authenticateToken, async (req, res) => {
  try {
    const imeiList = await ImeiData.find();
    res.status(200).json({ data: imeiList });
  } catch (err) {
    res.status(500).json({ message: 'Error saat mengambil data IMEI', error: err.message });
  }
});

// 📌 Ambil Data Bypass (Hanya Jika Login)
app.get('/api/bypass', authenticateToken, async (req, res) => {
  try {
    const bypassList = await BypassData.find().select('-__v');
    res.status(200).json(bypassList);
  } catch (err) {
    res.status(500).json({ message: 'Error saat mengambil data Bypass', error: err.message });
  }
});

// 📌 Tambah Data IMEI
app.post('/api/imei', authenticateToken, async (req, res) => {
  try {
    const { name, price } = req.body;
    if (!name || !price) return res.status(400).json({ message: 'Nama dan harga wajib diisi' });
    
    const newImeiData = new ImeiData({ name, price });
    await newImeiData.save();
    
    res.status(201).json({ message: 'Data IMEI berhasil ditambahkan', data: newImeiData });
  } catch (err) {
    res.status(500).json({ message: 'Error saat menambahkan data IMEI', error: err.message });
  }
});

// 📌 Tambah Data Bypass
app.post('/api/bypass', authenticateToken, async (req, res) => {
  try {
    const { name, price } = req.body;
    const newBypass = new BypassData({ name, price });
    await newBypass.save();
    
    res.status(201).json({ message: 'Data Bypass berhasil ditambahkan', data: newBypass });
  } catch (err) {
    res.status(500).json({ message: 'Error saat menambahkan data Bypass', error: err.message });
  }
});

// Start Server
app.listen(port, () => {
  console.log("✅ ENV Variables:", process.env);
  console.log(`✅ API berjalan di http://localhost:${port}`);
  console.log('⏰ Waktu Server (UTC):', new Date().toISOString());
});