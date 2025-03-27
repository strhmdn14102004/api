const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { 
    type: String, 
    unique: true, 
    required: true,
    trim: true
  },
  password: { 
    type: String, 
    required: true 
  },
  fullName: { 
    type: String, 
    required: true,
    trim: true
  },
  address: { 
    type: String, 
    required: true,
    trim: true
  },
  phoneNumber: { 
    type: String, 
    required: true,
    trim: true
  },
  fcmToken: { 
    type: String 
  }
});

module.exports = mongoose.model('User', userSchema);