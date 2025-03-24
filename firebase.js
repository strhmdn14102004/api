const admin = require('firebase-admin');

// Load Service Account
const serviceAccount = require('./test.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

module.exports = { admin, db };
