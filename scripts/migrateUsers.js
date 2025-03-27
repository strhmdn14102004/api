require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function migrate() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB');

    // Update existing users
    const users = await User.find({ email: { $exists: false } });
    console.log(`🔍 Found ${users.length} users without email`);
    
    for (const user of users) {
      // Generate email from username if not exists
      if (!user.email) {
        user.email = `${user.username}@sattech.com`;
        await user.save();
        console.log(`🔄 Updated user ${user.username} with email ${user.email}`);
      }
    }

    console.log('🎉 Migration completed');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
}

migrate();