const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({

  service: "gmail",

  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }

});

async function sendEmail(to, subject, html) {

  const info = await transporter.sendMail({

    from: `"EduBridge 🚀" <${process.env.EMAIL_USER}>`,

    to,
    subject,
    html

  });

  console.log("✅ Email sent:", info.messageId);

  return info;
}

module.exports = sendEmail;
