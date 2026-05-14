const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail", // or use SMTP like Outlook / Zoho
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS // app password (NOT normal password)
  }
});

async function sendEmail(to, subject, html) {
  try {
    await transporter.sendMail({
      from: `"EduPlatform 🚀" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html
    });
  } catch (err) {
    console.error("Email Error:", err);
  }
}

module.exports = sendEmail;