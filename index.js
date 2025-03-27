require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();

// Import routes
const authRoutes = require('./routes/authRoutes');
const bypassRoutes = require('./routes/bypassRoutes');
const fmioffRoutes = require('./routes/fmioffRoutes');
const imeiRoutes = require('./routes/imeiRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

// Middleware
app.use(cors());
app.use(express.json());

// Database connection
require('./config/database');

// Firebase initialization
require('./config/firebase');

// Midtrans initialization
require('./config/midtrans');

// Telegram initialization
require('./config/telegram');

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/bypass', bypassRoutes);
app.use('/api/fmioff', fmioffRoutes);
app.use('/api/imei', imeiRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/notifications', notificationRoutes);

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
  console.log('⏰ Server Time (UTC):', new Date().toISOString());
});