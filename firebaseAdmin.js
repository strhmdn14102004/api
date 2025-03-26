const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('././firebase_admin.json'); // Or use environment variables

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  // databaseURL: 'your-database-url' // If using Firebase Realtime Database
});

module.exports = admin;