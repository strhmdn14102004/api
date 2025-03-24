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

// Route: Get All Services
app.get('/api/services', (req, res) => {
  res.status(200).json(services);
});

// Route: Create New Service
app.post('/api/services', (req, res) => {
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

// Start Server
app.listen(port, () => {
  console.log(`API berjalan di http://localhost:${port}`);
});
