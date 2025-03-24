const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

// Inisialisasi Firebase
const serviceAccount = require('./test.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Dummy Data
let services = [
  { id: 1, name: 'Unblock IMEI 3 Bulan', price: 200000 },
];

let bypass = [
  { id: 1, name: 'iRemoval XR', price: 1500000 },
  { id: 2, name: 'iRemoval XS', price: 1500000 },
  { id: 3, name: 'iRemoval iPhone 13', price: 2500000 },
];

// ✅ Route: Sign-Up (Register User ke Firebase)
app.post('/api/register', async (req, res) => {
  try {
    const { fullName, email, password } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({ message: 'Semua field harus diisi' });
    }

    // Buat user di Firebase Authentication
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: fullName,
    });

    // Simpan data user di Firestore
    await db.collection('users').doc(userRecord.uid).set({
      fullName,
      email,
      createdAt: new Date(),
    });

    res.status(201).json({ message: 'Registrasi berhasil', user: userRecord });
  } catch (err) {
    res.status(500).json({ message: 'Error saat registrasi', error: err.message });
  }
});

// 🔑 Route: Login User
app.post('/api/login', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) return res.status(400).json({ message: 'Email diperlukan' });

    // Dapatkan user dari Firebase
    const userRecord = await admin.auth().getUserByEmail(email);
    const token = await admin.auth().createCustomToken(userRecord.uid);

    res.status(200).json({ message: 'Login berhasil', token });
  } catch (err) {
    res.status(401).json({ message: 'Login gagal', error: err.message });
  }
});

// 🔎 Route: Get User Profile (Butuh Token Autentikasi)
app.get('/api/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Token tidak ditemukan' });

    const decodedToken = await admin.auth().verifyIdToken(token);
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();

    if (!userDoc.exists) {
      return res.status(404).json({ message: 'User tidak ditemukan' });
    }

    res.status(200).json({ user: userDoc.data() });
  } catch (err) {
    res.status(500).json({ message: 'Gagal mengambil profil', error: err.message });
  }
});

// 📊 Route: Get All Services
app.get('/api/imei', (req, res) => {
  res.status(200).json(services);
});

// ➕ Route: Create New Service
app.post('/api/imei', (req, res) => {
  const { name, price } = req.body;
  if (!name || !price) {
    return res.status(400).json({ message: 'Name dan price diperlukan' });
  }
  const newService = {
    id: services.length + 1,
    name,
    price,
  };
  services.push(newService);
  res.status(201).json(newService);
});

// 🔍 Route: Get All Bypass Data
app.get('/api/bypass', (req, res) => {
  res.status(200).json(bypass);
});

// ➕ Route: Create New Bypass Entry
app.post('/api/bypass', (req, res) => {
  const { name, price } = req.body;
  if (!name || !price) {
    return res.status(400).json({ message: 'Name dan price diperlukan' });
  }
  const newBypass = {
    id: bypass.length + 1,
    name,
    price,
  };
  bypass.push(newBypass);
  res.status(201).json(newBypass);
});

// 🚀 Start Server
app.listen(port, () => {
  console.log(`API berjalan di http://localhost:${port}`);
});
