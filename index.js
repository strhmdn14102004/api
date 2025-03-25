require('dotenv').config(); // Load variabel lingkungan dari .env

const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const midtransClient = require('midtrans-client');

const app = express();
const port = process.env.PORT || 3000;
const secretKey = process.env.JWT_SECRET;

// Middleware
app.use(cors());
app.use(express.json());

// Koneksi MongoDB
mongoose.connect(process.env.MONGO_URI, {
  serverSelectionTimeoutMS: 5000, // Set timeout
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
  phoneNumber: { type: String, required: true }
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
  isProduction: true, // Ganti true jika ingin production
  serverKey: process.env.MIDTRANS_SERVER_KEY
});

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

    // Ambil data user dari database
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User tidak ditemukan' });

    // Buat transaksi di database
    const transaction = new Transaction({
      userId: req.user.id,
      itemType,
      itemId,
      itemName: item.name,
      price: item.price,
      status: 'pending'
    });
    await transaction.save();

    // Parameter pembayaran Midtrans
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
        email: "testing@gmail.com", // Gunakan email asli dari user
        phone: user.phoneNumber
      }
    };

    // Kirim request ke Midtrans
    const transactionData = await snap.createTransaction(parameter);
    
    // Simpan payment URL ke database
    transaction.paymentUrl = transactionData.redirect_url;
    await transaction.save();

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

// 📌 Register (Daftar Pengguna Baru)
app.post('/api/register', async (req, res) => {
  try {
    const { username, password, fullName, address, phoneNumber } = req.body;
    if (!username || !password || !fullName || !address || !phoneNumber) return res.status(400).json({ message: 'Semua field wajib diisi' });

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
});
