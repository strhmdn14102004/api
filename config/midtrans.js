const midtransClient = require('midtrans-client');

const snap = new midtransClient.Snap({
  isProduction: true,
  serverKey: process.env.MIDTRANS_SERVER_KEY
});

console.log("✅ Midtrans configured");

module.exports = snap;