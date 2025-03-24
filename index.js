const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const port = 3000;
const secretKey = '14102004'; // Ganti dengan kunci rahasia yang aman

// Middleware
app.use(cors());
app.use(express.json());

// Koneksi MongoDB
mongoose.connect('mongodb+srv://satria:strhmdn141004@cluster.ta6xb.mongodb.net/?retryWrites=true&w=majority&appName=Cluster')
  .then(() => console.log('✅ MongoDB Connected'))
  .catch((err) => console.error('❌ MongoDB Error:', err));

// Schema & Model
const User = mongoose.model('User', new mongoose.Schema({
  username: { type: String, unique: true },
  password: String,
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

// 📌 Register (Daftar Pengguna Baru)
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'Username dan password wajib diisi' });

    // Hash password sebelum disimpan
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPassword });
    await newUser.save();

    res.status(201).json({ message: 'User berhasil didaftarkan' });
  } catch (err) {
    res.status(500).json({ message: 'Error saat registrasi', error: err.message });
  }
});

// 📌 Login (Autentikasi Pengguna)
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'Username dan password wajib diisi' });

    // Cari pengguna di database
    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ message: 'User tidak ditemukan' });

    // Verifikasi password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Password salah' });

    // Buat token JWT
    const token = jwt.sign({ id: user._id, username: user.username }, secretKey, { expiresIn: '1h' });

    res.status(200).json({ message: 'Login berhasil', token });
  } catch (err) {
    res.status(500).json({ message: 'Error saat login', error: err.message });
  }
});

// 📌 Route Terproteksi (Hanya Bisa Diakses Setelah Login)
app.get('/api/protected', authenticateToken, (req, res) => {
  res.status(200).json({ message: 'Akses berhasil', user: req.user });
});

// Start Server
app.listen(port, () => {
  console.log(`✅ API berjalan di http://localhost:${port}`);
});
