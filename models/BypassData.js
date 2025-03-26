const mongoose = require('mongoose');

const bypassDataSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true,
    trim: true
  },
  price: { 
    type: Number, 
    required: true,
    min: 0
  }
});

module.exports = mongoose.model('BypassData', bypassDataSchema);