const mongoose = require('mongoose');

const imeiDataSchema = new mongoose.Schema({
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

module.exports = mongoose.model('ImeiData', imeiDataSchema);