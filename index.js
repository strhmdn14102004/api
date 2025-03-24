const express = require('express');
const cors = require('cors');

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Dummy data
let services = [
  { id: 1, name: 'Unblock IMEI 3 Bulan', price: 200000 },
  { id: 2, name: 'Flash Firmware', price: 50000 },
];

let bypass = [
  { id: 1, name: 'iRemoval XR', price: 1500000 },
  { id: 2, name: 'iRemoval XS', price: 1500000 },
  { id: 3, name: 'iRemoval iPhone 13', price: 2500000 },
];

// Route: Get All Services
app.get('/api/imei', (req, res) => {
  res.status(200).json(services);
});

// Route: Create New Service
app.post('/api/imei', (req, res) => {
  const { name, price } = req.body;
  if (!name || !price) {
    return res.status(400).json({ message: 'Name and price required' });
  }
  const newService = {
    id: services.length + 1,
    name,
    price,
  };
  services.push(newService);
  res.status(201).json(newService);
});

// Route: Get All Bypass Data
app.get('/api/bypass', (req, res) => {
  res.status(200).json(bypass);
});

// Route: Create New Bypass Entry
app.post('/api/bypass', (req, res) => {
  const { name, price } = req.body;
  if (!name || !price) {
    return res.status(400).json({ message: 'Name and price required' });
  }
  const newBypass = {
    id: bypass.length + 1,
    name,
    price,
  };
  bypass.push(newBypass);
  res.status(201).json(newBypass);
});

// Start Server
app.listen(port, () => {
  console.log(`Api sukses berjalan di http://localhost:${port}`);
});
