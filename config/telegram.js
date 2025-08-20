const axios = require('axios');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendTelegramNotification(message) {
  try {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      console.warn('⚠️ Telegram bot token or chat ID not configured');
      return;
    }

    // Ensure message is not too long for Telegram (max 4096 characters)
    if (message.length > 4096) {
      message = message.substring(0, 4090) + '...';
    }

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const response = await axios.post(url, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    });

    console.log('📤 Telegram notification sent successfully');
    return response.data;
  } catch (error) {
    console.error('❌ Failed to send Telegram notification:', error.response?.data || error.message);
    // Don't throw error to avoid breaking the main flow
    return null;
  }
}

module.exports = sendTelegramNotification;