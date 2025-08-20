const axios = require('axios');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendTelegramNotification(message) {
  try {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      console.warn('⚠️ Telegram bot token or chat ID not configured');
      return;
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
    // Don't throw error to prevent breaking the main flow
    return null;
  }
}

// New function for sending formatted transaction notifications
async function sendFormattedTransactionNotification(data) {
  const {
    transactionId,
    customerName,
    customerEmail,
    customerPhone,
    productName,
    amount,
    status,
    paymentUrl = null,
    transactionType
  } = data;

  let emoji = '';
  let statusText = '';

  switch (status) {
    case 'success':
      emoji = '✅';
      statusText = 'SUCCESS';
      break;
    case 'failed':
      emoji = '❌';
      statusText = 'FAILED';
      break;
    case 'pending':
      emoji = '⏳';
      statusText = 'PENDING';
      break;
    default:
      emoji = '📋';
      statusText = status.toUpperCase();
  }

  const message = `
${getTransactionEmoji(transactionType)} <b>${transactionType.toUpperCase()} TRANSACTION</b> ${getTransactionEmoji(transactionType)}
------------------------
📌 <b>ID:</b> ${transactionId}
👤 <b>Customer:</b> ${customerName || 'N/A'}
📧 <b>Email:</b> ${customerEmail || 'N/A'}
📱 <b>Phone:</b> ${customerPhone || 'N/A'}
${productName ? `🛍️ <b>Product:</b> ${productName}` : ''}
💰 <b>Amount:</b> Rp${amount.toLocaleString('id-ID')}
📅 <b>Time:</b> ${new Date().toLocaleString('id-ID')}
${paymentUrl ? `🔗 <b>Payment Link:</b> <a href="${paymentUrl}">Click here</a>` : ''}
------------------------
<b>Status:</b> <i>${statusText}</i> ${emoji}
  `;

  return await sendTelegramNotification(message);
}

function getTransactionEmoji(type) {
  switch (type) {
    case 'topup': return '💰';
    case 'withdrawal': return '💸';
    case 'transfer': return '🔄';
    case 'imei': return '📱';
    case 'bypass': return '🔓';
    default: return '🛒';
  }
}

module.exports = {
  sendTelegramNotification,
  sendFormattedTransactionNotification
};