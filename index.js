require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const app = express();

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later'
});

// Import routes
const authRoutes = require('./routes/authRoutes');
const bypassRoutes = require('./routes/bypassRoutes');
const imeiRoutes = require('./routes/imeiRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const balanceRoutes = require('./routes/balanceRoutes');
const homeRoutes = require('./routes/homeRoutes'); // Tambahkan ini

// Middleware
app.use(cors());
app.use(helmet());
app.use(express.json());
app.use(limiter);

// Database connection
require('./config/database');

// Firebase initialization
require('./config/firebase');

// Midtrans initialization
require('./config/midtrans');

// Telegram initialization
require('./config/telegram');

// Email templates setup
require('./config/email');

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/bypass', bypassRoutes);
app.use('/api/imei', imeiRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/balance', balanceRoutes);
app.use('/api/home', homeRoutes); // Tambahkan ini

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err.stack);
  res.status(500).json({
    success: false,
    message: 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
  console.log('⏰ Server Time:', new Date().toLocaleString());
});