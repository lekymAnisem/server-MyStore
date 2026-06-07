const nodemailer = require('nodemailer');
const config = require('../config');

const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: false,
  auth: {
    user: config.smtp.user,
    pass: config.smtp.pass,
  },
});

const sendVerificationEmail = async (email, token) => {
  const verificationUrl = `${config.clientUrl}/verify-email/${token}`;
  try {
    await transporter.sendMail({
      from: `"MyStore" <${config.smtp.user}>`,
      to: email,
      subject: 'Verify your email address',
      html: `
        <h1>Email Verification</h1>
        <p>Please click the link below to verify your email address:</p>
        <a href="${verificationUrl}" style="padding:10px 20px;background:#ee4d2d;color:#fff;text-decoration:none;border-radius:5px;">Verify Email</a>
        <p>This link will expire in 24 hours.</p>
      `,
    });
    return true;
  } catch (error) {
    console.error('Email send failed:', error.message);
    return false;
  }
};

const sendPasswordResetEmail = async (email, token) => {
  const resetUrl = `${config.clientUrl}/reset-password/${token}`;
  try {
    await transporter.sendMail({
      from: `"MyStore" <${config.smtp.user}>`,
      to: email,
      subject: 'Password Reset Request',
      html: `
        <h1>Reset Your Password</h1>
        <p>Click the link below to reset your password:</p>
        <a href="${resetUrl}" style="padding:10px 20px;background:#ee4d2d;color:#fff;text-decoration:none;border-radius:5px;">Reset Password</a>
        <p>This link will expire in 1 hour.</p>
      `,
    });
    return true;
  } catch (error) {
    console.error('Email send failed:', error.message);
    return false;
  }
};

module.exports = { sendVerificationEmail, sendPasswordResetEmail };
