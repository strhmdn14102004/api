var admin = require("firebase-admin");

var serviceAccount = require("././secret.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://satset-toko-default-rtdb.asia-southeast1.firebasedatabase.app"
});
