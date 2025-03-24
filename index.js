const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const port = 3000;
const secretKey = '14102004';

// Middleware
app.use(cors());
app.use(express.json());

// Koneksi MongoDB
mongoose.connect('mongodb+srv://satria:strhmdn141004@cluster.ta6xb.mongodb.net/?retryWrites=true&w=majority&appName=Cluster')
  .then(() => console.log('✅ MongoDB Connected'))
  .catch((err) => console.error('❌ MongoDB Error:', err));

// Schema & Model
const User = mongoose.model('User', new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  fullName: { type: String, required: true },
  address: { type: String, required: true },
  phoneNumber: { type: String, required: true }
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

  jwt.verify(token, secretKey, (err, user) => {
    if (err) return res.status(403).json({ message: 'Token tidak valid' });
    req.user = user;
    next();
  });
};

// Register (Daftar Pengguna Baru)
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

//Login (Autentikasi Pengguna)
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'Username dan password wajib diisi' });

    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ message: 'User tidak ditemukan' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Password salah' });

    const token = jwt.sign({ id: user._id, username: user.username }, secretKey, { expiresIn: '1h' });

    res.status(200).json({ 
      message: 'Login berhasil', 
      token,
      user: {
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

// Tambah Data IMEI
app.post('/api/imei', authenticateToken, async (req, res) => {
  try {
    const { name, price } = req.body;
    if (!name || !price) {
      return res.status(400).json({ message: 'Nama dan harga wajib diisi' });
    }

    const newImeiData = new ImeiData({ name, price });
    await newImeiData.save();

    res.status(201).json({ message: 'Data IMEI berhasil ditambahkan', data: newImeiData });
  } catch (err) {
    res.status(500).json({ message: 'Error saat menambahkan data IMEI', error: err.message });
  }
});

// Ambil Semua Data IMEI
app.get('/api/imei', authenticateToken, async (req, res) => {
  try {
    const imeiList = await ImeiData.find();
    res.status(200).json({ data: imeiList });
  } catch (err) {
    res.status(500).json({ message: 'Error saat mengambil data IMEI', error: err.message });
  }
});

// Tambah Data Bypass
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

// Ambil Semua Data Bypass
app.get('/api/bypass', authenticateToken, async (req, res) => {
  try {
    const bypassList = await BypassData.find().select('-__v');
    res.status(200).json(bypassList);
  } catch (err) {
    res.status(500).json({ message: 'Error saat mengambil data Bypass', error: err.message });
  }
});

app.listen(port, () => {
  console.log(`berhasil jalan servernya ${port}`);
});