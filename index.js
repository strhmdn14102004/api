const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Koneksi ke MongoDB
mongoose.connect('mongodb+srv://sasat:strhmdn141004@cluster0.mongodb.net/sasat?retryWrites=true&w=majority')
  .then(() => console.log('✅ MongoDB Connected'))
  .catch((err) => console.error('❌ MongoDB Connection Error:', err));

// Schema & Model
const Service = mongoose.model('Service', new mongoose.Schema({
  name: String,
  price: Number,
}));

const Bypass = mongoose.model('Bypass', new mongoose.Schema({
  name: String,
  price: Number,
}));

// Route: Get All Services
app.get('/api/imei', async (req, res) => {
  try {
    const services = await Service.find();
    res.status(200).json(services);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching services', error: err });
  }
});

// Route: Create New Service
app.post('/api/imei', async (req, res) => {
  try {
    const { name, price } = req.body;
    if (!name || !price) {
      return res.status(400).json({ message: 'Name and price required' });
    }
    const newService = new Service({ name, price });
    await newService.save();
    res.status(201).json(newService);
  } catch (err) {
    res.status(500).json({ message: 'Error creating service', error: err });
  }
});

// Route: Get All Bypass Data
app.get('/api/bypass', async (req, res) => {
  try {
    const bypass = await Bypass.find();
    res.status(200).json(bypass);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching bypass data', error: err });
  }
});

// Route: Create New Bypass Entry
app.post('/api/bypass', async (req, res) => {
  try {
    const { name, price } = req.body;
    if (!name || !price) {
      return res.status(400).json({ message: 'Name and price required' });
    }
    const newBypass = new Bypass({ name, price });
    await newBypass.save();
    res.status(201).json(newBypass);
  } catch (err) {
    res.status(500).json({ message: 'Error creating bypass entry', error: err });
  }
});

// Start Server
app.listen(port, () => {
  console.log(`✅ API sukses berjalan di http://localhost:${port}`);
});
