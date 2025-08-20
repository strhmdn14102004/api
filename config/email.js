const nodemailer = require('nodemailer');
const path = require('path');
const ejs = require('ejs');
const sendTelegramNotification = require('./telegram');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_SMTP_HOST,
  port: process.env.EMAIL_SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.EMAIL_AUTH_USERNAME,
    pass: process.env.EMAIL_AUTH_PASSWORD
  }
});

// Verify connection configuration
transporter.verify(function(error, success) {
  if (error) {
    console.error('❌ Email server connection failed:', error);
  } else {
    console.log('✅ Email server is ready to send messages');
  }
});

const sendEmail = async (to, subject, template, data) => {
  try {
    const templatePath = path.join(__dirname, '../templates/emails', `${template}.ejs`);
    const html = await ejs.renderFile(templatePath, data);

    const mailOptions = {
      from: `"${process.env.EMAIL_SENDER_NAME}" <${process.env.EMAIL_AUTH_USERNAME}>`,
      to,
      subject,
      html
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent to ${to}: ${info.messageId}`);
    
    return info;
  } catch (error) {
    console.error('❌ Email sending error:', error);
    
    // Send Telegram notification about email failure
    const telegramMessage = `
📧 <b>EMAIL SENDING FAILED</b> 📧
------------------------
👤 <b>Recipient:</b> ${to}
📋 <b>Subject:</b> ${subject}
⏰ <b>Time:</b> ${new Date().toLocaleString('id-ID')}
❌ <b>Error:</b> ${error.message}
    `;
    
    await sendTelegramNotification(telegramMessage);
    
    throw error;
  }
};

module.exports = {
  sendEmail,
  sendOtpEmail: async (email, otpCode, userName = 'User') => {
    await sendEmail(email, 'Your OTP Verification Code', 'otp', { 
      otpCode, 
      userName 
    });
  },
  sendTransactionEmail: async (email, transaction, user) => {
    await sendEmail(email, `Transaction ${transaction.status.toUpperCase()} - ${transaction.itemType}`, 'transaction', { 
      transaction, 
      user 
    });
  },
  sendResetPasswordEmail: async (email, resetLink, userName = 'User') => {
    await sendEmail(email, 'Password Reset Request', 'reset-password', { 
      resetLink, 
      userName 
    });
  },
  sendWelcomeEmail: async (email, userName) => {
    await sendEmail(email, 'Welcome to Our Service!', 'welcome', { 
      userName 
    });
  }
};