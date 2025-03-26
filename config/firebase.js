const admin = require("firebase-admin");
const serviceAccount = require("../firebase-admin-config.json");

if (!serviceAccount.private_key || !serviceAccount.private_key.includes('BEGIN PRIVATE KEY')) {
  console.error('❌ Invalid private key format');
  process.exit(1);
}

try {
  if (!serviceAccount.private_key || !serviceAccount.client_email) {
    throw new Error("Invalid Firebase configuration");
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://satset-toko-default-rtdb.asia-southeast1.firebasedatabase.app"
  });
  console.log("✅ Firebase initialized successfully");
} catch (error) {
  console.error("❌ Failed to initialize Firebase:", error.message);
  process.exit(1);
}

module.exports = admin;