const nodemailer = require("nodemailer");
const dns = require("dns");

dns.setDefaultResultOrder("ipv4first");

const transporter = nodemailer.createTransport({

  host: "smtp.gmail.com",

  port: 587,

  secure: false,

  auth: {

    user: process.env.EMAIL_USER,

    pass: process.env.EMAIL_PASS

  },

  family: 4

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
