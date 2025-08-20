const nodemailer = require('nodemailer');
const path = require('path');
const ejs = require('ejs');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_SMTP_HOST,
  port: process.env.EMAIL_SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.EMAIL_AUTH_USERNAME,
    pass: process.env.EMAIL_AUTH_PASSWORD
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

    await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent to ${to}`);
  } catch (error) {
    console.error('❌ Email sending error:', error);
    // Don't throw error to avoid breaking the main flow
  }
};

module.exports = {
  sendEmail,
  sendOtpEmail: async (email, otpCode) => {
    await sendEmail(email, 'Your OTP Code', 'otp', { otpCode });
  },
  sendTransactionEmail: async (email, transaction, user) => {
    await sendEmail(email, `Transaction ${transaction.status}`, 'transaction', { transaction, user });
  },
  sendResetPasswordEmail: async (email, resetLink) => {
    await sendEmail(email, 'Password Reset Request', 'reset-password', { resetLink });
  }
};